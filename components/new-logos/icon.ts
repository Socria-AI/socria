// components/new-logos/icon.ts — New Logos' neutral mark: nine grey squares (a matrix, not a logo), as a data URI so
// nothing is fetched for it.
export const NEUTRAL_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='4' fill='#e6e6e6'/><g fill='#6b6b6b'><rect x='6' y='6' width='5' height='5'/><rect x='13.5' y='6' width='5' height='5'/><rect x='21' y='6' width='5' height='5'/><rect x='6' y='13.5' width='5' height='5'/><rect x='13.5' y='13.5' width='5' height='5'/><rect x='21' y='13.5' width='5' height='5'/><rect x='6' y='21' width='5' height='5'/><rect x='13.5' y='21' width='5' height='5'/><rect x='21' y='21' width='5' height='5'/></g></svg>"
  );
