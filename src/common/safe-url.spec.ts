import { AppError } from "./errors/app.error";
import {
  checkCloudinaryDocumentUrl,
  checkPhone,
  checkPublicHttpUrl,
  throwIfInvalid,
} from "./safe-url";

describe("checkPublicHttpUrl", () => {
  it.each([
    "https://example.com",
    "http://example.com/path?q=1#frag",
    "https://sub.example.co.uk:8443/a",
  ])("accepts %s", (value) => {
    expect(checkPublicHttpUrl("website", value)).toBeNull();
  });

  it.each([
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,<script>alert(1)</script>"],
    ["file scheme", "file:///etc/passwd"],
    ["mixed-case javascript", "JaVaScRiPt:alert(1)"],
    ["no scheme", "example.com"],
    ["embedded credentials", "https://user:pass@example.com"],
    ["whitespace", "https://exa mple.com"],
    ["a quote that breaks out of an attribute", 'https://example.com/"onmouseover="x'],
    ["angle brackets", "https://example.com/<script>"],
    ["a backslash", "https://example.com\\@evil.com"],
    ["a control character", "https://example.com/\u0000"],
    ["empty string", ""],
    ["too long", `https://example.com/${"a".repeat(2100)}`],
  ])("rejects %s", (_name, value) => {
    expect(checkPublicHttpUrl("website", value)).toEqual({
      field: "website",
      code: "URL_INVALID",
      message: expect.any(String),
    });
  });
});

describe("checkCloudinaryDocumentUrl", () => {
  it("accepts an https Cloudinary url", () => {
    expect(
      checkCloudinaryDocumentUrl("cvUrl", "https://res.cloudinary.com/demo/raw/upload/v1/cv.pdf"),
    ).toBeNull();
  });

  it.each([
    ["another host", "https://evil.com/cv.pdf"],
    ["a lookalike host", "https://res.cloudinary.com.evil.com/cv.pdf"],
    ["http", "http://res.cloudinary.com/demo/cv.pdf"],
    ["javascript scheme", "javascript:alert(1)"],
    ["a custom port", "https://res.cloudinary.com:8443/demo/cv.pdf"],
    ["embedded credentials", "https://user@res.cloudinary.com/demo/cv.pdf"],
    ["userinfo that spoofs the host", "https://res.cloudinary.com@evil.com/cv.pdf"],
  ])("rejects %s", (_name, value) => {
    expect(checkCloudinaryDocumentUrl("cvUrl", value)).toMatchObject({
      field: "cvUrl",
      code: "DOCUMENT_URL_INVALID",
    });
  });
});

describe("checkPhone", () => {
  it.each(["+54 9 11 1234-5678", "(011) 4444 5555", "12345"])("accepts %s", (value) => {
    expect(checkPhone("phone", value)).toBeNull();
  });

  it.each(["", "abc", "1", "<script>", "+".repeat(10), "1".repeat(40)])("rejects %p", (value) => {
    expect(checkPhone("phone", value)?.code).toBe("PHONE_INVALID");
  });
});

describe("throwIfInvalid", () => {
  it("does nothing when every check passed", () => {
    expect(() => throwIfInvalid([null, null])).not.toThrow();
  });

  it("throws one VALIDATION_ERROR listing every failure", () => {
    const failures = [
      { field: "website", code: "URL_INVALID", message: "x" },
      null,
      { field: "phone", code: "PHONE_INVALID", message: "y" },
    ];

    try {
      throwIfInvalid(failures);
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).fields).toEqual([failures[0], failures[2]]);
    }
  });
});

describe("checkCloudinaryDocumentUrl - cloud name", () => {
  const originalUrl = process.env.CLOUDINARY_URL;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.CLOUDINARY_URL;
    else process.env.CLOUDINARY_URL = originalUrl;
  });

  it("accepts only documents stored in this app's own Cloudinary account when configured", () => {
    process.env.CLOUDINARY_URL = "cloudinary://key:secret@demo";

    expect(
      checkCloudinaryDocumentUrl("cvUrl", "https://res.cloudinary.com/demo/raw/upload/v1/cv.pdf"),
    ).toBeNull();
    expect(
      checkCloudinaryDocumentUrl("cvUrl", "https://res.cloudinary.com/attacker/raw/upload/v1/cv.pdf"),
    ).toMatchObject({ code: "DOCUMENT_URL_INVALID" });
  });

  it("does not accept a path that merely starts with the cloud name", () => {
    process.env.CLOUDINARY_URL = "cloudinary://key:secret@demo";

    expect(
      checkCloudinaryDocumentUrl("cvUrl", "https://res.cloudinary.com/demo-evil/raw/upload/cv.pdf"),
    ).toMatchObject({ code: "DOCUMENT_URL_INVALID" });
  });

  it("falls back to host-only when no Cloudinary account is configured (nothing can be uploaded then)", () => {
    delete process.env.CLOUDINARY_URL;

    expect(
      checkCloudinaryDocumentUrl("cvUrl", "https://res.cloudinary.com/anything/raw/upload/cv.pdf"),
    ).toBeNull();
  });
});
