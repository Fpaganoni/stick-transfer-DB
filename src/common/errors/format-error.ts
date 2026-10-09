export function formatGraphqlError(error: any) {
  const originalError = error.extensions?.originalError || error;

  // Console logger (in a real app, send to Datadog/Sentry)
  console.error("--- GRAPHQL ERROR ---", new Date().toISOString());
  console.error("Message:", error.message);
  console.error("Path:", error.path);

  // Every response carries `extensions.code` (stable, machine readable) and
  // a root `statusCode` (GraphQL always answers HTTP 200). The client keys
  // its user-facing messages on `extensions.code` / `extensions.fields`.
  const build = (
    message: string,
    statusCode: number,
    code: string,
    extra: Record<string, unknown> = {},
  ) => ({
    message,
    statusCode,
    path: error.path,
    extensions: { code, statusCode, ...extra },
  });

  // 1. Prisma Data Leak Prevention
  // Prisma errors often expose SQL schema, rows, and relationships.
  // Known Prisma codes look like P2002 (not our own codes, e.g. PASSWORD_*).
  if (
    error.message.includes("Prisma") ||
    error.message.includes("database") ||
    (typeof originalError?.code === "string" && /^P\d{4}$/.test(originalError.code))
  ) {
    console.error("Critical DB Exception Caught:", originalError);
    return build("Internal server error", 500, "INTERNAL_ERROR");
  }

  // 2. Typed application errors (AppError): code/field/fields pass through
  if (typeof originalError?.code === "string" && originalError.statusCode) {
    const { code, field, fields, statusCode } = originalError;
    return build(error.message, statusCode, code, {
      ...(field && { field }),
      ...(fields && { fields }),
    });
  }

  // 3. Standardize Validation Errors (from ValidationPipe)
  if (originalError?.message && Array.isArray(originalError.message)) {
    return build("Validation Error", 400, "VALIDATION_ERROR", {
      fields: originalError.message.map((message: string) => ({
        field: String(message).split(" ")[0],
        code: "VALIDATION_ERROR",
        message,
      })),
    });
  }

  // 4. Rate limiting (ThrottlerException, HTTP 429)
  if (
    originalError?.statusCode === 429 ||
    /too many requests/i.test(error.message)
  ) {
    return build("Too many requests", 429, "RATE_LIMITED");
  }

  // 5. Malformed / invalid GraphQL documents (client bugs, not server faults)
  const gqlCode = error.extensions?.code;
  if (
    gqlCode === "GRAPHQL_VALIDATION_FAILED" ||
    gqlCode === "GRAPHQL_PARSE_FAILED" ||
    gqlCode === "BAD_USER_INPUT" ||
    gqlCode === "BAD_REQUEST" // Apollo's own 400s, e.g. the CSRF prevention block
  ) {
    return build(error.message, 400, gqlCode);
  }

  // 6. Keep other expected errors (like UnauthorizedException) intact
  const statusCode =
    error.extensions?.code === "UNAUTHENTICATED"
      ? 401
      : originalError?.statusCode || 500;
  // Never echo the message of an unexpected 5xx (may leak internals).
  if (statusCode >= 500) {
    return build("Internal server error", statusCode, "INTERNAL_ERROR");
  }
  return build(
    error.message || "Bad request",
    statusCode,
    error.extensions?.code || "BAD_REQUEST",
  );
}
