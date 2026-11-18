import "server-only";
import type { ServiceErrorCode, ServiceResult } from "./services/result";

/**
 * Responses carry user data and depend on who is asking, so no cache, in the
 * browser or in between, may keep them.
 */
const NO_STORE = { "cache-control": "no-store" };

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/** Every API error has this shape: { error: { code, message, issues? } }. */
export function jsonError(
  status: number,
  code: string,
  message: string,
  issues?: readonly string[],
): Response {
  return json({ error: { code, message, ...(issues ? { issues } : {}) } }, status);
}

/**
 * The single place where a service error code becomes an HTTP status. Typed as
 * a Record, so a new error code does not compile until it has a status here.
 *
 * 401: no usable login. 403: logged in, not allowed. 409: the request is fine
 * but clashes with the current state. 422: well-formed, but not acceptable.
 */
const STATUS_BY_CODE: Record<ServiceErrorCode, number> = {
  ACTOR_INACTIVE: 401,
  FORBIDDEN: 403,
  NOT_A_DIRECT_REPORT: 403,
  CANNOT_DEACTIVATE_SELF: 403,
  CANNOT_CHANGE_OWN_ROLE: 403,
  LAST_ACTIVE_ACCOUNT: 409,
  EMAIL_TAKEN: 409,
  NOT_FOUND: 404,
  VALIDATION: 400,
  INVALID_MANAGER: 422,
};

export function statusFor(code: ServiceErrorCode): number {
  return STATUS_BY_CODE[code];
}

/** Turns a service result into a response. Route handlers end with this. */
export function respond<T>(
  result: ServiceResult<T>,
  toBody: (value: T) => unknown,
  successStatus = 200,
): Response {
  return result.ok
    ? json(toBody(result.value), successStatus)
    : jsonError(statusFor(result.code), result.code, result.message, result.issues);
}
