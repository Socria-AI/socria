// lib/write/flags.ts — the switch for the word processor's tools.
//
// The formatting bar, tables, pictures, page setup and the page view are on
// unless a deployment sets NEXT_PUBLIC_WRITE_RICH=off. Off is the rollback: the
// Writing Space goes back to its plain page — words, headings, lists, quotes —
// while every document keeps what it holds. A table, a picture, a colour or a
// font already in a document is still read, drawn, saved and exported; only
// the tools to make new ones are put away. Nothing is lost either way, which
// is why this is a switch and not a code rollback (docs/LOGOS-5.md §8).
//
// PURE.

/** Whether the word processor's tools are shown. Next inlines the literal reference at build time. */
export function richWriting(value: string | undefined = process.env.NEXT_PUBLIC_WRITE_RICH): boolean {
  return (value ?? '').trim().toLowerCase() !== 'off';
}
