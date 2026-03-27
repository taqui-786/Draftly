import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

export const nim = createOpenAICompatible({
  name: "nim",
  baseURL: "https://integrate.api.nvidia.com/v1",
  headers: {
    Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}`,
  },
});
export const helperModel = nim.chatModel("meta/llama-3.1-70b-instruct");
// export const mainModel = nim.chatModel("deepseek-ai/deepseek-v3.1"); // working ✅ fast
// export const mainModel = nim.chatModel("stepfun-ai/step-3.5-flash"); // working ✅ medium
export const mainModel = nim.chatModel("moonshotai/kimi-k2-instruct"); // working ✅ fast
// export const mainModel = nim.chatModel("moonshotai/kimi-k2-instruct-0905"); // working ✅ fast
// export const mainModel = nim.chatModel("qwen/qwq-32b"); // working ✅ fast + Thinking

const test = async () => {
  const response = await generateText({
    model: mainModel,
    system:"Think step by step and explain your reasoning clearly.",
    prompt: "what is your name",

    temperature: 0.7,
    topP: 0.95,
  });
  console.log(response.text);
};
// test();
