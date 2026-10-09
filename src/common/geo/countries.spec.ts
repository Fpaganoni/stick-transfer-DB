import { COUNTRY_CODES, checkCountry, countryFilter, normalizeCountry } from "./countries";

describe("COUNTRY_CODES", () => {
  it("holds the 249 ISO 3166-1 alpha-2 codes plus the 3 UK home nations", () => {
    expect(COUNTRY_CODES.size).toBe(252);
    expect(COUNTRY_CODES.has("AR")).toBe(true);
    expect(COUNTRY_CODES.has("GB-ENG")).toBe(true);
    expect(COUNTRY_CODES.has("GB-SCT")).toBe(true);
    expect(COUNTRY_CODES.has("GB-WLS")).toBe(true);
  });

  it("matches the format enforced by the DB CHECK constraint", () => {
    for (const code of COUNTRY_CODES) {
      expect(code).toMatch(/^[A-Z]{2}(-[A-Z]{3})?$/);
    }
  });
});

describe("normalizeCountry", () => {
  it.each([
    ["AR", "AR"],
    ["ar", "AR"],
    [" Es ", "ES"],
    ["gb-eng", "GB-ENG"],
    ["GB-wls", "GB-WLS"],
  ])("normalizes %p to %p", (input, expected) => {
    expect(normalizeCountry(input)).toBe(expected);
  });

  it.each([["XX"], ["Argentina"], ["🇦🇷"], [""], ["  "], ["GB-NIR"], ["ARG"]])(
    "returns null for unknown value %p",
    (input) => {
      expect(normalizeCountry(input)).toBeNull();
    },
  );

  it("returns null for undefined and null", () => {
    expect(normalizeCountry(undefined)).toBeNull();
    expect(normalizeCountry(null)).toBeNull();
  });
});

describe("countryFilter", () => {
  it("matches the normalized code: 'ar' finds 'AR'", () => {
    expect(countryFilter("ar")).toEqual({ in: ["AR"] });
  });

  it("matches nothing for an unknown value", () => {
    expect(countryFilter("Argentina")).toEqual({ in: [] });
  });
});

describe("checkCountry", () => {
  it("accepts a known code in any case", () => {
    expect(checkCountry("ar")).toBeNull();
    expect(checkCountry("GB-SCT")).toBeNull();
  });

  it("treats undefined and null as not provided", () => {
    expect(checkCountry(undefined)).toBeNull();
    expect(checkCountry(null)).toBeNull();
  });

  it.each([["Spain"], ["XX"], [""], ["🇪🇸 España"]])(
    "rejects %p with COUNTRY_INVALID",
    (input) => {
      expect(checkCountry(input)).toEqual({
        field: "country",
        code: "COUNTRY_INVALID",
        message: expect.any(String),
      });
    },
  );
});
