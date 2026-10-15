/**
 * Club name uniqueness key. Two names that normalize to the same key are the
 * same club name ("Atletico  Madrid" == "atlético madrid").
 *
 * IMPORTANT: the authority is the SQL function club_name_key() (migration
 * 20261014140000_club_identity_expand), which fills User.clubNameKey through a
 * trigger. This helper only powers the service pre-check, so it MUST apply the
 * same steps in the same order: NFKC, NFD, strip U+0300-U+036F only, lowercase,
 * collapse ASCII whitespace + NBSP, trim. If the two ever disagree the unique
 * index still wins (P2002 -> CLUB_NAME_TAKEN).
 */
const COMBINING_MARKS = /[̀-ͯ]/g;
const WHITESPACE_RUN = /[\s ]+/g;

export function normalizeClubNameKey(name: string): string {
  return name
    .normalize("NFKC") // fullwidth / compatibility forms ("Ｒeal" == "Real")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(WHITESPACE_RUN, " ")
    .trim();
}

/** Control (Cc) and invisible format characters (Cf: zero-width, bidi overrides, soft hyphen). */
const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/u;

/**
 * Club names and the manager's names are shown to everyone (or to super
 * admins): reject characters that are invisible or reorder text, which would
 * let a name look identical to another one or break a UI. NBSP is not Cf; it is
 * collapsed to a plain space by normalizeClubDisplayName.
 */
export function hasControlOrFormatChars(value: string): boolean {
  return CONTROL_OR_FORMAT.test(value);
}

/** Display form that gets stored: trimmed, inner whitespace runs collapsed. */
export function normalizeClubDisplayName(name: string): string {
  return name.replace(WHITESPACE_RUN, " ").trim();
}
