// components/new-logos/server-auth.ts — who is signed in, for New Logos' server pages. A build without the account
// system configured (a local or preview build) reads as signed out rather than failing.

import 'server-only';
import { auth } from '@clerk/nextjs/server';

export function signedInOnServer(): string | null {
  try {
    return auth().userId ?? null;
  } catch {
    return null;
  }
}
