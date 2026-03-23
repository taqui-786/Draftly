import { z } from "zod";
import { addFeed, listActiveFeeds } from "@/lib/storage";

const addFeedSchema = z.object({
  name: z.string().trim().min(2).max(80),
  url: z.url().trim().max(2048),
  category: z.string().trim().min(2).max(40).optional(),
});

export async function GET() {
  try {
    const feeds = await listActiveFeeds();
    return Response.json({ feeds });
  } catch (error) {
    console.error("Feed listing failed:", error);
    return Response.json({ error: "Failed to load RSS feeds." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = addFeedSchema.safeParse(json);

  if (!parsed.success) {
    return Response.json({ error: "Invalid feed payload." }, { status: 400 });
  }

  try {
    const created = await addFeed(parsed.data);
    return Response.json({ feed: created }, { status: 201 });
  } catch (error) {
    console.error("Feed creation failed:", error);
    return Response.json({ error: "Failed to save feed." }, { status: 500 });
  }
}
