import { z } from "zod";
import { refineTweet } from "@/lib/tweet-refiner";
import { getOrCreateStyleProfile } from "@/lib/storage";
import { getOrCreateVisitorId } from "@/lib/visitor-session";
import { normalizeStyleSample } from "@/lib/style-engine";

export const maxDuration = 30;

const requestSchema = z.object({
  originalTweet: z.string().trim().min(1).max(280),
  refinementInstruction: z.string().trim().min(2).max(200),
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
      { error: "Provide original tweet and refinement instruction." },
      { status: 400 },
    );
  }

  try {
    const visitorId = await getOrCreateVisitorId();
    const styleProfile = await getOrCreateStyleProfile(visitorId);
    const styleSample = normalizeStyleSample(styleProfile.tweets);

    const refinedTweet = await refineTweet({
      originalTweet: parsed.data.originalTweet,
      refinementInstruction: parsed.data.refinementInstruction,
      styleSample,
    });

    return Response.json({ refinedTweet });
  } catch (error) {
    console.error("Tweet refinement failed:", error);
    return Response.json(
      { error: "Failed to refine tweet. Please try again." },
      { status: 502 },
    );
  }
}
