import { z } from "zod";
import { generateText } from "ai";
import { mainModel } from "./ai";
import { normalizeStyleSample, type StyleTweet } from "./style-engine";
import { XmlPrompt } from "./xml-prompt";

const threadTweetSchema = z.object({
  text: z.string().trim().min(1).max(280),
});

const threadOutputSchema = z.object({
  tweets: z.array(threadTweetSchema).min(2).max(5),
});

const THREAD_SYSTEM_PROMPT = `You are an expert Twitter thread writer. Generate a coherent multi-tweet thread that flows naturally from one tweet to the next.

Rules:
- Each tweet must be under 280 characters
- The thread should read as one continuous thought split into parts
- Use "(1/N)", "(2/N)" etc. numbering at the start of each tweet
- The first tweet should have a strong hook
- The last tweet should have a natural conclusion or CTA
- Match the user's writing style (line breaks, list markers, spacing, tone)
- Never add hashtags, links, or mentions unless explicitly asked
- Return ONLY valid JSON: {"tweets":[{"text":"..."},{"text":"..."}]}`;

function buildThreadPrompt({
  topic,
  threadLength,
  styleSample,
}: {
  topic: string;
  threadLength: number;
  styleSample: StyleTweet[];
}): string {
  const normalized = normalizeStyleSample(styleSample);
  const prompt = new XmlPrompt();

  prompt.text(`Create a ${threadLength}-tweet thread about the following topic.
Each tweet should flow naturally into the next, forming one coherent narrative.`);

  prompt.tag('topic', topic);
  prompt.tag('thread_length', `Exactly ${threadLength} tweets.`);

  prompt.tag('thread_structure', `
- Tweet 1: Strong hook that makes people want to read more
- Tweet 2-${threadLength - 1}: Build the argument/story with concrete points
- Tweet ${threadLength}: Natural conclusion or takeaway
  `.trim());

  prompt.open('style_reference');
  prompt.text('Match this writing style — line breaks, list markers, spacing, tone:');
  normalized.slice(0, 6).forEach((s) => {
    prompt.tag('example', s.tweet.trim());
  });
  prompt.close('style_reference');

  prompt.text(`Return ONLY a JSON object: {"tweets":[{"text":"tweet 1"},{"text":"tweet 2"},...]}`);

  return prompt.toString();
}

export type GenerateThreadInput = {
  topic: string;
  threadLength: number;
  styleSample: StyleTweet[];
};

export type GeneratedThreadTweet = {
  id: string;
  text: string;
  position: number;
  charCount: number;
};

export async function generateThread({
  topic,
  threadLength,
  styleSample,
}: GenerateThreadInput): Promise<GeneratedThreadTweet[]> {
  const clampedLength = Math.min(Math.max(threadLength, 2), 5);
  const userPrompt = buildThreadPrompt({
    topic,
    threadLength: clampedLength,
    styleSample,
  });

  const response = await generateText({
    model: mainModel,
    system: THREAD_SYSTEM_PROMPT,
    prompt: userPrompt,
    temperature: 0.7,
    topP: 0.95,
  });

  const content = response.text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const parsed = JSON.parse(content) as unknown;
  const validated = threadOutputSchema.parse(parsed);

  return validated.tweets.map((tweet, index) => ({
    id: `thread-${index + 1}`,
    text: tweet.text,
    position: index + 1,
    charCount: tweet.text.length,
  }));
}
