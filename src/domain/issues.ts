import type { z } from "zod";

/** Turns a zod error into short "field: message" lines for an API response. */
export function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const field = issue.path.join(".");
    return field ? `${field}: ${issue.message}` : issue.message;
  });
}
