// components/JsonLd.tsx
//
// One schema.org description, written into the page as JSON-LD. The payload
// is escaped by safeJsonLd, so nothing in it can close the script element.

import { safeJsonLd } from '@/lib/structured-data';

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }} />;
}
