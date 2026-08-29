// app/account/[[...account]]/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { UserProfile, useUser } from '@clerk/nextjs';

export default function AccountPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in?redirect_url=/account');
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-paper text-ink/60 font-serif italic">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-paper text-ink flex flex-col">
      <header className="px-6 md:px-10 py-6 flex items-center justify-between border-b border-border/60">
        <Link
          href="/"
          className="inline-flex items-center gap-2 group"
          aria-label="Socria home"
        >
          <Image
            src="/socria-logo.png"
            alt=""
            width={28}
            height={28}
            className="transition-transform group-hover:scale-105"
          />
          <span className="font-serif text-2xl tracking-tight text-ink">
            Socria
          </span>
        </Link>
        <div className="flex items-center gap-6 text-[13px] text-ink/60">
          <Link href="/chat" className="hover:text-ink transition-colors">
            Chat
          </Link>
          <Link href="/blog" className="hover:text-ink transition-colors">
            Journal
          </Link>
        </div>
      </header>

      <main className="flex-1 px-6 md:px-10 py-10 md:py-16">
        <div className="max-w-5xl mx-auto">
          <div className="mb-10 md:mb-14">
            <p className="text-[11px] uppercase tracking-[0.22em] text-moss-700 mb-4 font-medium">
              Your account
            </p>
            <h1 className="font-serif text-4xl md:text-5xl text-ink leading-tight">
              Manage your Socria account.
            </h1>
            <p className="mt-4 text-[15px] text-ink/60 max-w-xl leading-relaxed">
              Update your profile, security settings, and connected devices.
              Your thought sessions live in your account and follow you
              across every device you sign in on.
            </p>
            <p className="mt-4 text-[14px]">
              <Link
                href="/account/data"
                className="text-moss-700 underline underline-offset-4 hover:text-moss-800"
              >
                Data &amp; Privacy
              </Link>
              <span className="text-ink/45">
                {' '}— export everything, clear what Socria remembers, or delete
                your account.
              </span>
            </p>
          </div>

          <div className="socria-clerk-card socria-clerk-userprofile">
            <UserProfile routing="path" path="/account" />
          </div>
        </div>
      </main>

      <footer className="px-6 md:px-10 py-6 text-[12px] text-ink/40 font-serif italic text-center border-t border-border/60">
        Think for yourself.
      </footer>
    </div>
  );
}
