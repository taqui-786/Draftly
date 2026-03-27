import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { getOrCreateStyleProfile } from "@/lib/storage";
import type { StyleTweet } from "@/lib/style-engine";

export const nim = createOpenAICompatible({
  name: "nim",
  baseURL: "https://integrate.api.nvidia.com/v1",
  headers: {
    Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}`,
  },
});
// export const helperModel = nim.chatModel("meta/llama-3.1-70b-instruct");
// export const mainModel = nim.chatModel("deepseek-ai/deepseek-v3.1"); // working ✅ fast
// export const mainModel = nim.chatModel("stepfun-ai/step-3.5-flash"); // working ✅ medium
// export const mainModel = nim.chatModel("moonshotai/kimi-k2-instruct"); // working ✅ fast
export const mainModel = nim.chatModel("moonshotai/kimi-k2-instruct-0905"); // working ✅ fast
// export const mainModel = nim.chatModel("qwen/qwq-32b"); // working ✅ fast + Thinking

export type ToolPipelineInput = {
  prompt: string;
  visitorId: string;
};

export type ToolPipelineResult = {
  tweet: string;
  steps: {
    draft: string;
    polished: string;
    viral: string;
  };
};

function normalizeTweet(text: string): string {
  const cleaned = text.trim().replace(/^["'`]+|["'`]+$/g, "");
  if (cleaned.length <= 280) return cleaned;
  const hardLimit = cleaned.slice(0, 280);
  const breakPoint = Math.max(hardLimit.lastIndexOf(" "), hardLimit.lastIndexOf("\n"));
  return (breakPoint > 180 ? hardLimit.slice(0, breakPoint) : hardLimit).trim();
}

function toStyleTweets(raw: unknown): StyleTweet[] {
  if (!Array.isArray(raw)) return [];

  const out: StyleTweet[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as { id?: unknown; tweet?: unknown };
    if (typeof row.tweet !== "string") continue;

    out.push({
      id: typeof row.id === "number" ? row.id : out.length + 1,
      tweet: row.tweet.trim(),
    });
  }

  return out.filter((item) => item.tweet.length > 0);
}

function styleSampleAsText(styleSample: StyleTweet[]): string {
  return styleSample
    .slice(0, 12)
    .map((item, index) => `${index + 1}. ${item.tweet}`)
    .join("\n\n");
}

type StepLike = {
  toolResults: Array<{
    toolName: string;
    output?: unknown;
  }>;
};

function extractToolStringOutput<T extends Record<string, unknown>>(
  steps: StepLike[],
  toolName: string,
  field: keyof T,
): string {
  for (const step of steps) {
    for (const result of step.toolResults) {
      if (result.toolName !== toolName) continue;
      if (!result.output || typeof result.output !== "object") continue;
      const value = (result.output as T)[field];
      if (typeof value === "string") return value;
    }
  }

  return "";
}

export async function generateTweetWithToolPipeline({
  prompt,
  visitorId,
}: ToolPipelineInput): Promise<ToolPipelineResult> {
  const writeTweetTool = tool({
    description: "Write a first tweet draft based on the user intent.",
    inputSchema: z.object({
      intent: z.string().min(3).describe("What the user wants to say in this tweet."),
    }),
    execute: async ({ intent }) => {
      const { text } = await generateText({
        model: mainModel,
        system:
          "Write one natural tweet draft. Return only the tweet text. Max 280 characters. No hashtags unless explicitly requested.",
        prompt: `User intent:\n${intent}`,
      });

      return { draft: normalizeTweet(text) };
    },
  });

  const polishTweetWithUserStyleTool = tool({
    description:
      "Polish a draft tweet so it matches the user's exact personal writing tone and formatting style.",
    inputSchema: z.object({
      draft: z.string().min(3),
      intent: z.string().min(3),
    }),
    execute: async ({ draft, intent }) => {
      const profile = await getOrCreateStyleProfile(visitorId);
      const styleSample = toStyleTweets(profile.tweets);

      const { text } = await generateText({
        model: mainModel,
        system:
          "Rewrite the draft in the user's exact writing tone and formatting style. Return only the rewritten tweet. Max 280 characters.",
        prompt: [
          `User intent:\n${intent}`,
          `Current draft:\n${draft}`,
          `User style examples:\n${styleSampleAsText(styleSample)}`,
        ].join("\n\n"),
      });

      return { polished: normalizeTweet(text) };
    },
  });

  const viralizeTweetWithUserStyleTool = tool({
    description:
      "Make the polished user-style tweet more viral while preserving the same tone and sounding natural.",
    inputSchema: z.object({
      polished: z.string().min(3),
      intent: z.string().min(3),
    }),
    execute: async ({ polished, intent }) => {
      const profile = await getOrCreateStyleProfile(visitorId);
      const styleSample = toStyleTweets(profile.tweets);

      const { text } = await generateText({
        model: mainModel,
        system:
          "Improve hook and shareability while preserving user's exact tone. Keep it human, natural, and under 280 characters. Return only the final tweet.",
        prompt: [
          `User intent:\n${intent}`,
          `Polished tweet:\n${polished}`,
          `User style examples:\n${styleSampleAsText(styleSample)}`,
        ].join("\n\n"),
      });

      return { viral: normalizeTweet(text) };
    },
  });

  const result = await generateText({
    model: mainModel,
    system: `You are a tweet generation orchestrator.
Follow this flow exactly:
1) Understand the user's request and create a concise intent.
2) Call writeTweet with that intent.
3) Call polishTweetWithUserStyle using the previous draft and same intent.
4) Call viralizeTweetWithUserStyle using the polished tweet and same intent.
5) Return ONLY the final tweet text.`,
    prompt,
    tools: {
      writeTweet: writeTweetTool,
      polishTweetWithUserStyle: polishTweetWithUserStyleTool,
      viralizeTweetWithUserStyle: viralizeTweetWithUserStyleTool,
    },
    stopWhen: stepCountIs(4),
    prepareStep: ({ stepNumber }) => {
      if (stepNumber === 0) {
        return { activeTools: ["writeTweet"], toolChoice: "required" };
      }
      if (stepNumber === 1) {
        return { activeTools: ["polishTweetWithUserStyle"], toolChoice: "required" };
      }
      if (stepNumber === 2) {
        return { activeTools: ["viralizeTweetWithUserStyle"], toolChoice: "required" };
      }
      return { toolChoice: "none" };
    },
  });

  const draft = extractToolStringOutput<{ draft: string }>(result.steps, "writeTweet", "draft");
  const polished = extractToolStringOutput<{ polished: string }>(
    result.steps,
    "polishTweetWithUserStyle",
    "polished",
  );
  const viral = extractToolStringOutput<{ viral: string }>(
    result.steps,
    "viralizeTweetWithUserStyle",
    "viral",
  );
const finalResult = {
    tweet: normalizeTweet(result.text || viral || polished || draft),
    steps: {
      draft,
      polished,
      viral,
    },
  };
  console.log(finalResult);
  
  return finalResult; 
}



// generateTweetWithToolPipeline({
//   prompt: "A personal note on shipping before perfecting",
//   visitorId: "1",
// })

