import "server-only";

/** Every API error has this shape: { error: { code, message } }. */
export function jsonError(
  status: number,
  code: string,
  message: string,
): Response {
  return Response.json({ error: { code, message } }, { status });
}
