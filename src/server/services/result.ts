import "server-only";
import type { Decision, DenyCode } from "@/permissions/policy";

export type ServiceErrorCode =
  | DenyCode
  | "NOT_FOUND"
  | "VALIDATION"
  | "EMAIL_TAKEN"
  | "INVALID_MANAGER";

/**
 * What a service function returns. Services never throw for an expected
 * failure and know nothing about HTTP; the route handler maps `code` to a
 * status.
 */
export type ServiceResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code: ServiceErrorCode;
      message: string;
      issues?: readonly string[];
    };

export const ok = <T>(value: T): ServiceResult<T> => ({ ok: true, value });

export const fail = (
  code: ServiceErrorCode,
  message: string,
  issues?: readonly string[],
): ServiceResult<never> => ({ ok: false, code, message, issues });

/** The failure for a denied policy decision, or null when it was allowed. */
export function refusal(decision: Decision): ServiceResult<never> | null {
  return decision.allowed ? null : fail(decision.code, decision.message);
}
