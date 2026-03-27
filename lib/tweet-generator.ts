import { z } from "zod";
import {
  buildTweetPrompt,
  inferStyleProfile,
  normalizeStyleSample,
  repairTweetFormatting,
  type StyleTweet,
  validateTweetStyleFormat,
} from "@/lib/style-engine";
import { mainModel } from "./ai";
import { generateText } from "ai";

const tweetSchema = z.object({
  text: z
    .string()
    .trim()
    .min(8)
    .max(280)
    .describe("Tweet draft text that mirrors user examples and preserves line breaks."),
  rationale: z
    .string()
    .trim()
    .min(8)
    .max(160)
    .describe("One short sentence describing why this angle differs."),
});

// Lenient schema for raw AI output — allows longer text that we truncate later
const rawTweetSchema = z.object({
  text: z.string().trim().min(1),
  rationale: z.string().trim().min(1),
});

const rawOutputSchema = z.object({
  tweets: z.array(rawTweetSchema).length(3),
});

const outputSchema = z.object({
  tweets: z.array(tweetSchema).length(3),
});

type RawTweetOutput = z.infer<typeof rawOutputSchema>;
type TweetOutput = z.infer<typeof outputSchema>;

export type GeneratedTweetDraft = {
  id: string;
  text: string;
  rationale: string;
  charCount: number;
};


const MAX_ATTEMPTS = 3;

const JSON_SYSTEM_PROMPT = `You are a tweet writing assistant. Always respond with ONLY a valid JSON object — no markdown, no extra text — matching this schema exactly:
{"tweets":[{"text":"<tweet text>","rationale":"<one sentence rationale>"},{"text":"...","rationale":"..."},{"text":"...","rationale":"..."}]}`;

function truncateTweet(text: string, maxLength = 280): string {
  if (text.length <= maxLength) return text;
  // Try to truncate at the last word boundary before the limit
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  const lastNewline = truncated.lastIndexOf('\n');
  const breakPoint = Math.max(lastSpace, lastNewline);
  return breakPoint > maxLength * 0.6 ? truncated.slice(0, breakPoint).trimEnd() : truncated.trimEnd();
}

async function callNvidiaAPI(userPrompt: string): Promise<RawTweetOutput> {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error("AI_GATEWAY_API_KEY is not set.");

  // const response = await fetch(NVIDIA_API_URL, {
  //   method: "POST",
  //   headers: {
  //     Authorization: `Bearer ${apiKey}`,
  //     "Content-Type": "application/json",
  //     Accept: "application/json",
  //   },
  //   body: JSON.stringify({
  //     model: ACTIVE_MODEL,
  //     messages: [
  //       { role: "system", content: JSON_SYSTEM_PROMPT },
  //       { role: "user", content: userPrompt },
  //     ],
  //     max_tokens: 2000,
  //     temperature: 0.7,
  //     top_p: 0.95,
  //   }),
  // });

  // if (!response.ok) {
  //   const body = await response.text();
  //   throw new Error(`NVIDIA API error ${response.status}: ${body}`);
  // }

  // const data = await response.json() as {
  //   choices: Array<{ message: { content: string } }>;
  // };
const response = await generateText({
  model: mainModel,
  system: JSON_SYSTEM_PROMPT,
prompt:userPrompt,
  
  temperature: 0.7,
  topP: 0.95,
  
  
});
  const content = response.text;

  // Strip any markdown code fences the model might add
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  const parsed = JSON.parse(cleaned) as unknown;
  return rawOutputSchema.parse(parsed);
}

export async function generateTweetsWithRetry(prompt: string, styleSample: StyleTweet[]) {
  const normalizedStyle = normalizeStyleSample(styleSample);
  const styleProfile = inferStyleProfile(normalizedStyle);
  let previousFailureReason: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const userPrompt = buildTweetPrompt({
        request: prompt,
        styleSample: normalizedStyle,
        attempt,
        previousFailureReason,
      });

      const raw = await callNvidiaAPI(userPrompt);

      const repairedOutput: TweetOutput = {
        tweets: raw.tweets.map((tweet) => ({
          ...tweet,
          text: truncateTweet(repairTweetFormatting(tweet.text, styleProfile)),
          rationale: tweet.rationale.slice(0, 160),
        })),
      };

      const styleFailureReason = validateTweetStyleFormat(
        repairedOutput.tweets.map((tweet) => tweet.text),
        styleProfile,
      );

      if (!styleFailureReason || attempt === MAX_ATTEMPTS) {
        return repairedOutput.tweets.map((tweet, index) => ({
          id: `tweet-${index + 1}`,
          text: tweet.text,
          rationale: tweet.rationale,
          charCount: tweet.text.length,
        })) satisfies GeneratedTweetDraft[];
      }

      previousFailureReason = styleFailureReason;
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) throw error;
      previousFailureReason =
        error instanceof Error ? error.message : "Structured output did not match schema.";
    }
  }

  throw new Error("Failed to generate tweets.");
}
