import { generateTopicSuggestions } from "@/lib/topic-suggester";
import { getOrCreateStyleProfile, listActiveFeeds } from "@/lib/storage";
import { getOrCreateVisitorId } from "@/lib/visitor-session";
import { normalizeStyleSample } from "@/lib/style-engine";
import { fetchRssEntries, prepareScrapeCandidates } from "@/lib/rss";

export async function GET() {
  try {
    const visitorId = await getOrCreateVisitorId();
    const [styleProfile, feeds] = await Promise.all([
      getOrCreateStyleProfile(visitorId),
      listActiveFeeds(),
    ]);

    const styleSample = normalizeStyleSample(styleProfile.tweets);

    let rssEntries: Awaited<ReturnType<typeof prepareScrapeCandidates>> = [];

    for (const feed of feeds.slice(0, 3)) {
      try {
        const entries = await fetchRssEntries(feed.url, 8);
        const candidates = prepareScrapeCandidates(entries);
        rssEntries = [...rssEntries, ...candidates];
      } catch {
        continue;
      }
    }

    const suggestions = await generateTopicSuggestions({
      styleSample,
      rssEntries: rssEntries.slice(0, 10),
    });

    return Response.json({ suggestions });
  } catch (error) {
    console.error("Topic suggestions failed:", error);
    return Response.json(
      { error: "Failed to generate topic suggestions." },
      { status: 500 },
    );
  }
}
