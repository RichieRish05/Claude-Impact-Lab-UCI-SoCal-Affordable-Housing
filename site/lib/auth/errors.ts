export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

// Used for both "doesn't exist" and "belongs to someone else", so responses
// never reveal whether another user's resource exists.
export class NotFoundError extends Error {
  constructor() {
    super("Not found");
    this.name = "NotFoundError";
  }
}

export function toErrorResponse(e: unknown): Response {
  if (e instanceof UnauthorizedError) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (e instanceof NotFoundError) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  throw e;
}
