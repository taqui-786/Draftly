import { z } from "zod";
import { generateThread } from "@/lib/thread-generator";
import { getOrCreateStyleProfile, createGenerationRun, persistGeneratedTweets } from "@/lib/storage";
import { getOrCreateVisitorId } from "@/lib/visitor-session";
import { normalizeStyleSample } from "@/lib/style-engine";

export const maxDuration = 30;

const requestSchema = z.object({
  topic: z.string().trim().min(5).max(3000),
  threadLength: z.number().int().min(2).max(5).default(3),
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
      { error: "Provide a topic and valid thread length (2-5)." },
      { status: 400 },
    );
  }

  try {
    const visitorId = await getOrCreateVisitorId();
    const styleProfile = await getOrCreateStyleProfile(visitorId);
    const styleSample = normalizeStyleSample(styleProfile.tweets);

    const threadTweets = await generateThread({
      topic: parsed.data.topic,
      threadLength: parsed.data.threadLength,
      styleSample,
    });

    const run = await createGenerationRun({
      visitorId,
      sourceType: "manual",
      sourcePrompt: `Thread: ${parsed.data.topic}`,
      model: "thread-generator",
      metadata: {
        type: "thread",
        threadLength: threadTweets.length,
      },
    });

    await persistGeneratedTweets(
      run.id,
      threadTweets.map((t) => ({
        text: t.text,
        rationale: `Thread part ${t.position}/${threadTweets.length}`,
        charCount: t.charCount,
      })),
    );

    return Response.json({
      tweets: threadTweets,
      runId: run.id,
      threadLength: threadTweets.length,
    });
  } catch (error) {
    console.error("Thread generation failed:", error);
    return Response.json(
      { error: "Failed to generate thread. Please try again." },
      { status: 502 },
    );
  }
}
