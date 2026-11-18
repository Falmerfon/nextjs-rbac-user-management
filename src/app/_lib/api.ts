/**
 * The browser's way to call the API. Code that runs in the browser only
 * calls the API through this, so the rule for a lost session lives in one
 * place: a 401 means the session is gone, so go to /login.
 */

export interface ApiError {
  code: string;
  message: string;
  issues?: string[];
}

export interface ApiReply<T> {
  status: number;
  /** The body of a successful reply, otherwise null. */
  data: T | null;
  /** The error of a failed reply, otherwise null. */
  error: ApiError | null;
}

function readError(body: unknown): ApiError {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = (body as { error: Partial<ApiError> }).error;
    if (typeof error?.message === "string") {
      return { code: error.code ?? "ERROR", message: error.message, issues: error.issues };
    }
  }
  return { code: "ERROR", message: "Something went wrong. Try again." };
}

export async function callApi<T>(
  method: string,
  path: string,
  body?: unknown,
  options: { redirectOn401?: boolean } = {},
): Promise<ApiReply<T>> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const json: unknown = await response.json().catch(() => null);

  // The login form turns this off: there a 401 just means a wrong password.
  // A full page load, and replace() so Back does not return to a page that
  // the session no longer allows.
  if (response.status === 401 && options.redirectOn401 !== false) {
    window.location.replace("/login");
  }

  return response.ok
    ? { status: response.status, data: json as T, error: null }
    : { status: response.status, data: null, error: readError(json) };
}

/** One line for the user, with the details of a validation error appended. */
export function describeError(error: ApiError | null): string {
  if (!error) return "Something went wrong. Try again.";
  return error.issues?.length ? `${error.message} ${error.issues.join("; ")}` : error.message;
}
