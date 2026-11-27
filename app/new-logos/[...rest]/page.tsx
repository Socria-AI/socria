// Any address under /new-logos that no page claims: the neutral not-found (app/new-logos/not-found.tsx), not the site's.
import { notFound } from 'next/navigation';

export default function NewLogosUnknown() {
  notFound();
}
