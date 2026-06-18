import { createClient, type SanityClient } from 'next-sanity';
import { apiVersion, dataset, projectId, isSanityConfigured } from '../env';

let cached: SanityClient | null = null;

export function sanityClient(): SanityClient | null {
  if (!isSanityConfigured()) return null;
  if (cached) return cached;
  cached = createClient({
    projectId,
    dataset,
    apiVersion,
    useCdn: true,
    perspective: 'published',
  });
  return cached;
}
