import { fetchRssEntries, prepareScrapeCandidates, buildRssPrompt } from "@/lib/rss";
import { generateTweetsWithRetry } from "@/lib/tweet-generator";
import { normalizeStyleSample } from "@/lib/style-engine";
import {
  attachSourcesToRun,
  createGenerationRun,
  getOrCreateStyleProfile,
  listActiveFeeds,
  persistGeneratedTweets,
  pickSourcesForGeneration,
  upsertScrapedSources,
} from "@/lib/storage";

export const maxDuration = 60;

export async function GET() {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = new Headers().get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const feeds = await listActiveFeeds();
    const results: { feedName: string; tweetsGenerated: number; error?: string }[] = [];

    for (const feed of feeds) {
      try {
        const visitorId = `cron-${feed.id}`;
        const styleProfile = await getOrCreateStyleProfile(visitorId);

        const rawEntries = await fetchRssEntries(feed.url, 16);
        if (rawEntries.length === 0) {
          results.push({ feedName: feed.name, tweetsGenerated: 0, error: "No entries found" });
          continue;
        }

        const candidates = prepareScrapeCandidates(rawEntries);
        if (candidates.length === 0) {
          results.push({ feedName: feed.name, tweetsGenerated: 0, error: "No relevant entries" });
          continue;
        }

        await upsertScrapedSources(feed.id, candidates);
        const selectedSources = await pickSourcesForGeneration(visitorId, feed.id, 5);
        if (selectedSources.length === 0) {
          results.push({ feedName: feed.name, tweetsGenerated: 0, error: "No eligible sources" });
          continue;
        }

        const promptEntries = selectedSources.map((source) => ({
          title: source.title,
          link: source.sourceUrl,
          publishedAt: source.publishedAt?.toISOString() ?? "",
          summary: source.summary,
          decodedUrl: source.decodedUrl,
          canonicalUrl: source.canonicalUrl,
          urlHash: source.urlHash,
          contentHash: source.contentHash,
          nicheTopics: source.nicheTopics,
          relevanceScore: source.relevanceScore,
          publishedAtDate: source.publishedAt,
          officialTweetUrl: null,
        }));

        const requestPrompt = buildRssPrompt(feed.name, promptEntries);
        const tweets = await generateTweetsWithRetry(
          requestPrompt,
          normalizeStyleSample(styleProfile.tweets),
        );

        const run = await createGenerationRun({
          visitorId: "cron-system",
          sourceType: "rss",
          sourcePrompt: requestPrompt,
          feedId: feed.id,
          model: "cron-auto-generator",
          metadata: {
            feedName: feed.name,
            sourceCount: selectedSources.length,
            scrapedCount: rawEntries.length,
            nicheRelevantCount: candidates.length,
            scheduled: true,
          },
        });

        await persistGeneratedTweets(run.id, tweets);
        await attachSourcesToRun(
          run.id,
          selectedSources.map((source) => source.id),
        );

        results.push({ feedName: feed.name, tweetsGenerated: tweets.length });
      } catch (error) {
        console.error(`Cron job failed for feed ${feed.name}:`, error);
        results.push({ feedName: feed.name, tweetsGenerated: 0, error: (error as Error).message });
      }
    }

    return Response.json({
      scheduled: true,
      timestamp: new Date().toISOString(),
      feedsProcessed: results.length,
      results,
    });
  } catch (error) {
    console.error("Cron generation failed:", error);
    return Response.json(
      { error: "Scheduled generation failed." },
      { status: 500 },
    );
  }
}
