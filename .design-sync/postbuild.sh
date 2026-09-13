#!/bin/sh
# .design-sync/postbuild.sh — run after package-build.mjs, before validate.
#
# app/globals.css opens with `@import 'katex/dist/katex.min.css';` — a bare
# node_modules specifier that Next resolves through PostCSS at build time. The
# design converter copies stylesheets rather than resolving them, so that line
# survives into _ds_bundle.css pointing at a path that does not exist inside
# the bundle, and validate stops on [CSS_IMPORT_MISSING].
#
# The fix is to make the path true. KaTeX is copied in at the exact location
# the import names, with its 60 font files, so the bundle is self-contained:
# every design the agent builds renders equations correctly with no network
# call and nothing pinned to a CDN version that can move underneath it.
#
# Rewriting globals.css to a URL import was the alternative and is worse — it
# would change what the real app ships to make a tool happy.
set -e
OUT="${1:-./ds-bundle}"
SRC="${2:-./node_modules/katex/dist}"

[ -d "$OUT" ] || { echo "postbuild: $OUT does not exist — run package-build.mjs first" >&2; exit 1; }
[ -f "$SRC/katex.min.css" ] || { echo "postbuild: $SRC/katex.min.css not found — is katex installed?" >&2; exit 1; }

mkdir -p "$OUT/katex/dist"
cp "$SRC/katex.min.css" "$OUT/katex/dist/"
cp -r "$SRC/fonts" "$OUT/katex/dist/"
echo "postbuild: katex.min.css + $(ls "$OUT/katex/dist/fonts" | wc -l | tr -d ' ') font files → $OUT/katex/dist/"

# 2. The typefaces.
#
# fonts.css cannot ride in through config: `extraFonts` parses @font-face rules
# and copies local files (there are none — next/font fetches at build time), and
# `tokensGlob` only globs INSIDE a node_modules package, so neither reaches a
# repo-owned stylesheet. styles.css is the actual contract — rendered designs
# receive only its transitive @import closure — so the honest place to add it is
# there, at the top, ahead of the component CSS that reads the variables.
cp "./.design-sync/fonts.css" "$OUT/fonts.css"
printf '@import "./fonts.css";\n%s' "$(cat "$OUT/styles.css")" > "$OUT/styles.css.tmp"
mv "$OUT/styles.css.tmp" "$OUT/styles.css"
echo "postbuild: fonts.css → $OUT/ and @imported first from styles.css"
