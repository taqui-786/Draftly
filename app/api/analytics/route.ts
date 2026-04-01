import { getAnalytics } from "@/lib/storage";
import { getOrCreateVisitorId } from "@/lib/visitor-session";

export async function GET() {
  try {
    const visitorId = await getOrCreateVisitorId();
    const analytics = await getAnalytics(visitorId);
    return Response.json(analytics);
  } catch (error) {
    console.error("Analytics fetch failed:", error);
    return Response.json(
      { error: "Failed to load analytics data." },
      { status: 500 },
    );
  }
}
