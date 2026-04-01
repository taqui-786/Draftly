import { generateText } from "ai";
import { mainModel } from "./ai";
import { normalizeStyleSample, type StyleTweet } from "./style-engine";
import type { ScrapedCandidate } from "./rss";
import { XmlPrompt } from "./xml-prompt";

const TOPIC_SYSTEM_PROMPT = `You are a tweet content strategist. Analyze the provided context and suggest tweet topics that the user should write about.

Rules:
- Suggest exactly 5 tweet topics
- Each topic should be specific and actionable
- Consider what's trending in the RSS feed context
- Match the user's style interests
- Return ONLY valid JSON matching the expected schema`;

export type TopicSuggestion = {
  topic: string;
  angle: string;
  sourceTitle?: string;
  urgency: "high" | "medium" | "low";
};

export type TopicSuggestionsInput = {
  styleSample: StyleTweet[];
  rssEntries?: ScrapedCandidate[];
  recentPrompts?: string[];
};

export async function generateTopicSuggestions({
  styleSample,
  rssEntries,
  recentPrompts,
}: TopicSuggestionsInput): Promise<TopicSuggestion[]> {
  const prompt = new XmlPrompt();

  prompt.text(`Based on the following context, suggest 5 specific tweet topics the user should write about.`);

  if (rssEntries && rssEntries.length > 0) {
    prompt.open('rss_context');
    prompt.text('Latest trending topics from RSS feeds:');
    rssEntries.slice(0, 10).forEach((entry) => {
      prompt.tag('article', `${entry.title} | Topics: ${entry.nicheTopics?.join(", ") || "general"} | Score: ${entry.relevanceScore}`);
    });
    prompt.close('rss_context');
  }

  if (recentPrompts && recentPrompts.length > 0) {
    prompt.open('recent_activity');
    prompt.text('Recent tweet generation prompts (avoid suggesting similar topics):');
    recentPrompts.slice(0, 5).forEach((p) => {
      prompt.tag('recent_prompt', p);
    });
    prompt.close('recent_activity');
  }

  prompt.open('style_reference');
  prompt.text('User\'s writing style:');
  normalizeStyleSample(styleSample).slice(0, 4).forEach((s) => {
    prompt.tag('example', s.tweet.trim());
  });
  prompt.close('style_reference');

  prompt.text(`Return ONLY a JSON object:
{"suggestions":[{"topic":"...","angle":"...","sourceTitle":"...","urgency":"high|medium|low"}]}`);

  const response = await generateText({
    model: mainModel,
    system: TOPIC_SYSTEM_PROMPT,
    prompt: prompt.toString(),
    temperature: 0.8,
    topP: 0.95,
  });

  const content = response.text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const parsed = JSON.parse(content) as { suggestions?: TopicSuggestion[] };
  return parsed.suggestions?.slice(0, 5) ?? [];
}
