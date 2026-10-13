// lib/newsletter-consent.ts
//
// Whether the newsletter box on the sign-up form starts ticked.
//
// A ticked box is allowed where a newsletter may be sent until the person
// says stop — the US under CAN-SPAM. It is NOT consent where the law asks for
// an opt-in the person makes themselves, and these places refuse a box that
// was ticked for them:
//
//   the EU and the rest of the EEA   GDPR, Recital 32
//   the UK                           UK GDPR and PECR
//   Jersey, Guernsey, Isle of Man,   their own GDPR-style laws
//     Gibraltar
//   Switzerland                      UWG art. 3(1)(o)
//   Canada                           CASL
//
// There the box starts unticked, and the person ticks it or does not.
//
// Where the country is not known the box starts unticked too. A visitor who
// cannot be placed might be in any of those countries, and an unticked box
// costs them one press, while a ticked one in the wrong place costs the
// consent itself.
//
// The country is the one Vercel's edge reads from the visitor's IP address
// (the x-vercel-ip-country header) — a best guess, as every IP lookup is.
// Pure: no request and no React. The sign-up page reads the header and asks.

/** ISO 3166-1 alpha-2 codes where the box starts unticked. */
export const OPT_IN_COUNTRIES: ReadonlySet<string> = new Set([
  // The European Union
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // EU territory that some lookups report under its own code
  'AX', 'GF', 'GP', 'MQ', 'RE', 'YT', 'MF',
  // the rest of the EEA, where the GDPR applies as well
  'IS', 'LI', 'NO',
  // the UK, the Crown Dependencies and Gibraltar
  'GB', 'JE', 'GG', 'IM', 'GI',
  // Switzerland and Canada
  'CH', 'CA',
  // what some lookups say for "somewhere in Europe" when they cannot say where
  'EU',
]);

/** Codes a lookup uses for "unknown", an anonymising proxy or Tor: no country at all. */
const NOT_A_COUNTRY: ReadonlySet<string> = new Set(['XX', 'ZZ', 'T1', 'A1', 'A2', 'O1', 'AP']);

/** The country a header names, as an upper-case code, or null when it names none. */
export function countryFrom(header: string | null | undefined): string | null {
  const c = (header ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c) || NOT_A_COUNTRY.has(c)) return null;
  return c;
}

/** Whether the newsletter box starts ticked for a visitor from this country. */
export function newsletterTickedByDefault(country: string | null | undefined): boolean {
  const c = countryFrom(country);
  return c !== null && !OPT_IN_COUNTRIES.has(c);
}
