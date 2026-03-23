import { getTweetHistory, getTweetHistoryCount } from "@/lib/storage";
import { getOrCreateVisitorId } from "@/lib/visitor-session";

export async function GET(req: Request) {
  try {
    const visitorId = await getOrCreateVisitorId();
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "10", 10) || 10, 50);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10) || 0;

    const [tweets, total] = await Promise.all([
      getTweetHistory(visitorId, limit, offset),
      getTweetHistoryCount(visitorId),
    ]);

    return Response.json({
      tweets,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("Tweet history fetch failed:", error);
    return Response.json({ error: "Failed to load tweet history." }, { status: 500 });
  }
}
