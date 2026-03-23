import { z } from "zod";
import { type StyleTweet } from "@/lib/style-engine";
import { getOrCreateStyleProfile, updateStyleProfileTweets } from "@/lib/storage";
import { getOrCreateVisitorId } from "@/lib/visitor-session";

const updateStyleSchema = z.object({
  tweets: z
    .array(
      z.object({
        id: z.number().optional(),
        tweet: z.string().trim().min(8).max(1000),
      }),
    )
    .min(3)
    .max(20),
});

export async function GET() {
  try {
    const visitorId = await getOrCreateVisitorId();
    const profile = await getOrCreateStyleProfile(visitorId);

    return Response.json({
      profileId: profile.id,
      tweets: profile.tweets,
    });
  } catch (error) {
    console.error("Style fetch failed:", error);
    return Response.json({ error: "Failed to load style profile." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = updateStyleSchema.safeParse(json);

  if (!parsed.success) {
    return Response.json(
      { error: "Provide 3 to 20 valid style tweets." },
      { status: 400 },
    );
  }

  try {
    const visitorId = await getOrCreateVisitorId();
    const tweets: StyleTweet[] = parsed.data.tweets.map((tweet, index) => ({
      id: index + 1,
      tweet: tweet.tweet.trim(),
    }));
    const profile = await updateStyleProfileTweets(visitorId, tweets);

    return Response.json({
      profileId: profile.id,
      tweets: profile.tweets,
    });
  } catch (error) {
    console.error("Style update failed:", error);
    return Response.json({ error: "Failed to update style profile." }, { status: 500 });
  }
}
