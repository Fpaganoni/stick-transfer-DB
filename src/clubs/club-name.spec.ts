import { normalizeClubDisplayName, normalizeClubNameKey } from "./club-name";

describe("normalizeClubNameKey", () => {
  it("trims and collapses inner spaces and lowercases", () => {
    expect(normalizeClubNameKey("  Club   de  Campo ")).toBe("club de campo");
  });

  it.each(["Atlético", "ATLETICO", "atletico", "ATLÉTICO", "Atlético"])(
    "gives %p the same key as 'atletico'",
    (variant) => {
      expect(normalizeClubNameKey(variant)).toBe("atletico");
    },
  );

  it("collapses tabs, newlines and non-breaking spaces like regular spaces", () => {
    expect(normalizeClubNameKey("Club\tde\n\nCampo")).toBe("club de campo");
    expect(normalizeClubNameKey("Club X")).toBe("club x");
    expect(normalizeClubNameKey("  Club   X  ")).toBe("club x");
  });

  it("gives different names different keys", () => {
    expect(normalizeClubNameKey("Club Norte")).not.toBe(normalizeClubNameKey("Club Sur"));
    expect(normalizeClubNameKey("ClubX")).not.toBe(normalizeClubNameKey("Club X"));
  });

  it("strips accents only: other letters such as the n with tilde keep their base letter", () => {
    expect(normalizeClubNameKey("Peñarol")).toBe("penarol");
  });

  it("returns an empty key for blank input", () => {
    expect(normalizeClubNameKey("    \t ")).toBe("");
    expect(normalizeClubNameKey("")).toBe("");
  });

  it("keeps punctuation and digits, which are part of the name", () => {
    expect(normalizeClubNameKey("C.D. Elche 1923")).toBe("c.d. elche 1923");
  });
});

describe("normalizeClubDisplayName", () => {
  it("keeps case and accents but collapses whitespace runs and trims", () => {
    expect(normalizeClubDisplayName("  Atlético   de\tMadrid ")).toBe("Atlético de Madrid");
  });

  it("turns a non-breaking space into a regular one", () => {
    expect(normalizeClubDisplayName("Club X")).toBe("Club X");
  });

  it("leaves an already clean name untouched", () => {
    expect(normalizeClubDisplayName("Club de Campo")).toBe("Club de Campo");
  });
});
