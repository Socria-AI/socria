# Search and discovery

November 2026. How socria.app introduces itself to search engines, answer engines and link previews; what an audit of
the built site found; what was changed; and what still needs doing outside the repository.

Where it lives:

| What | Where |
|---|---|
| Titles, descriptions, canonicals, preview cards, the public page list, the sitemap's entries, llms.txt, search engine verification | `lib/seo.ts` |
| Structured data (Organization, WebSite, SoftwareApplication, BreadcrumbList, BlogPosting, FAQPage) | `lib/structured-data.ts`, rendered by `components/JsonLd.tsx` |
| robots.txt (production allows, previews refuse everything) | `app/robots.ts` |
| sitemap.xml (public pages, docs, published posts, open events) | `app/sitemap.ts` |
| /llms.txt | `app/llms.txt/route.ts` |
| `X-Robots-Tag: noindex` on private routes | `next.config.js` `headers()`, kept in step with `PRIVATE_PREFIXES` in `lib/seo.ts` |
| Preview cards (`/og/<key>`) | `lib/og-cards.ts` |
| Which kind of page and site a sign-up came from | `lib/first-touch.ts` |
| Checks on the lists and objects | `test/seo.test.mjs` |
| Checks on what a running server sends | `scripts/verify-seo.mjs` |

## 1. What the audit found

The audit crawled a production build (`next build && next start`) the way a crawler does: every sitemap URL, the
`<head>` as sent, the page as drawn, every internal link, the private routes and a missing page. It also read the code.

Already sound before this pass:
- every public page names its own canonical;
- Open Graph and Twitter cards are complete on every page;
- the sitemap and llms.txt are built from the same lists;
- preview deployments are noindex and robots.txt refuses them;
- the 404 page answers 404 and is noindex;
- no internal link was broken;
- every sitemap URL answered 200 and named itself as canonical;
- the structured data parsed;
- fonts are local, swap-displayed and preloaded.

Problems found, and what became of each:

| # | Problem | Now |
|---|---|---|
| 1 | `/chat`, `/account` and `/studio` sent no noindex. `/chat` was disallowed in robots.txt, so even a noindex there could never be read, while every "Start a conversation" on the site links to it. | Noindex in their metadata and on every response (`X-Robots-Tag`). `/chat` is crawlable so the noindex is seen. |
| 2 | Titles and descriptions too long for a result: `/one` (82-character title, 256-character description), `/surfaces`, `/logos2`, the UT Austin page and three docs pages. One docs description was too short. | All between 60 and 165 characters. Docs pages take an optional `description` for search; the visible blurb is unchanged. |
| 3 | Heading structure: `/logos2` had no h1; `/blog`, `/surfaces` and `/docs/logos-3-5` skipped levels; the homepage's plans had no heading. | Fixed, except `/docs/logos-3-5` (see Limits). |
| 4 | The homepage's h1, "Come out sharper.", said nothing about what Socria is. No section named its capabilities, and few links led into the docs. | The h1 now begins "Socria · The Human-First AI that helps you think for yourself". A "What it does" section names six capabilities, each linking to where it is explained. |
| 5 | No page answered the main search intents: Socratic AI, an AI that asks questions, AI for critical thinking, AI for students. | Two guides, `/socratic-ai` and `/for-students` (section 3). |
| 6 | Structured data: `sameAs` missed TikTok, which the footer links to. SoftwareApplication listed no features. A code comment contradicted the free offer. | `sameAs` is exactly the footer's profiles; `featureList` matches the homepage's six capabilities; the comment is corrected. |
| 7 | No Search Console or Bing verification hook. | `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION`, written only when set (section 6). |
| 8 | llms.txt did not say what the names mean. | A "What the names mean" section: Logos 5 is Socria today, the earlier Logos versions were superseded, plus the Logic Map and Socria One. The models archived on 24 October 2026 are not named, because no copy names them (`test/no-core.test.mjs`). |
| 9 | Every HTML page is rendered per request and sent `Cache-Control: private, no-store`, so nothing public is cached at the edge. | Documented, not changed (section 5). |
| 10 | `/logos2`, a prototype of the archived Logos 2 workspace, was in the sitemap. Its physics is the same as `/surfaces`. | Noindex and out of the sitemap. It stays at its address; `/docs/logos-2` keeps the history. |

## 2. What it is told, and the words used

The words are the product's own and the claims are the docs' (`app/docs/content`). Nothing is keyword-stuffed. Nothing
claims "first", "best" or "only". Nothing promises an outcome: the docs say plainly that Socria "has not been studied with
the people who use it".

| Theme | Where it is answered |
|---|---|
| Socria AI, Human-First AI, AI that helps you think | the homepage (title, description, h1, What it does), the Charter (title: "The Socria Charter: Human-First AI") |
| Socratic AI, AI that asks questions, AI for critical thinking, AI for independent thinking, Socratic learning, AI reasoning assistant | `/socratic-ai` |
| AI for students, AI learning assistant, interactive AI learning | `/for-students` |
| AI-powered thinking tools, interactive visualisation | the homepage's What it does, `/docs/mathematics`, `/docs/economics`, `/surfaces`, `/explore` |
| Socria Logos, Logos 5 | `/docs/logos-5`, llms.txt |
| Socria Core | not named anywhere. It was archived on 24 October 2026, and the product's own rule is that no screen, page or piece of copy names it (`test/no-core.test.mjs`). `/docs/models` ("One model") and llms.txt say that Logos 5 is the one Socria offered. |

## 3. The guides

`components/site/Guide.tsx` sets a page like the Charter: one column, a serif voice, nothing that runs in the browser.

**`/socratic-ai`** covers:
- what Socratic questioning is;
- why an answer-first chatbot is not the same;
- exactly what Socria does: it asks first when the thinking is the point, does mechanical work directly, leaves decisions and writing to you, guides rather than solves in maths you are learning (the Answer Guard), and maps the reasoning;
- an example taken from the homepage;
- what keeps it honest (computed maths, citations limited to what it read).

**`/for-students`** covers problem sets, essays, readings, exams, and "learning, not shortcuts". That last section says the
course's own rules on AI still apply.

Each guide also has:
- four visible questions, carried word for word in its FAQPage data;
- BreadcrumbList data;
- its own preview card;
- a first-touch landing kind;
- links from the homepage, the footer, llms.txt and the sitemap.

`/students` is a different page: the retired UTA offer. It stays noindex.

## 4. What is indexed, and what never is

Signing in is what protects private work. robots.txt does not protect anything, and it cannot keep an address out of an
index. It only stops a crawler reading the page, and a blocked page can still be listed from a link to it.

| Route | How it stays out |
|---|---|
| `/chat` (Logos 5) | noindex in `app/chat/layout.tsx` and on every response; crawlable, so the noindex is read |
| `/account/*` | sign-in; noindex in `app/account/layout.tsx` and on every response; disallowed |
| `/studio` (Sanity) | Sanity's sign-in; noindex in its layout and on every response; disallowed |
| `/memory`, `/onboarding`, `/sso-callback`, `/s/*` (share links), `/r/*` (referrals), `/dev/*`, `/logos-5-internal`, `/logos2-test`, `/mind-ar`, `/model` | noindex in their metadata (where they render a page) and on every response |
| `/api/*` | noindex on every response; disallowed |
| `/events/admin/*`, `/events/:id/ticket`, `/events/:id/checkin` | noindex in their metadata and on every response |
| `/logos2`, `/students` | noindex in their metadata; out of the sitemap |
| Preview deployments | the root layout's noindex, and robots.txt `Disallow: /` |

## 5. Performance

What is in place:
- fonts are local, `display: swap`, and the two body faces are preloaded;
- the homepage's first-load JavaScript is about 118 kB;
- the product picture is HTML, not an image;
- the only scripts that run on the landing are the map's edges and the three demos.

What is not: every HTML page is rendered on request and sent `Cache-Control: private, no-cache, no-store`, the docs
articles included.
- **The cause** is `@clerk/nextjs` 5: its server `<ClerkProvider>` in `app/layout.tsx` calls `headers()`, which opts every route under it into dynamic rendering.
- **The cost** is not render time (about 20 ms a page in a local production build). It is that no public page can be served from the edge cache, and that serverless cold starts land on visitors and crawlers.
- **The fix** is outside this pass, because it touches every route's authentication:
  - upgrade to `@clerk/nextjs` 6, whose provider renders statically unless asked otherwise (its `auth()` becomes async, so every call site changes); or
  - move `<ClerkProvider>` out of the root layout into layouts for the app's routes only. None of the marketing pages use Clerk.

  Either should be done with its own testing.

## 6. Setting up outside the repository

None of this can be done from the code, and none of it has been done.

1. **Google Search Console.** Add a *Domain* property for `socria.app` and verify it with the DNS TXT record Google gives you (at the DNS host). That covers `www` and every subdomain and needs no code. If you prefer the HTML-tag method, set `GOOGLE_SITE_VERIFICATION` to the token (the value of `content`, not the whole tag) in Vercel's Production environment and redeploy. The tag is then written on every page.
2. **Submit the sitemap.** In Search Console, under Sitemaps, submit `https://socria.app/sitemap.xml`.
3. **Ask for the new pages.** Use URL Inspection on `https://socria.app/socratic-ai` and `https://socria.app/for-students`, then Request indexing.
4. **Bing Webmaster Tools.** Import the site from Search Console (simplest), or add it and verify by DNS. Alternatively, set `BING_SITE_VERIFICATION` to the `msvalidate.01` value and redeploy. Submit the same sitemap.
5. **One host.** In Vercel, under Project, then Settings, then Domains, check that `www.socria.app` redirects permanently to `socria.app` (or the reverse). Canonicals name `https://socria.app`, from `NEXT_PUBLIC_SITE_URL`.
6. **Watch.** Search Console's *Page indexing* and *Core Web Vitals* reports, Vercel Analytics (cookieless, already on every page), and sign-ups by first-touch source (`lib/first-touch.ts`, consent-gated, which records "google", "perplexity" and so on as the kind of site, never a query). Organic results take weeks to show; nothing here claims they have.

## 7. Checking it

- `node test/run.mjs seo` checks:
  - canonicals, the sitemap and llms.txt;
  - the private-prefix list against `next.config.js`;
  - robots;
  - verification, written only when given;
  - structured data: sameAs against the footer, featureList against the homepage's sections, FAQ text against the visible page;
  - every docs description's length;
  - the homepage's h1 and sections, rendered;
  - both guides, rendered.
- `node scripts/verify-seo.mjs --url <a production build or deployment> --site https://socria.app --axe` checks, against a running server:
  - every sitemap URL answers 200;
  - one title, a description and a canonical naming itself, each within limits and unique;
  - Open Graph and Twitter cards present;
  - JSON-LD that parses;
  - one h1 and no skipped heading levels;
  - images with alt text;
  - links with names;
  - axe's search-relevant rules;
  - every internal link landing;
  - every private route noindex;
  - a missing page answering 404.

  Against a local build it reads pages through Node rather than the browser's network, and with neutral headers, so that Clerk's development keys do not send it through a sign-in handshake.

The last run, against a local production build, read 32 indexable pages, followed 37 internal links and checked 9
private routes. One problem remained (Limits).

## 8. Limits

- **`/docs/logos-3-5` still skips a heading level.** The displays shown on it title themselves with h5 (`components/display`). Changing them would restyle them inside the docs, where `.d-article h3` outranks their class. This is a minor finding on an archived product's page.
- **The pricing words are the business's.** The homepage, the docs and the structured data say "Free: 20,000 tokens a day" and "Every account starts free", while `lib/trial.ts` ends free access after seven days. The product deliberately does not say how long it lasts. This pass did not change pricing copy; it is a decision for the business, and possibly for its lawyers.
- **The map has two names.** The docs and the site say "Logic Map"; the app's Logos 6 views call the canvas the "Mind Map". Public pages say "Logic Map", matching the docs, until the docs are renamed.
- **The blog was crawled without its posts.** Its content comes from Sanity, which a local build does not reach. The blog's own page structure was checked and fixed.
- **Dynamic rendering** (section 5).
- **No ranking, indexing or traffic change is claimed.** Only Search Console and analytics can show that, and only after the changes are live.
