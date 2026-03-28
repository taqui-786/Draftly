import { z } from "zod";
import { normalizeStyleSample } from "@/lib/style-engine";
import {
  buildRssPrompt,
  extractOfficialTweetUrl,
  fetchRssEntries,
  prepareScrapeCandidates,
} from "@/lib/rss";
import {  generateTweetsWithRetry } from "@/lib/tweet-generator";
import {
  attachSourcesToRun,
  createGenerationRun,
  getFeedById,
  getOrCreateStyleProfile,
  pickSourcesForGeneration,
  persistGeneratedTweets,
  upsertScrapedSources,
} from "@/lib/storage";
import { getOrCreateVisitorId } from "@/lib/visitor-session";

const requestSchema = z.object({
  feedId: z.string().trim().min(3),
});

export const maxDuration = 30;

export async function POST(req: Request) {
  if (!process.env.AI_GATEWAY_API_KEY) {
    return Response.json({ error: "AI API key is missing on the server." }, { status: 500 });
  }

  const json = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);

  if (!parsed.success) {
    return Response.json({ error: "A valid feed is required." }, { status: 400 });
  }

  try {
    const visitorId = await getOrCreateVisitorId();
    const [styleProfile, feed] = await Promise.all([
      getOrCreateStyleProfile(visitorId),
      getFeedById(parsed.data.feedId),
    ]);

    if (!feed) {
      return Response.json({ error: "Selected feed is not available." }, { status: 404 });
    }

    const rawEntries = await fetchRssEntries(feed.url, 16);
    if (rawEntries.length === 0) {
      return Response.json({ error: "No entries found in this RSS feed." }, { status: 422 });
    }

    const nicheCandidates = prepareScrapeCandidates(rawEntries);
    if (nicheCandidates.length === 0) {
      return Response.json(
        {
          error:
            "Feed scraped successfully, but no niche-relevant items were found for software/design/web-dev/AI-job topics.",
        },
        { status: 422 },
      );
    }

    await upsertScrapedSources(feed.id, nicheCandidates);
    const selectedSources = await pickSourcesForGeneration(visitorId, feed.id, 5);

    if (selectedSources.length === 0) {
      return Response.json(
        { error: "No eligible sources are available for generation." },
        { status: 422 },
      );
    }

    const promptEntries = selectedSources.map((source) => {
      const officialTweetUrl = extractOfficialTweetUrl({
        sourceUrl: source.sourceUrl,
        decodedUrl: source.decodedUrl,
        canonicalUrl: source.canonicalUrl,
        summary: source.summary,
      });

      return {
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
        officialTweetUrl,
      };
    });

    const requestPrompt = buildRssPrompt(feed.name, promptEntries);
    const tweets = await generateTweetsWithRetry(
      requestPrompt,
      normalizeStyleSample(styleProfile.tweets),
    );

    const run = await createGenerationRun({
      visitorId,
      sourceType: "rss",
      sourcePrompt: requestPrompt,
      feedId: feed.id,
      model: 'taqui',
      metadata: {
        feedName: feed.name,
        sourceCount: selectedSources.length,
        scrapedCount: rawEntries.length,
        nicheRelevantCount: nicheCandidates.length,
      },
    });

    await persistGeneratedTweets(run.id, tweets);
    await attachSourcesToRun(
      run.id,
      selectedSources.map((source) => source.id),
    );

    return Response.json({
      runId: run.id,
      feed: {
        id: feed.id,
        name: feed.name,
      },
      sourceEntries: selectedSources.map((source) => ({
        id: source.id,
        title: source.title,
        link: source.sourceUrl,
        decodedUrl: source.decodedUrl,
        canonicalUrl: source.canonicalUrl,
        officialTweetUrl: extractOfficialTweetUrl({
          sourceUrl: source.sourceUrl,
          decodedUrl: source.decodedUrl,
          canonicalUrl: source.canonicalUrl,
          summary: source.summary,
        }),
        publishedAt: source.publishedAt?.toISOString() ?? "",
        summary: source.summary,
        relevanceScore: source.relevanceScore,
        nicheTopics: source.nicheTopics,
      })),
      scrapeStats: {
        scraped: rawEntries.length,
        nicheRelevant: nicheCandidates.length,
        selectedForGeneration: selectedSources.length,
      },
      tweets,
    });
  } catch (error) {
    console.error("Feed generation failed:", error);
    return Response.json({ error: "Failed to generate tweets from RSS." }, { status: 502 });
  }
}
