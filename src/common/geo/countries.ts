import { FieldError } from "../errors/app.error";

/**
 * Countries are stored as uppercase ISO 3166-1 alpha-2 codes ("AR", "ES"),
 * plus the ISO 3166-2 codes of the UK home nations that field their own hockey
 * teams (GB-ENG, GB-SCT, GB-WLS). The DB enforces the format with a CHECK
 * (migration 20261010120000_normalize_country_codes); this list is the closed set.
 */
// prettier-ignore
const ISO_3166_1_ALPHA_2 = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS",
  "BT", "BV", "BW", "BY", "BZ",
  "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW",
  "CX", "CY", "CZ",
  "DE", "DJ", "DK", "DM", "DO", "DZ",
  "EC", "EE", "EG", "EH", "ER", "ES", "ET",
  "FI", "FJ", "FK", "FM", "FO", "FR",
  "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT",
  "GU", "GW", "GY",
  "HK", "HM", "HN", "HR", "HT", "HU",
  "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT",
  "JE", "JM", "JO", "JP",
  "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ",
  "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
  "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS",
  "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
  "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ",
  "OM",
  "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY",
  "QA",
  "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS",
  "ST", "SV", "SX", "SY", "SZ",
  "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
  "UA", "UG", "UM", "US", "UY", "UZ",
  "VA", "VC", "VE", "VG", "VI", "VN", "VU",
  "WF", "WS",
  "YE", "YT",
  "ZA", "ZM", "ZW",
] as const;

export const UK_HOME_NATIONS = ["GB-ENG", "GB-SCT", "GB-WLS"] as const;

export const COUNTRY_CODES: ReadonlySet<string> = new Set<string>([
  ...ISO_3166_1_ALPHA_2,
  ...UK_HOME_NATIONS,
]);

/** Uppercase code if `input` is a known code in any case (surrounding spaces ignored), else null. */
export function normalizeCountry(input?: string | null): string | null {
  const code = input?.trim().toUpperCase();
  return code && COUNTRY_CODES.has(code) ? code : null;
}

/**
 * Prisma `where` for a country filter: equality on the normalized code. An
 * unknown value yields `{ in: [] }`, which matches nothing (empty list, no error).
 */
export function countryFilter(input: string): { in: string[] } {
  const code = normalizeCountry(input);
  return { in: code ? [code] : [] };
}

/** Undefined/null = not provided. Anything else must be a known code. */
export function checkCountry(input?: string | null): FieldError | null {
  if (input === undefined || input === null) return null;
  if (normalizeCountry(input)) return null;
  return {
    field: "country",
    code: "COUNTRY_INVALID",
    message: "Country must be an ISO 3166-1 alpha-2 code (e.g. AR, ES) or GB-ENG, GB-SCT, GB-WLS",
  };
}
