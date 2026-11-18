import { destroySession } from "@/server/auth";
import { clearSessionCookie, readSessionId } from "@/server/current-user";
import { getStore } from "@/server/store";

export async function POST() {
  const sessionId = await readSessionId();
  if (sessionId) destroySession(getStore(), sessionId);

  await clearSessionCookie();
  return new Response(null, { status: 204 });
}
