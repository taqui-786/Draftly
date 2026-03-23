import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { StyleTweet } from "@/lib/style-engine";

export const styleProfiles = pgTable(
  "style_profiles",
  {
    id: text("id").primaryKey(),
    visitorId: text("visitor_id").notNull(),
    name: text("name").notNull().default("Default Style"),
    tweets: jsonb("tweets").$type<StyleTweet[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    visitorIdx: uniqueIndex("style_profiles_visitor_id_idx").on(table.visitorId),
  }),
);

export const rssFeeds = pgTable("rss_feeds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  category: text("category").notNull().default("Tech"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});

export const generationRuns = pgTable("generation_runs", {
  id: text("id").primaryKey(),
  visitorId: text("visitor_id").notNull(),
  sourceType: text("source_type").notNull(),
  sourcePrompt: text("source_prompt").notNull(),
  feedId: text("feed_id"),
  model: text("model").notNull(),
  status: text("status").notNull().default("completed"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});

export const generatedTweets = pgTable("generated_tweets", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => generationRuns.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  text: text("text").notNull(),
  rationale: text("rationale").notNull(),
  charCount: integer("char_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});

export const scrapedSources = pgTable(
  "scraped_sources",
  {
    id: text("id").primaryKey(),
    feedId: text("feed_id").references(() => rssFeeds.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    sourceUrl: text("source_url").notNull(),
    decodedUrl: text("decoded_url").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    urlHash: text("url_hash").notNull(),
    contentHash: text("content_hash").notNull(),
    nicheTopics: jsonb("niche_topics").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    relevanceScore: integer("relevance_score").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    lastGeneratedAt: timestamp("last_generated_at", { withTimezone: true }),
    scrapeCount: integer("scrape_count").notNull().default(1),
  },
  (table) => ({
    urlHashIdx: uniqueIndex("scraped_sources_url_hash_idx").on(table.urlHash),
  }),
);

export const generationRunSources = pgTable(
  "generation_run_sources",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => generationRuns.id, { onDelete: "cascade" }),
    scrapedSourceId: text("scraped_source_id")
      .notNull()
      .references(() => scrapedSources.id, { onDelete: "cascade" }),
    usedForGeneration: boolean("used_for_generation").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    runSourceIdx: uniqueIndex("generation_run_sources_run_source_idx").on(
      table.runId,
      table.scrapedSourceId,
    ),
  }),
);
