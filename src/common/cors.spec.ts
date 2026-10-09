import { allowRequestFromAllowedOrigin, getAllowedOrigins, isAllowedOrigin } from "./cors";

describe("allowRequestFromAllowedOrigin (socket.io handshake guard against cross-site websocket hijacking)", () => {
  const original = process.env.FRONTEND_URL;
  beforeEach(() => {
    process.env.FRONTEND_URL = "https://app.sticktransfer.com";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = original;
  });

  const decide = (origin?: string) => {
    const callback = jest.fn();
    allowRequestFromAllowedOrigin({ headers: origin === undefined ? {} : { origin } }, callback);
    return callback.mock.calls[0];
  };

  it("accepts the handshake from an allow-listed origin", () => {
    expect(decide("https://app.sticktransfer.com")).toEqual([null, true]);
  });

  it("rejects the handshake from any other origin, even though browsers skip CORS for WebSockets", () => {
    expect(decide("https://evil.example.com")).toEqual([null, false]);
    expect(decide("null")).toEqual([null, false]);
  });

  it("accepts a handshake with no Origin header (non-browser client, which has no ambient cookie)", () => {
    expect(decide(undefined)).toEqual([null, true]);
  });
});

describe("cors origins", () => {
  const original = process.env.FRONTEND_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = original;
  });

  it("always allows the local dev frontends", () => {
    delete process.env.FRONTEND_URL;

    expect(getAllowedOrigins()).toEqual(["http://localhost:3000", "http://localhost:3001"]);
  });

  it("adds FRONTEND_URL without trailing slashes", () => {
    process.env.FRONTEND_URL = "https://app.sticktransfer.com//";

    expect(getAllowedOrigins()).toContain("https://app.sticktransfer.com");
  });

  it("reads FRONTEND_URL on every call (not frozen at import time)", () => {
    delete process.env.FRONTEND_URL;
    expect(isAllowedOrigin("https://late.example.com")).toBe(false);

    process.env.FRONTEND_URL = "https://late.example.com";
    expect(isAllowedOrigin("https://late.example.com")).toBe(true);
  });

  it("is a strict allow-list: never reflects an unknown origin", () => {
    process.env.FRONTEND_URL = "https://app.sticktransfer.com";

    expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
    expect(isAllowedOrigin("https://app.sticktransfer.com.evil.com")).toBe(false);
    expect(isAllowedOrigin("http://app.sticktransfer.com")).toBe(false);
  });

  it("lets requests without an Origin header through (non-browser clients; CORS does not apply)", () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
  });
});
