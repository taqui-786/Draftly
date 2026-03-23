import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { generationRuns, rssFeeds, scrapedSources } from "@/drizzle/schema";
import { getOrCreateVisitorId } from "@/lib/visitor-session";

const querySchema = z.object({
  feedId: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    feedId: url.searchParams.get("feedId") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return Response.json({ error: "Invalid query params." }, { status: 400 });
  }

  const visitorId = await getOrCreateVisitorId();
  const limit = parsed.data.limit ?? 20;
  const feedId = parsed.data.feedId;

  const sources = await db
    .select({
      id: scrapedSources.id,
      feedId: scrapedSources.feedId,
      title: scrapedSources.title,
      sourceUrl: scrapedSources.sourceUrl,
      decodedUrl: scrapedSources.decodedUrl,
      canonicalUrl: scrapedSources.canonicalUrl,
      relevanceScore: scrapedSources.relevanceScore,
      nicheTopics: scrapedSources.nicheTopics,
      lastGeneratedAt: scrapedSources.lastGeneratedAt,
      lastSeenAt: scrapedSources.lastSeenAt,
      scrapeCount: scrapedSources.scrapeCount,
    })
    .from(scrapedSources)
    .where(feedId ? eq(scrapedSources.feedId, feedId) : undefined)
    .orderBy(desc(scrapedSources.lastSeenAt))
    .limit(limit);

  const runs = await db
    .select({
      id: generationRuns.id,
      feedId: generationRuns.feedId,
      sourceType: generationRuns.sourceType,
      createdAt: generationRuns.createdAt,
      metadata: generationRuns.metadata,
    })
    .from(generationRuns)
    .where(
      and(
        eq(generationRuns.visitorId, visitorId),
        eq(generationRuns.sourceType, "rss"),
        feedId ? eq(generationRuns.feedId, feedId) : undefined,
      ),
    )
    .orderBy(desc(generationRuns.createdAt))
    .limit(limit);

  const feeds = await db
    .select({ id: rssFeeds.id, name: rssFeeds.name })
    .from(rssFeeds)
    .where(eq(rssFeeds.isActive, true));

  return Response.json({
    feeds,
    sources,
    runs,
  });
}
