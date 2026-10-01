/**
 * Thrown by API helpers so callers can tell "your sign-in pass was refused"
 * (status 401 - send them back to the login screen) from ordinary errors.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

/** Build an ApiError from a failed response, using the server's message. */
export async function apiError(res: Response, fallback: string): Promise<ApiError> {
  const body = await res.json().catch(() => ({}));
  return new ApiError(body.detail ?? `${fallback} (${res.status})`, res.status);
}

export function isAuthError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 401;
}
