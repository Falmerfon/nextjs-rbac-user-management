import { z } from "zod";
import { login } from "@/server/auth";
import { setSessionCookie } from "@/server/current-user";
import { jsonError } from "@/server/http";
import { getStore } from "@/server/store";

const LoginBody = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const body = LoginBody.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return jsonError(400, "INVALID_REQUEST", "Email and password are required.");
  }

  const result = login(getStore(), body.data.email, body.data.password);
  if (!result.ok) {
    return result.code === "ACCOUNT_DEACTIVATED"
      ? jsonError(403, result.code, "This account is deactivated.")
      : jsonError(401, result.code, "Invalid email or password.");
  }

  await setSessionCookie(result.sessionId);
  return Response.json({ user: result.user });
}
