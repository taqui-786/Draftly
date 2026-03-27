import { z } from "zod";
import { normalizeStyleSample } from "@/lib/style-engine";
import {  generateTweetsWithRetry } from "@/lib/tweet-generator";
import { createGenerationRun, getOrCreateStyleProfile, persistGeneratedTweets } from "@/lib/storage";
import { getOrCreateVisitorId } from "@/lib/visitor-session";

export const maxDuration = 30;

const requestSchema = z.object({
  prompt: z.string().trim().min(5).max(3000),
  styleSample: z
    .array(
      z.object({
        id: z.number(),
        tweet: z.string(),
      }),
    )
    .optional(),
});

export async function POST(req: Request) {
  if (!process.env.AI_GATEWAY_API_KEY) {
    return Response.json(
      { error: "AI API key is missing on the server." },
      { status: 500 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input. Provide a tweet request and optional style sample." },
      { status: 400 },
    );
  }

  try {
    const visitorId = await getOrCreateVisitorId();
    const styleProfile = await getOrCreateStyleProfile(visitorId);
    const styleSample = normalizeStyleSample(parsed.data.styleSample ?? styleProfile.tweets);

    const tweets = await generateTweetsWithRetry(parsed.data.prompt, styleSample);

    const run = await createGenerationRun({
      visitorId,
      sourceType: "manual",
      sourcePrompt: parsed.data.prompt,
      model: 'qwen/qwen3-coder-30b-a3b-instruct',
      metadata: {
        styleProfileId: styleProfile.id,
      },
    });

    await persistGeneratedTweets(run.id, tweets);

    return Response.json({
      tweets,
      runId: run.id,
    });
  } catch (error) {
    console.error("Tweet generation failed:", error);

    return Response.json(
      { error: "Failed to generate tweets. Please try again." },
      { status: 502 },
    );
  }
}
