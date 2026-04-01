import { z } from "zod";
import { addFeed, deleteFeed, listActiveFeeds } from "@/lib/storage";

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

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const feedId = searchParams.get("id");

  if (!feedId) {
    return Response.json({ error: "Feed ID is required." }, { status: 400 });
  }

  try {
    const deleted = await deleteFeed(feedId);
    if (!deleted) {
      return Response.json({ error: "Feed not found." }, { status: 404 });
    }
    return Response.json({ message: "Feed removed." });
  } catch (error) {
    console.error("Feed deletion failed:", error);
    return Response.json({ error: "Failed to remove feed." }, { status: 500 });
  }
}
