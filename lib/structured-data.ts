// lib/structured-data.ts
//
// The schema.org descriptions search engines and AI answer engines read
// alongside a page: who publishes Socria, what the site is called, what the
// product is and costs, where a docs page sits, when a post was written, and
// the questions the support page answers.
//
// WHAT IS NOT HERE, ON PURPOSE: ratings and reviews. Socria has no collected
// reviews to report, and an AggregateRating invented for a richer search
// result is a fabricated claim with a schema around it.
//
// What each one buys, honestly: Organization and WebSite are how Google names
// the site and finds its logo; BreadcrumbList shows a docs page's place in
// its result; BlogPosting dates a post. Google stopped showing FAQ results for
// most sites in 2023, so FAQPage is for the answer engines that read it, not
// for a richer result. SoftwareApplication states the real prices.
//
// Pure. components/JsonLd.tsx renders any of these into the page.

import { SITE_NAME, SITE_URL, TAGLINE, absoluteUrl, ogImagePath, DEFAULT_DESCRIPTION } from './seo';
import { SOCRIA_ONE } from './socria-one';

type Ld = Record<string, unknown>;

const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;

/** Where Socria is, elsewhere — the profiles the site itself links to. */
export const SAME_AS = ['https://www.linkedin.com/company/socria', 'https://instagram.com/socriaai'];

export function organizationLd(): Ld {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: absoluteUrl('/socria-logo.png'),
    slogan: TAGLINE,
    sameAs: SAME_AS,
    contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', email: 'hellosocria@gmail.com' }],
  };
}

export function websiteLd(): Ld {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': SITE_ID,
    name: SITE_NAME,
    alternateName: ['Socria AI', `${SITE_NAME} — ${TAGLINE}`],
    url: `${SITE_URL}/`,
    publisher: { '@id': ORG_ID },
  };
}

/** The currency code for the symbol the price is shown with. */
function currencyCode(symbol: string): string {
  return symbol === '$' ? 'USD' : symbol === '€' ? 'EUR' : symbol === '£' ? 'GBP' : 'USD';
}

export function softwareApplicationLd(): Ld {
  const currency = currencyCode(SOCRIA_ONE.currency);
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'ProductivityApplication',
    operatingSystem: 'Web browser',
    url: `${SITE_URL}/`,
    description: DEFAULT_DESCRIPTION,
    image: absoluteUrl(ogImagePath('home')),
    publisher: { '@id': ORG_ID },
    offers: [
      { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: currency, url: absoluteUrl('/sign-up') },
      {
        '@type': 'Offer',
        name: SOCRIA_ONE.name,
        price: String(SOCRIA_ONE.price),
        priceCurrency: currency,
        url: absoluteUrl('/one'),
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: String(SOCRIA_ONE.price),
          priceCurrency: currency,
          billingDuration: 1,
          billingIncrement: 1,
          unitCode: SOCRIA_ONE.period === 'month' ? 'MON' : 'ANN',
        },
      },
    ],
  };
}

export function breadcrumbLd(trail: readonly { name: string; path: string }[]): Ld {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: absoluteUrl(t.path),
    })),
  };
}

export function blogPostingLd(p: {
  slug: string;
  title: string;
  excerpt?: string | null;
  publishedAt?: string | null;
  authorName?: string | null;
}): Ld {
  const url = absoluteUrl(`/blog/${p.slug}`);
  const published = p.publishedAt && Number.isFinite(Date.parse(p.publishedAt)) ? new Date(p.publishedAt).toISOString() : undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: p.title.slice(0, 110),
    ...(p.excerpt ? { description: p.excerpt } : {}),
    ...(published ? { datePublished: published, dateModified: published } : {}),
    author: p.authorName ? { '@type': 'Person', name: p.authorName } : { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
    image: absoluteUrl(ogImagePath(`blog/${p.slug}`)),
    mainEntityOfPage: url,
    url,
  };
}

export function faqPageLd(items: readonly { q: string; a: readonly string[] }[]): Ld {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.q,
      acceptedAnswer: { '@type': 'Answer', text: i.a.join(' ') },
    })),
  };
}

/**
 * JSON for inside a <script> element. JSON.stringify alone is not enough: a
 * title containing "</script>" would end the element early and the rest of
 * the string would become markup. Escaping <, > and & (and the two line
 * separators JavaScript treats as newlines) makes the payload inert.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
