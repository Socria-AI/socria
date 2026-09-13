# Socria — how to build with this system

Socria is a thinking environment, not a dashboard. Two visual worlds share one
palette, and putting a component in the wrong one is the mistake to avoid:

- **Editorial** (`/`, `/blog`, `/one`, `/logos`) — the journal. Paper ground,
  Instrument Serif at large sizes, long measures, generous air.
- **Logos** — the reasoning surface. Everything inside it is scoped under
  `.logos-root`, which redefines the whole token set to `--lg-*`.

## Wrapping

There is **no provider**. Components are plain React and style themselves from
CSS custom properties defined on `:root` in `styles.css`. Nothing needs a theme
context, and there is no `<SocriaProvider>` — do not invent one.

The one wrapper that matters is `.logos-root`. Any component whose name starts
`Logos*`, `Map*`, `Math*`, `Node*`, `Thinking*`, or `Draft*` reads `--lg-*`
tokens and renders unstyled outside it:

```jsx
<div className="logos-root">
  <ThinkingMap map={map} />
</div>
```

Editorial components (`InsightCard`, `SynthesisCard`, `CoverArt`, `BlogMotion`,
`SubscribeForm`, `TopicFilter`) belong **outside** it, on the paper ground.

## The styling idiom: CSS variables, not utility classes

There is no Tailwind preset to compose from here — the app uses Tailwind, but
the design system's own vocabulary is custom properties. Style your own layout
glue with `var(--*)`; never hard-code a hex.

**Editorial palette** (`:root`): `--paper`, `--paper-2`, `--ink`, `--ink-60`,
`--ink-40`, `--moss`, `--moss-50`, `--moss-100`, `--moss-200`, `--moss-600`,
`--moss-700`, `--moss-800`, `--sage`, `--sage-bright`, `--forest`, `--gold`,
`--blue`, `--border`, `--accent`, `--accent-700`, `--edge`.

**Socria One plate** (the subscription surfaces — a deep blue, deliberately the
only place that leaves the paper ground): `--one-blue-0`, `--one-blue-1`,
`--one-blue-2`, `--one-pblue`, `--one-pale`, `--one-cream`, `--one-plate`.

**Logos** (inside `.logos-root` only): `--lg-paper`, `--lg-panel`, `--lg-ink`,
`--lg-ink-60`, `--lg-ink-40`, `--lg-ink-24`, `--lg-line`, `--lg-primary`,
`--lg-secondary`, `--lg-accent`, `--lg-tension`, `--lg-one`, `--lg-one-line`,
`--lg-one-soft`.

**Type**: `--serif` (Instrument Serif — headings, and every italic accent),
`--sans` (Inter — body and UI), `--lg-hand` (Kalam — handwritten notes on the
Board), `--lg-stix` (STIX Two Text — mathematics).

## The signature: italic serif emphasis

The one thing that makes a surface read as Socria. A single word per passage,
in italic Instrument Serif and the green — never decorative, always the word
that carries the sentence. It is a class, not an inline style:

```jsx
<p>The assumption this rests on is <em className="socria-em">unexamined</em>.</p>
```

Assistant prose is rendered by `RichText`, which owns the whole vocabulary:
`.socria-strong` (bold label), `.socria-em` (the signature), `.socria-groups` /
`.socria-group-head` (a labelled list drawn as titled sections), and
`.socria-table-wrap`. Wrap its output in `.prose-socria` on editorial surfaces,
or let `.logos-root .lg-msg-body` style it inside Logos. Pass Markdown-ish text
straight in — `*emphasis*`, `**label**`, `-` bullets, `1.` steps, `|` tables:

```jsx
<div className="prose-socria">
  <RichText text={"Two things pull against each other.\n\n- **The offer:** more money.\n- **The work:** nothing new in *three years*."} />
</div>
```

## Where the truth lives

- `styles.css` and its `@import` closure — `fonts.css` (the four families) and
  `_ds_bundle.css` (every token and class above). Read it before styling; it is
  authoritative and this file is only a map of it.
- `components/general/<Name>/<Name>.prompt.md` — per-component API and usage.
- `components/general/<Name>/<Name>.d.ts` — the props contract.

## A build, idiomatically

```jsx
<article style={{
  background: 'var(--paper)',
  color: 'var(--ink)',
  fontFamily: 'var(--sans)',
  padding: '48px 24px',
  maxWidth: '68ch',
  margin: '0 auto',
}}>
  <h1 style={{ fontFamily: 'var(--serif)', fontSize: '3rem', lineHeight: 1.05, margin: 0 }}>
    Think for <em className="socria-em">yourself</em>.
  </h1>
  <div className="prose-socria">
    <RichText text={"Socria does not hand you the answer. It draws the *shape* of what you already think."} />
  </div>
  <InsightCard insight={{ text: 'You keep returning to security, never to growth.' }} />
</article>
```

Library components carry the controls; your own layout glue uses the tokens.
Never restyle a component's internals from outside — if it looks wrong, it is
almost always missing its `.logos-root` wrapper.
