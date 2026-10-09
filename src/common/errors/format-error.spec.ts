import { HttpStatus } from "@nestjs/common";
import { AppError } from "./app.error";
import { formatGraphqlError } from "./format-error";
import { mapUniqueViolation } from "./unique-violation";

/** Mimics what Apollo hands to formatError for a resolver that threw an HttpException. */
function gqlError(thrown: any, message = thrown?.message) {
  const originalError =
    thrown?.getResponse?.() ?? { statusCode: thrown?.statusCode, message };
  return { message, path: ["register"], extensions: { originalError } };
}

describe("formatGraphqlError", () => {
  const origError = console.error;
  beforeAll(() => (console.error = jest.fn()));
  afterAll(() => (console.error = origError));

  it("passes AppError code/field/fields through extensions", () => {
    const fields = [{ field: "email", code: "EMAIL_INVALID", message: "bad" }];
    const out: any = formatGraphqlError(gqlError(AppError.validation(fields)));
    expect(out.extensions).toEqual({
      code: "VALIDATION_ERROR",
      statusCode: 400,
      field: "email",
      fields,
    });
    expect(out.statusCode).toBe(400);
  });

  it("maps P2002 on email/username to EMAIL_TAKEN/USERNAME_TAKEN", () => {
    const email: any = formatGraphqlError(
      gqlError(mapUniqueViolation({ code: "P2002", meta: { target: ["email"] } })),
    );
    expect(email.extensions).toMatchObject({ code: "EMAIL_TAKEN", field: "email", statusCode: 409 });
    const username: any = formatGraphqlError(
      gqlError(mapUniqueViolation({ code: "P2002", meta: { target: "User_username_key" } })),
    );
    expect(username.extensions).toMatchObject({ code: "USERNAME_TAKEN", field: "username" });
  });

  it("returns INVALID_CREDENTIALS without a field", () => {
    const out: any = formatGraphqlError(gqlError(AppError.invalidCredentials()));
    expect(out.extensions).toEqual({ code: "INVALID_CREDENTIALS", statusCode: 401 });
  });

  it("maps throttling (429) to RATE_LIMITED", () => {
    const out: any = formatGraphqlError(
      gqlError({ statusCode: HttpStatus.TOO_MANY_REQUESTS }, "ThrottlerException: Too Many Requests"),
    );
    expect(out.extensions).toMatchObject({ code: "RATE_LIMITED", statusCode: 429 });
  });

  it("masks Prisma errors and unexpected 5xx messages", () => {
    const prisma: any = formatGraphqlError({
      message: "Invalid `prisma.user.create()` invocation",
      extensions: { originalError: { code: "P2010" } },
    });
    expect(prisma.extensions).toMatchObject({ code: "INTERNAL_ERROR", statusCode: 500 });
    expect(prisma.message).toBe("Internal server error");

    const boom: any = formatGraphqlError({
      message: "secret internals",
      extensions: { originalError: { statusCode: 500, message: "secret internals" } },
    });
    expect(JSON.stringify(boom)).not.toContain("secret internals");
  });

  it("does not mistake our own codes (PASSWORD_*) for Prisma codes", () => {
    const out: any = formatGraphqlError(
      gqlError(AppError.validation([{ field: "password", code: "PASSWORD_TOO_SHORT", message: "x" }])),
    );
    expect(out.extensions.code).toBe("VALIDATION_ERROR");
  });

  it("turns malformed GraphQL documents into 400", () => {
    const out: any = formatGraphqlError({
      message: 'Cannot query field "x"',
      extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
    });
    expect(out.extensions).toMatchObject({ code: "GRAPHQL_VALIDATION_FAILED", statusCode: 400 });
  });

  it("keeps Apollo's BAD_REQUEST (e.g. CSRF block) as a 400 instead of a masked 500", () => {
    const out: any = formatGraphqlError({
      message: "This operation has been blocked as a potential Cross-Site Request Forgery (CSRF).",
      extensions: { code: "BAD_REQUEST" },
    });
    expect(out.extensions).toMatchObject({ code: "BAD_REQUEST", statusCode: 400 });
    expect(out.message).toMatch(/CSRF/);
  });

  it("keeps UNAUTHENTICATED as 401", () => {
    const out: any = formatGraphqlError({
      message: "Authentication required",
      extensions: { code: "UNAUTHENTICATED", originalError: { statusCode: 401 } },
    });
    expect(out.extensions).toMatchObject({ code: "UNAUTHENTICATED", statusCode: 401 });
  });
});
