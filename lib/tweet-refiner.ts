import { z } from "zod";
import { generateText } from "ai";
import { mainModel } from "./ai";
import { normalizeStyleSample, type StyleTweet } from "./style-engine";
import { XmlPrompt } from "./xml-prompt";

const refineSchema = z.object({
  refinedTweet: z.string().trim().min(1).max(280),
});

const REFINEMENT_SYSTEM_PROMPT = `You are a tweet refinement assistant. You take an existing tweet draft and rewrite it according to specific instructions while preserving the core message and matching the user's writing style.

Rules:
- Keep the refined tweet under 280 characters
- Preserve the core message/intent of the original
- Apply the refinement instruction faithfully
- Match the visual formatting style (line breaks, list markers, spacing)
- Never add hashtags, links, or mentions unless explicitly asked
- Return ONLY valid JSON: {"refinedTweet": "..."}`;

function buildRefinePrompt({
  originalTweet,
  refinementInstruction,
  styleSample,
}: {
  originalTweet: string;
  refinementInstruction: string;
  styleSample: StyleTweet[];
}): string {
  const normalized = normalizeStyleSample(styleSample);
  const prompt = new XmlPrompt();

  prompt.text(`Refine the following tweet according to the instruction below.
Match the user's writing style exactly.`);

  prompt.tag('original_tweet', originalTweet);
  prompt.tag('refinement_instruction', refinementInstruction);

  prompt.open('style_reference');
  prompt.text('Match this writing style — line breaks, list markers, spacing, tone:');
  normalized.slice(0, 6).forEach((s) => {
    prompt.tag('example', s.tweet.trim());
  });
  prompt.close('style_reference');

  prompt.text(`Return ONLY a JSON object: {"refinedTweet": "your refined tweet here"}`);

  return prompt.toString();
}

export type RefineTweetInput = {
  originalTweet: string;
  refinementInstruction: string;
  styleSample: StyleTweet[];
};

export async function refineTweet({
  originalTweet,
  refinementInstruction,
  styleSample,
}: RefineTweetInput): Promise<string> {
  const userPrompt = buildRefinePrompt({
    originalTweet,
    refinementInstruction,
    styleSample,
  });

  const response = await generateText({
    model: mainModel,
    system: REFINEMENT_SYSTEM_PROMPT,
    prompt: userPrompt,
    temperature: 0.6,
    topP: 0.95,
  });

  const content = response.text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const parsed = JSON.parse(content) as unknown;
  const validated = refineSchema.parse(parsed);

  return validated.refinedTweet;
}
