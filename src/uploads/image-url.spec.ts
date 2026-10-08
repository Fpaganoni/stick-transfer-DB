import { AppError } from "../common/errors/app.error";
import {
  assertImageDataUrl,
  assertOwnedImageUrl,
  cloudNameFromEnv,
  ownerImageFolder,
  resolveOwnedImages,
} from "./image-url";

const CLOUD = "demo";
const FOLDER = ownerImageFolder("users", "u1");
const OWN_URL = `https://res.cloudinary.com/${CLOUD}/image/upload/v1700000000/${FOLDER}/avatar.webp`;

const check = (value: string | null | undefined, current: string | null = null) =>
  assertOwnedImageUrl({
    field: "avatar",
    value,
    current,
    folder: FOLDER,
    cloudName: CLOUD,
  });

const expectInvalid = (fn: () => unknown, field = "avatar") => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    const err = e as AppError;
    expect(err.getStatus()).toBe(400);
    expect(err.fields).toEqual([
      expect.objectContaining({ field, code: "IMAGE_URL_INVALID" }),
    ]);
    return;
  }
  throw new Error("expected IMAGE_URL_INVALID but nothing was thrown");
};

describe("ownerImageFolder", () => {
  it("builds the per-owner folder", () => {
    expect(ownerImageFolder("users", "u1")).toBe("stick-transfer/users/u1");
    expect(ownerImageFolder("clubs", "c1")).toBe("stick-transfer/clubs/c1");
  });
});

describe("assertOwnedImageUrl", () => {
  it("leaves an omitted value untouched", () => {
    expect(check(undefined)).toBeUndefined();
  });

  it.each([null, ""])("treats %p as removing the image", (value) => {
    expect(check(value, OWN_URL)).toBeNull();
  });

  it("accepts a url inside the owner folder", () => {
    expect(check(OWN_URL)).toBe(OWN_URL);
  });

  it("accepts a url without a version segment", () => {
    const url = `https://res.cloudinary.com/${CLOUD}/image/upload/${FOLDER}/avatar.png`;
    expect(check(url)).toBe(url);
  });

  it("accepts the value already stored, even if legacy", () => {
    const legacy = "https://randomuser.me/api/portraits/men/1.jpg";
    expect(check(legacy, legacy)).toBe(legacy);
  });

  it("rejects a foreign host", () => {
    expectInvalid(() => check("https://evil.com/x.png"));
  });

  it("rejects another cloud name", () => {
    expectInvalid(() =>
      check(`https://res.cloudinary.com/other/image/upload/v1/${FOLDER}/avatar.png`),
    );
  });

  it("rejects another owner's folder", () => {
    expectInvalid(() =>
      check(
        `https://res.cloudinary.com/${CLOUD}/image/upload/v1/${ownerImageFolder("users", "u2")}/avatar.png`,
      ),
    );
  });

  it("rejects a folder id that only shares a prefix with the owner", () => {
    expectInvalid(() =>
      check(
        `https://res.cloudinary.com/${CLOUD}/image/upload/v1/${ownerImageFolder("users", "u10")}/avatar.png`,
      ),
    );
  });

  it("rejects the owner folder hidden deeper in the path", () => {
    expectInvalid(() =>
      check(
        `https://res.cloudinary.com/${CLOUD}/image/upload/other/${FOLDER}/avatar.png`,
      ),
    );
  });

  it("rejects path traversal", () => {
    expectInvalid(() =>
      check(
        `https://res.cloudinary.com/${CLOUD}/image/upload/v1/${FOLDER}/../../users/u2/avatar.png`,
      ),
    );
    expectInvalid(() =>
      check(
        `https://res.cloudinary.com/${CLOUD}/image/upload/v1/${FOLDER}/%2e%2e/u2/avatar.png`,
      ),
    );
  });

  it("rejects http, credentials in the url, ports and non-image resources", () => {
    expectInvalid(() => check(OWN_URL.replace("https://", "http://")));
    expectInvalid(() =>
      check(OWN_URL.replace("https://", "https://res.cloudinary.com@evil.com/")),
    );
    expectInvalid(() => check(OWN_URL.replace(".com/", ".com:8443/")));
    expectInvalid(() => check(OWN_URL.replace("/image/", "/raw/")));
  });

  it("rejects characters that could break out of CSS or HTML contexts", () => {
    for (const tail of ["a.png')", "a.png'", "a b.png", "a.png\n", "a(1).png", "a;b.png"]) {
      expectInvalid(() =>
        check(`https://res.cloudinary.com/${CLOUD}/image/upload/v1/${FOLDER}/${tail}`),
      );
    }
  });

  it("rejects strings that are not urls", () => {
    expectInvalid(() => check("not a url"));
    expectInvalid(() => check("javascript:alert(1)"));
  });

  it("rejects everything when the cloud name is not configured", () => {
    expectInvalid(() =>
      assertOwnedImageUrl({
        field: "avatar",
        value: OWN_URL,
        current: null,
        folder: FOLDER,
        cloudName: undefined,
      }),
    );
  });

  it("reports the field it was given", () => {
    expectInvalid(
      () =>
        assertOwnedImageUrl({
          field: "logo",
          value: "https://evil.com/x.png",
          current: null,
          folder: ownerImageFolder("clubs", "c1"),
          cloudName: CLOUD,
        }),
      "logo",
    );
  });
});

describe("resolveOwnedImages", () => {
  const env = process.env.CLOUDINARY_URL;
  beforeEach(() => {
    process.env.CLOUDINARY_URL = `cloudinary://k:s@${CLOUD}`;
  });
  afterEach(() => {
    if (env === undefined) delete process.env.CLOUDINARY_URL;
    else process.env.CLOUDINARY_URL = env;
  });

  it("validates only the fields that were sent and normalizes blanks to null", () => {
    expect(
      resolveOwnedImages({
        kind: "users",
        ownerId: "u1",
        input: { avatar: OWN_URL, coverImage: "", logo: undefined },
        current: { avatar: null, coverImage: "https://old.example/x.png" },
      }),
    ).toEqual({ avatar: OWN_URL, coverImage: null });
  });

  it("returns nothing when no image field was sent", () => {
    expect(
      resolveOwnedImages({ kind: "users", ownerId: "u1", input: {}, current: {} }),
    ).toEqual({});
  });

  it("throws IMAGE_URL_INVALID naming the offending field", () => {
    expectInvalid(
      () =>
        resolveOwnedImages({
          kind: "clubs",
          ownerId: "c1",
          input: { logo: "https://evil.com/x.png" },
          current: {},
        }),
      "logo",
    );
  });
});

describe("assertImageDataUrl", () => {
  it.each(["jpeg", "png", "webp"])("accepts data:image/%s", (type) => {
    expect(() =>
      assertImageDataUrl("avatar", `data:image/${type};base64,AAAA`),
    ).not.toThrow();
  });

  it.each([
    "AAAA",
    "data",
    "data:image/gif;base64,AAAA",
    "data:image/svg+xml;base64,AAAA",
    "data:application/pdf;base64,AAAA",
  ])("rejects %p", (value) => {
    expect(() => assertImageDataUrl("avatar", value)).toThrow(AppError);
  });
});

describe("cloudNameFromEnv", () => {
  const original = process.env.CLOUDINARY_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.CLOUDINARY_URL;
    else process.env.CLOUDINARY_URL = original;
  });

  it("reads the cloud name from CLOUDINARY_URL", () => {
    process.env.CLOUDINARY_URL = "cloudinary://key:secret@my-cloud";
    expect(cloudNameFromEnv()).toBe("my-cloud");
  });

  it("is undefined when CLOUDINARY_URL is missing or malformed", () => {
    delete process.env.CLOUDINARY_URL;
    expect(cloudNameFromEnv()).toBeUndefined();
    process.env.CLOUDINARY_URL = "garbage";
    expect(cloudNameFromEnv()).toBeUndefined();
  });
});
