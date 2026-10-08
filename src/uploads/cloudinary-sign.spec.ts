import { createHash } from "crypto";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryService } from "./cloudinary.service";

// Uses the real cloudinary lib (no mock) so the signature is checked against
// an independent SHA-1, as Cloudinary itself computes it.
const FAKE_KEY = "123456";
const FAKE_SECRET = "shh-not-a-real-secret";

const expectedSignature = (params: Record<string, string | number | boolean>) => {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(toSign + FAKE_SECRET).digest("hex");
};

describe("CloudinaryService.signImageUpload", () => {
  const originalUrl = process.env.CLOUDINARY_URL;
  let service: CloudinaryService;

  beforeEach(() => {
    process.env.CLOUDINARY_URL = `cloudinary://${FAKE_KEY}:${FAKE_SECRET}@demo`;
    cloudinary.config(true);
    service = new CloudinaryService();
    jest.useFakeTimers().setSystemTime(new Date("2026-10-08T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalUrl === undefined) delete process.env.CLOUDINARY_URL;
    else process.env.CLOUDINARY_URL = originalUrl;
    cloudinary.config(true);
  });

  it("signs exactly the parameters the browser must send", () => {
    const sig = service.signImageUpload("USER_AVATAR", "u1");

    expect(sig.timestamp).toBe(Math.floor(Date.now() / 1000));
    expect(sig.signature).toBe(
      expectedSignature({
        allowed_formats: "jpg,png,webp",
        invalidate: true,
        overwrite: true,
        // full path, never a bare "avatar": with Cloudinary dynamic folders
        // `folder` is not prepended, so a short id would be global to all tenants
        public_id: "stick-transfer/users/u1/avatar",
        timestamp: sig.timestamp,
      }),
    );
  });

  it("is deterministic: same params give the same signature", () => {
    expect(service.signImageUpload("USER_AVATAR", "u1")).toEqual(
      service.signImageUpload("USER_AVATAR", "u1"),
    );
  });

  it("changes the signature when the owner or target changes", () => {
    const base = service.signImageUpload("USER_AVATAR", "u1").signature;
    expect(service.signImageUpload("USER_AVATAR", "u2").signature).not.toBe(base);
    expect(service.signImageUpload("USER_COVER", "u1").signature).not.toBe(base);
  });

  it.each([
    ["USER_AVATAR", "u1", "stick-transfer/users/u1", "avatar"],
    ["USER_COVER", "u1", "stick-transfer/users/u1", "cover"],
    ["CLUB_LOGO", "c1", "stick-transfer/clubs/c1", "logo"],
    ["CLUB_COVER", "c1", "stick-transfer/clubs/c1", "club-cover"],
  ] as const)("%s uses a fixed owner folder and a full-path public id", (target, id, folder, name) => {
    const sig = service.signImageUpload(target, id);
    expect(sig).toMatchObject({
      folder,
      publicId: `${folder}/${name}`,
      cloudName: "demo",
      apiKey: FAKE_KEY,
      uploadUrl: "https://api.cloudinary.com/v1_1/demo/image/upload",
    });
  });

  it("never returns the api secret", () => {
    const sig = service.signImageUpload("CLUB_LOGO", "c1");
    expect(JSON.stringify(sig)).not.toContain(FAKE_SECRET);
  });

  it("fails clearly when Cloudinary is not configured", () => {
    delete process.env.CLOUDINARY_URL;
    cloudinary.config(true);
    expect(() => new CloudinaryService().signImageUpload("USER_AVATAR", "u1")).toThrow(
      /not configured/i,
    );
  });
});
