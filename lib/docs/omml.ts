// lib/docs/omml.ts — a Word equation, written out so it can be read and graphed.
//
// Word stores an equation as Office Math Markup (OMML): a tree of fractions,
// scripts, radicals, n-ary operators and delimiters. The old reader kept only
// Word's own text runs and so dropped every equation entirely. This writes the
// tree out in the plain linear notation people type and the Plot lens reads:
//
//   fraction      (num)/(den)          sum      ∑_(i=1)^(n) x_i
//   superscript   x^2, e^(−x)          root     √(b^2 − 4ac), (x)^(1/3)
//   subscript     x_i, a_(n+1)         function sin(x)
//   delimiters    (…), [a, b], |x|     matrix   [[a, b], [c, d]]
//
// Parentheses are added only where the notation needs them, and the
// equation's own symbols are kept as Word holds them.
//
// PURE.

import { attr, isNode, kid, kids, textOf, type XNode } from './xml';

/** A part atomic enough to stand without parentheses: one symbol, a number, a name, or already bracketed. */
function atomic(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if ([...t].length === 1) return true;
  if (/^[\p{L}][\p{L}\p{N}]*$/u.test(t) && t.length <= 3) return true;
  if (/^\d+(?:\.\d+)?$/.test(t)) return true;
  if (/^[([{|].*[)\]}|]$/.test(t) && balancedWrap(t)) return true;
  return false;
}

function balancedWrap(t: string): boolean {
  // "(a)(b)" is not one bracketed part; "(a(b))" is
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) {
      depth--;
      if (depth === 0 && i < t.length - 1) return false;
    }
  }
  return depth === 0;
}

const wrap = (s: string) => (atomic(s) ? s.trim() : `(${s.trim()})`);
const arg = (n: XNode | undefined, name: string) => linear(kid(n, name));

/** One OMML node (an m:oMath, or anything inside one) written out linearly. */
export function linear(n: XNode | string | undefined): string {
  if (n === undefined) return '';
  if (!isNode(n)) return n;
  switch (n.name) {
    case 'm:r':
    case 'w:r':
      return kids(n)
        .filter((c) => c.name === 'm:t' || c.name === 'w:t')
        .map(textOf)
        .join('');
    case 'm:t':
    case 'w:t':
      return textOf(n);
    case 'm:f': {
      const num = arg(n, 'm:num');
      const den = arg(n, 'm:den');
      return `${wrap(num)}/${wrap(den)}`;
    }
    case 'm:sSup':
      return `${wrap(arg(n, 'm:e'))}^${wrap(arg(n, 'm:sup'))}`;
    case 'm:sSub':
      return `${wrap(arg(n, 'm:e'))}_${wrap(arg(n, 'm:sub'))}`;
    case 'm:sSubSup':
      return `${wrap(arg(n, 'm:e'))}_${wrap(arg(n, 'm:sub'))}^${wrap(arg(n, 'm:sup'))}`;
    case 'm:sPre':
      return `_${wrap(arg(n, 'm:sub'))}^${wrap(arg(n, 'm:sup'))}${wrap(arg(n, 'm:e'))}`;
    case 'm:rad': {
      const hidden = attr(kid(kid(n, 'm:radPr'), 'm:degHide'), 'val');
      const deg = arg(n, 'm:deg').trim();
      const e = arg(n, 'm:e');
      if (!deg || hidden === '1' || hidden === 'on' || hidden === 'true') return `√${wrap(e)}`;
      if (deg === '3') return `∛${wrap(e)}`;
      if (deg === '4') return `∜${wrap(e)}`;
      return `${wrap(e)}^(1/${deg})`;
    }
    case 'm:nary': {
      const chr = attr(kid(kid(n, 'm:naryPr'), 'm:chr'), 'val') || '∫';
      const sub = arg(n, 'm:sub').trim();
      const sup = arg(n, 'm:sup').trim();
      const e = arg(n, 'm:e').trim();
      return `${chr}${sub ? `_${wrap(sub)}` : ''}${sup ? `^${wrap(sup)}` : ''} ${e}`.trim();
    }
    case 'm:d': {
      const pr = kid(n, 'm:dPr');
      const beg = attr(kid(pr, 'm:begChr'), 'val');
      const end = attr(kid(pr, 'm:endChr'), 'val');
      const sep = attr(kid(pr, 'm:sepChr'), 'val');
      const parts = kids(n, 'm:e').map(linear);
      return `${beg ?? '('}${parts.join(sep === undefined ? (parts.length > 1 ? ', ' : '') : sep)}${end ?? ')'}`;
    }
    case 'm:func': {
      const name = arg(n, 'm:fName').trim();
      const e = arg(n, 'm:e').trim();
      return /^[([]/.test(e) && balancedWrap(e) ? `${name}${e}` : `${name}(${e})`;
    }
    case 'm:acc': {
      const chr = attr(kid(kid(n, 'm:accPr'), 'm:chr'), 'val') || '̂';
      const e = arg(n, 'm:e').trim();
      return [...e].length === 1 ? `${e}${chr}` : `${wrap(e)}${chr}`;
    }
    case 'm:bar': {
      const e = arg(n, 'm:e').trim();
      return [...e].length === 1 ? `${e}̅` : `bar${wrap(e)}`;
    }
    case 'm:limLow':
      return `${arg(n, 'm:e').trim()}_${wrap(arg(n, 'm:lim'))}`;
    case 'm:limUpp':
      return `${arg(n, 'm:e').trim()}^${wrap(arg(n, 'm:lim'))}`;
    case 'm:eqArr':
      return kids(n, 'm:e').map(linear).join('; ');
    case 'm:m':
      return `[${kids(n, 'm:mr')
        .map((r) => `[${kids(r, 'm:e').map(linear).join(', ')}]`)
        .join(', ')}]`;
    case 'm:box':
    case 'm:borderBox':
    case 'm:phant':
    case 'm:groupChr':
      return arg(n, 'm:e');
    // properties carry no text of their own
    case 'm:rPr':
    case 'w:rPr':
    case 'm:fPr':
    case 'm:naryPr':
    case 'm:dPr':
    case 'm:radPr':
    case 'm:sSupPr':
    case 'm:sSubPr':
    case 'm:sSubSupPr':
    case 'm:funcPr':
    case 'm:accPr':
    case 'm:barPr':
    case 'm:limLowPr':
    case 'm:limUppPr':
    case 'm:eqArrPr':
    case 'm:mPr':
    case 'm:ctrlPr':
    case 'm:oMathParaPr':
    case 'm:boxPr':
    case 'm:groupChrPr':
    case 'm:phantPr':
    case 'm:borderBoxPr':
    case 'm:sPrePr':
      return '';
    default:
      return n.children.map(linear).join('');
  }
}

/** An equation (m:oMath or m:oMathPara) as one line, with space round its relations. */
export function equationText(n: XNode): string {
  const parts = n.name === 'm:oMathPara' ? kids(n, 'm:oMath').map(linear) : [linear(n)];
  return parts
    .map((p) =>
      p
        .replace(/\s*([=<>≤≥≠≈≡→⇒⇔∝])\s*/g, ' $1 ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .join('; ');
}
