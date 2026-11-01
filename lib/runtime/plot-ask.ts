// lib/runtime/plot-ask.ts — A QUICK PLOT, asked for.
//
// "plot y = x² from −3 to 3" opened Artifacts and built a plot there: the
// heavier choice now that the conversation draws a graph to change in place
// (lib/inline-ui.ts, kind graph). One function, a range at most, is drawn in
// the reply, and Keep files it in Artifacts if it is worth coming back to.
// Several functions, a surface, a simulation, or anything to make, build or
// keep is still a thing to build: it opens in Artifacts (lib/runtime/
// orchestrate.ts routeTurn).
//
// Pure, and no imports: orchestrate.ts and presentation.ts both read it.

const PLOT_VERB = /^(?:(?:can|could|would)\s+you\s+|please\s+|now\s+|let'?s\s+)?(?:plot|graph|sketch|draw)\s+(?:me\s+)?(?:the\s+)?(?:graph\s+of\s+|function\s+|curve\s+)?/i;
/** Anything that makes it a thing to build rather than a look at one function. */
const BUILD = /\b(?:make|build|keep|save|artifact|simulat\w*|animat\w*|3d|surface|z\s*=|and|vs\.?|versus|compare|both|several|family)\b/i;
/** One explicit function of x: "y = x^2", "f(x) = sin x", "x^2 - 3x", "sin(x)". */
const ONE_FUNCTION = /^(?:y\s*=|[fg]\s*\(\s*x\s*\)\s*=)?\s*[-\d(.]*\s*(?:x|sin|cos|tan|e\^|ln|log|sqrt|abs)[\w\s^*+\-/().|]*$/i;

export function quickPlot(text: string): boolean {
  const t = (text ?? '').trim();
  const m = PLOT_VERB.exec(t);
  if (!m) return false;
  const rest = t.slice(m[0].length);
  if (!rest || rest.length > 80) return false;
  // the range, said, is not part of the function: "from -3 to 3", "for x between 0 and 10"
  const body = rest
    .replace(/\s+(?:from|for|between|over|on|when)\s+(?:x\s*(?:from|between|in|=)?\s*)?[-−]?\s*[\d[(][\s\S]*$/i, '')
    .replace(/[.?!]+$/, '')
    .trim();
  if (!body || BUILD.test(body) || !/x/i.test(body) || /[,;]/.test(body) || (body.match(/=/g) ?? []).length > 1) return false;
  return ONE_FUNCTION.test(body);
}
