import { streamText, UIMessage, convertToModelMessages } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const nvidia = createOpenAICompatible({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  name: 'nvidia',
  headers: {
    Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}`,
  },
});

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: nvidia.chatModel('qwen/qwen3.5-122b-a10b'),
    messages: await convertToModelMessages(messages),
    maxOutputTokens: 16384,
  });

  return result.toUIMessageStreamResponse();
}
