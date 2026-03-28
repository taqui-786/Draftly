import { createHash } from "crypto";
import { XMLParser } from "fast-xml-parser";

export type FeedEntry = {
  title: string;
  link: string;
  publishedAt: string;
  summary: string;
  rawSummary?: string;
};

export type ScrapedCandidate = FeedEntry & {
  decodedUrl: string;
  canonicalUrl: string;
  urlHash: string;
  contentHash: string;
  nicheTopics: string[];
  relevanceScore: number;
  publishedAtDate: Date | null;
  officialTweetUrl: string | null;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
  // Raise entity limit; default 1000 is too low for some RSS feeds (e.g. 1012 entities)
  processEntities: {
    maxEntityCount: 5000,
  },
});


const NESTED_URL_KEYS = ["url", "u", "target", "dest", "destination", "redirect", "to"];

const NICHE_KEYWORDS: Record<string, readonly string[]> = {
  software: ["software", "engineering", "developer", "dev", "programming", "coding"],
  software_generation: ["codegen", "code generation", "vibe coding", "copilot", "agentic coding"],
  website_building: ["website", "web app", "frontend", "backend", "next.js", "react", "tailwind"],
  design_uiux: ["ui", "ux", "design system", "interaction design", "product design", "usability"],
  fullstack_webdev_job_market: ["hiring", "layoff", "job market", "developer jobs", "web dev jobs", "salary"],
  ai_taking_jobs: ["ai taking jobs", "automation replacing", "job displacement", "ai replacing developers"],
  claude: ["claude", "anthropic"],
};

const RELEVANCE_THRESHOLD = 2;

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripHtml(value: string | undefined) {
  if (!value) {
    return "";
  }
  return normalizeWhitespace(value.replace(/<[^>]*>/g, " "));
}

function stripHtmlPreservingLinks(value: string | undefined) {
  if (!value) {
    return "";
  }

  const withHrefTargets = value.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis,
    (_match, href: string, text: string) => ` ${text || ""} ${href} `,
  );

  return stripHtml(withHrefTargets);
}

function parsePublishedAt(value: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function decodeMaybeEncoded(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function decodeActualResourceUrl(rawUrl: string): string {
  let current = rawUrl.trim();
  for (let i = 0; i < 3; i += 1) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      break;
    }

    let foundNested = false;
    for (const key of NESTED_URL_KEYS) {
      const nested = parsed.searchParams.get(key);
      if (!nested) {
        continue;
      }
      const decoded = decodeMaybeEncoded(nested);
      if (/^https?:\/\//i.test(decoded)) {
        current = decoded;
        foundNested = true;
        break;
      }
    }

    if (!foundNested) {
      break;
    }
  }

  return current;
}

export function canonicalizeUrl(rawUrl: string): string {
  try {
    const decoded = decodeActualResourceUrl(rawUrl);
    const url = new URL(decoded);
    const removeParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
      "ref",
      "ref_src",
    ];

    for (const key of removeParams) {
      url.searchParams.delete(key);
    }

    url.hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    url.hash = "";

    const search = url.searchParams.toString();
    return `${url.protocol}//${url.hostname}${url.pathname}${search ? `?${search}` : ""}`.replace(
      /\/$/,
      "",
    );
  } catch {
    return rawUrl.trim();
  }
}

function extractUrls(value: string) {
  return value.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
}

function normalizeTweetStatusUrl(rawUrl: string): string | null {
  const decoded = decodeActualResourceUrl(rawUrl);
  let parsed: URL;
  try {
    parsed = new URL(decoded);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const isXHost = hostname === "x.com" || hostname === "twitter.com";
  if (!isXHost) {
    return null;
  }

  const path = parsed.pathname.replace(/\/+$/, "");
  if (!/\/status\/\d+$/i.test(path)) {
    return null;
  }

  return `https://${hostname}${path}`;
}

export function extractOfficialTweetUrl(input: {
  sourceUrl?: string;
  decodedUrl?: string;
  canonicalUrl?: string;
  rawSummary?: string;
  summary?: string;
}): string | null {
  const candidates = [
    input.sourceUrl,
    input.decodedUrl,
    input.canonicalUrl,
    ...(input.rawSummary ? extractUrls(input.rawSummary) : []),
    ...(input.summary ? extractUrls(input.summary) : []),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const normalizedTweet = normalizeTweetStatusUrl(candidate);
    if (normalizedTweet) {
      return normalizedTweet;
    }
  }

  return null;
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function scoreNicheRelevance(title: string, summary: string) {
  const text = `${title} ${summary}`.toLowerCase();
  const topics: string[] = [];
  let score = 0;

  for (const [topic, keywords] of Object.entries(NICHE_KEYWORDS)) {
    const matched = keywords.some((keyword) => text.includes(keyword));
    if (matched) {
      topics.push(topic);
      score += 2;
    }
  }

  if (/\b(ai|llm|agent)\b/.test(text) && /\b(dev|developer|job|design|frontend|backend|fullstack)\b/.test(text)) {
    score += 1;
  }

  return {
    topics,
    score,
    isRelevant: score >= RELEVANCE_THRESHOLD,
  };
}

export async function fetchRssEntries(url: string, limit = 12): Promise<FeedEntry[]> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "tweet-automation-bot/1.0",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch feed (${response.status})`);
  }

  const xml = await response.text();
  const parsed = parser.parse(xml) as Record<string, unknown>;

  const rssRoot = (parsed.rss ?? {}) as { channel?: { item?: unknown | unknown[] } };
  const atomRoot = (parsed.feed ?? {}) as { entry?: unknown | unknown[] };

  const channelItems = toArray(rssRoot.channel?.item);
  const atomEntries = toArray(atomRoot.entry);
  const rawItems = channelItems.length > 0 ? channelItems : atomEntries;

  return rawItems
    .map((item) => {
      const objectItem = item as Record<string, unknown>;
      const linkValue = objectItem.link as { href?: string } | string | undefined;
      const rawLink = typeof linkValue === "object" ? linkValue?.href : linkValue;

      return {
        title: normalizeWhitespace(String(objectItem.title ?? "")),
        link: String(rawLink ?? "").trim(),
        publishedAt: String(
          objectItem.pubDate ?? objectItem.published ?? objectItem.updated ?? "",
        ).trim(),
        summary: stripHtmlPreservingLinks(
          String(
            objectItem.description ??
              objectItem.summary ??
              objectItem["content:encoded"] ??
              objectItem.content ??
              "",
          ),
        ),
        rawSummary: String(
          objectItem.description ??
            objectItem.summary ??
            objectItem["content:encoded"] ??
            objectItem.content ??
            "",
        ),
      } satisfies FeedEntry;
    })
    .filter((item) => item.title && item.link)
    .slice(0, limit);
}

export function prepareScrapeCandidates(entries: FeedEntry[]) {
  const seen = new Set<string>();
  const candidates: ScrapedCandidate[] = [];

  for (const entry of entries) {
    const decodedUrl = decodeActualResourceUrl(entry.link);
    const canonicalUrl = canonicalizeUrl(decodedUrl);
    const urlHash = hashValue(canonicalUrl.toLowerCase());
    const summary = entry.summary.slice(0, 800);
    const contentHash = hashValue(`${entry.title.toLowerCase()}|${summary.toLowerCase()}`);
    const niche = scoreNicheRelevance(entry.title, summary);
    const officialTweetUrl = extractOfficialTweetUrl({
      sourceUrl: entry.link,
      decodedUrl,
      canonicalUrl,
      summary,
      rawSummary: entry.rawSummary,
    });

    if (!niche.isRelevant) {
      continue;
    }

    const dedupeKey = `${urlHash}:${contentHash}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    candidates.push({
      ...entry,
      summary,
      decodedUrl,
      canonicalUrl,
      urlHash,
      contentHash,
      nicheTopics: niche.topics,
      relevanceScore: niche.score,
      publishedAtDate: parsePublishedAt(entry.publishedAt),
      officialTweetUrl,
    });
  }

  return candidates.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

export function buildRssPrompt(feedName: string, entries: ScrapedCandidate[]) {
  const bullets = entries
    .map((entry, index) => {
      const shortSummary = entry.summary.slice(0, 260);
      return `${index + 1}. ${entry.title}
Published: ${entry.publishedAt || "Unknown"}
Canonical URL: ${entry.canonicalUrl}
Official Tweet URL: ${entry.officialTweetUrl || "Not found"}
Topics: ${entry.nicheTopics.join(", ")}
Summary: ${shortSummary || "No summary provided"}`;
    })
    .join("\n\n");

  return `Create 3 viral-hook tweet drafts from this latest ${feedName} feed context.
Focus only on software, software generation, website building, design/UI-UX, fullstack/web-dev job market, AI-and-jobs, and Claude/Anthropic updates.
Keep each draft factual and avoid inventing details.
Use one clear idea per tweet and make it skimmable.
When an "Official Tweet URL" is provided, include that exact URL in the tweet draft so it can be posted as a quote-tweet reference.

Feed context:
${bullets}`;
}
