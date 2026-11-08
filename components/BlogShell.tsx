'use client';
// components/BlogShell.tsx — the blog's masthead: the site's own
// (components/site/chrome.tsx SiteMast), with Blog marked as where you are
// and the way in beside the action.
//
// The blog is the one public surface that carries a way in, so it keeps it:
// "Sign in" as a word in the bar, or — signed in — the account, which on a
// reading surface links rather than opening a sheet (see AccountControl).
// The foot is the site's own as well (SiteFoot), which the pages render.
//
// A client module because Clerk's loading/loaded halves are client
// components; on the server the "loading" half is what renders, so the way
// in is in the page before Clerk has answered.

import Link from 'next/link';
import { ClerkLoaded, ClerkLoading, SignedIn, SignedOut } from '@clerk/nextjs';
import { AccountControl } from '@/components/account/AccountControl';
import { BLOG, SiteMast } from '@/components/site/chrome';

function SignInWord() {
  return (
    <Link href="/sign-in" className="s-mast-word">
      Sign in
    </Link>
  );
}

function Account() {
  return (
    <>
      <ClerkLoading>
        <SignInWord />
      </ClerkLoading>
      <ClerkLoaded>
        <SignedOut>
          <SignInWord />
        </SignedOut>
        <SignedIn>
          <AccountControl href="/account" />
        </SignedIn>
      </ClerkLoaded>
    </>
  );
}

/** The blog's masthead: on the index Blog is the page you are on; on a post, the section it is in. */
export function BlogMast({ post = false }: { post?: boolean }) {
  return <SiteMast current={post ? { section: BLOG.href } : BLOG.href} account={<Account />} />;
}
