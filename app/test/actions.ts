"use server";

import { z } from "zod";
import { generateTweetWithToolPipeline } from "@/lib/ai";
import { getOrCreateVisitorId } from "@/lib/visitor-session";

const requestSchema = z.object({
  prompt: z.string().trim().min(5).max(3000),
});

export type TestActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  prompt?: string;
  tweet?: string;
  draft?: string;
  polished?: string;
  viral?: string;
};

export async function runTweetPipelineAction(
  _prevState: TestActionState,
  formData: FormData,
): Promise<TestActionState> {
  const parsed = requestSchema.safeParse({
    prompt: formData.get("prompt"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please enter at least 5 characters.",
    };
  }

  try {
    const visitorId = await getOrCreateVisitorId();
    const result = await generateTweetWithToolPipeline({
      prompt: parsed.data.prompt,
      visitorId,
    });

    return {
      status: "success",
      prompt: parsed.data.prompt,
      tweet: result.tweet,
      draft: result.steps.draft,
      polished: result.steps.polished,
      viral: result.steps.viral,
    };
  } catch (error) {
    console.error("Test pipeline failed:", error);
    return {
      status: "error",
      message: "Tweet generation failed. Please try again.",
    };
  }
}
