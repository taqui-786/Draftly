import { cookies } from "next/headers";

const VISITOR_COOKIE = "tweet_automation_visitor";

export async function getOrCreateVisitorId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(VISITOR_COOKIE)?.value;

  if (existing) {
    return existing;
  }

  const nextId = crypto.randomUUID();

  cookieStore.set(VISITOR_COOKIE, nextId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return nextId;
}
