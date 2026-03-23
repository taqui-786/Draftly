import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { DEFAULT_RSS_FEEDS } from "@/lib/defaults";
import type { ScrapedCandidate } from "@/lib/rss";
import { USER_STYLE_SAMPLE, type StyleTweet } from "@/lib/style-engine";
import {
  generatedTweets,
  generationRuns,
  generationRunSources,
  rssFeeds,
  scrapedSources,
  styleProfiles,
} from "@/drizzle/schema";

export type PersistedTweetDraft = {
  text: string;
  rationale: string;
  charCount: number;
};

export async function getOrCreateStyleProfile(visitorId: string) {
  const existing = await db.query.styleProfiles.findFirst({
    where: eq(styleProfiles.visitorId, visitorId),
  });

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(styleProfiles)
    .values({
      id: crypto.randomUUID(),
      visitorId,
      tweets: USER_STYLE_SAMPLE,
      name: "Default Style",
    })
    .returning();

  return created;
}

export async function updateStyleProfileTweets(visitorId: string, tweets: StyleTweet[]) {
  const now = new Date();
  const normalizedTweets = tweets.map((tweet, index) => ({
    id: index + 1,
    tweet: tweet.tweet.trim(),
  }));

  const existing = await db.query.styleProfiles.findFirst({
    where: eq(styleProfiles.visitorId, visitorId),
  });

  if (!existing) {
    const [created] = await db
      .insert(styleProfiles)
      .values({
        id: crypto.randomUUID(),
        visitorId,
        name: "Default Style",
        tweets: normalizedTweets,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  }

  const [updated] = await db
    .update(styleProfiles)
    .set({
      tweets: normalizedTweets,
      updatedAt: now,
    })
    .where(eq(styleProfiles.id, existing.id))
    .returning();

  return updated;
}

export async function ensureDefaultFeeds() {
  await db
    .insert(rssFeeds)
    .values(
      DEFAULT_RSS_FEEDS.map((feed) => ({
        id: feed.id,
        name: feed.name,
        url: feed.url,
        category: feed.category,
        isActive: true,
      })),
    )
    .onConflictDoNothing({ target: rssFeeds.id });
}

export async function listActiveFeeds() {
  await ensureDefaultFeeds();
  return db
    .select()
    .from(rssFeeds)
    .where(eq(rssFeeds.isActive, true))
    .orderBy(asc(rssFeeds.name));
}

export async function addFeed(input: { name: string; url: string; category?: string }) {
  const [created] = await db
    .insert(rssFeeds)
    .values({
      id: `feed-${crypto.randomUUID()}`,
      name: input.name.trim(),
      url: input.url.trim(),
      category: input.category?.trim() || "Tech",
      isActive: true,
    })
    .returning();

  return created;
}

export async function createGenerationRun(input: {
  visitorId: string;
  sourceType: "manual" | "rss";
  sourcePrompt: string;
  model: string;
  feedId?: string;
  metadata?: Record<string, unknown>;
}) {
  const [created] = await db
    .insert(generationRuns)
    .values({
      id: crypto.randomUUID(),
      visitorId: input.visitorId,
      sourceType: input.sourceType,
      sourcePrompt: input.sourcePrompt,
      model: input.model,
      feedId: input.feedId,
      metadata: input.metadata,
      status: "completed",
    })
    .returning();

  return created;
}

export async function persistGeneratedTweets(runId: string, tweets: PersistedTweetDraft[]) {
  await db.insert(generatedTweets).values(
    tweets.map((tweet, index) => ({
      id: crypto.randomUUID(),
      runId,
      position: index + 1,
      text: tweet.text,
      rationale: tweet.rationale,
      charCount: tweet.charCount,
    })),
  );
}

export async function getFeedById(feedId: string) {
  const [feed] = await db
    .select()
    .from(rssFeeds)
    .where(and(eq(rssFeeds.id, feedId), eq(rssFeeds.isActive, true)));
  return feed ?? null;
}

export async function upsertScrapedSources(feedId: string, candidates: ScrapedCandidate[]) {
  if (candidates.length === 0) {
    return [];
  }

  const now = new Date();
  const existing = await db
    .select()
    .from(scrapedSources)
    .where(inArray(scrapedSources.urlHash, candidates.map((candidate) => candidate.urlHash)));

  const byUrlHash = new Map(existing.map((item) => [item.urlHash, item]));
  const persisted: typeof scrapedSources.$inferSelect[] = [];

  for (const candidate of candidates) {
    const match = byUrlHash.get(candidate.urlHash);
    if (match) {
      const [updated] = await db
        .update(scrapedSources)
        .set({
          title: candidate.title,
          summary: candidate.summary,
          sourceUrl: candidate.link,
          decodedUrl: candidate.decodedUrl,
          canonicalUrl: candidate.canonicalUrl,
          contentHash: candidate.contentHash,
          nicheTopics: candidate.nicheTopics,
          relevanceScore: candidate.relevanceScore,
          publishedAt: candidate.publishedAtDate ?? match.publishedAt,
          lastSeenAt: now,
          scrapeCount: match.scrapeCount + 1,
        })
        .where(eq(scrapedSources.id, match.id))
        .returning();

      if (updated) {
        persisted.push(updated);
      }
      continue;
    }

    const [inserted] = await db
      .insert(scrapedSources)
      .values({
        id: crypto.randomUUID(),
        feedId,
        title: candidate.title,
        summary: candidate.summary,
        sourceUrl: candidate.link,
        decodedUrl: candidate.decodedUrl,
        canonicalUrl: candidate.canonicalUrl,
        urlHash: candidate.urlHash,
        contentHash: candidate.contentHash,
        nicheTopics: candidate.nicheTopics,
        relevanceScore: candidate.relevanceScore,
        publishedAt: candidate.publishedAtDate,
        firstSeenAt: now,
        lastSeenAt: now,
        scrapeCount: 1,
      })
      .returning();

    if (inserted) {
      persisted.push(inserted);
    }
  }

  return persisted;
}

export async function pickSourcesForGeneration(
  visitorId: string,
  feedId: string,
  limit = 5,
) {
  const candidates = await db
    .select()
    .from(scrapedSources)
    .where(eq(scrapedSources.feedId, feedId))
    .orderBy(
      desc(scrapedSources.relevanceScore),
      asc(scrapedSources.lastGeneratedAt),
      desc(scrapedSources.publishedAt),
      desc(scrapedSources.lastSeenAt),
    )
    .limit(limit * 3);

  if (candidates.length === 0) {
    return [];
  }

  const recentRuns = await db
    .select({
      id: generationRuns.id,
      createdAt: generationRuns.createdAt,
    })
    .from(generationRuns)
    .where(
      and(
        eq(generationRuns.visitorId, visitorId),
        eq(generationRuns.sourceType, "rss"),
        eq(generationRuns.feedId, feedId),
        gte(generationRuns.createdAt, new Date(Date.now() - 1000 * 60 * 60 * 24)),
      ),
    );

  const recentRunIds = recentRuns.map((run) => run.id);
  const recentlyUsedSourceIds = new Set<string>();

  if (recentRunIds.length > 0) {
    const links = await db
      .select()
      .from(generationRunSources)
      .where(inArray(generationRunSources.runId, recentRunIds));
    for (const link of links) {
      recentlyUsedSourceIds.add(link.scrapedSourceId);
    }
  }

  const fresh = candidates.filter((candidate) => !recentlyUsedSourceIds.has(candidate.id));
  const selected = (fresh.length > 0 ? fresh : candidates).slice(0, limit);

  return selected;
}

export async function attachSourcesToRun(runId: string, sourceIds: string[]) {
  if (sourceIds.length === 0) {
    return;
  }

  await db.insert(generationRunSources).values(
    sourceIds.map((sourceId) => ({
      id: crypto.randomUUID(),
      runId,
      scrapedSourceId: sourceId,
      usedForGeneration: true,
    })),
  );

  await db
    .update(scrapedSources)
    .set({
      lastGeneratedAt: new Date(),
    })
    .where(inArray(scrapedSources.id, sourceIds));
}
