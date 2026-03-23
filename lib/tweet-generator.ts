import { z } from "zod";
import {
  buildTweetPrompt,
  inferStyleProfile,
  normalizeStyleSample,
  repairTweetFormatting,
  type StyleTweet,
  validateTweetStyleFormat,
} from "@/lib/style-engine";

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

const outputSchema = z.object({
  tweets: z.array(tweetSchema).length(3),
});

type TweetOutput = z.infer<typeof outputSchema>;

export type GeneratedTweetDraft = {
  id: string;
  text: string;
  rationale: string;
  charCount: number;
};

const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
export const ACTIVE_MODEL = process.env.AI_MODEL ?? "meta/llama-3.1-70b-instruct";
const MAX_ATTEMPTS = 3;

const JSON_SYSTEM_PROMPT = `You are a tweet writing assistant. Always respond with ONLY a valid JSON object — no markdown, no extra text — matching this schema exactly:
{"tweets":[{"text":"<tweet text>","rationale":"<one sentence rationale>"},{"text":"...","rationale":"..."},{"text":"...","rationale":"..."}]}`;

async function callNvidiaAPI(userPrompt: string): Promise<TweetOutput> {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error("AI_GATEWAY_API_KEY is not set.");

  const response = await fetch(NVIDIA_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: ACTIVE_MODEL,
      messages: [
        { role: "system", content: JSON_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 900,
      temperature: 0.7,
      top_p: 0.95,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`NVIDIA API error ${response.status}: ${body}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices?.[0]?.message?.content ?? "";

  // Strip any markdown code fences the model might add
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  const parsed = JSON.parse(cleaned) as unknown;
  return outputSchema.parse(parsed);
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
          text: repairTweetFormatting(tweet.text, styleProfile),
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
