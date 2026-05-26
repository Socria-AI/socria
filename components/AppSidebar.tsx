// components/AppSidebar.tsx
'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from './Logo';
import { UserButton } from '@clerk/nextjs';
import type { Conversation } from '@/lib/types';

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const r = await fetch('/api/conversations', { cache: 'no-store' });
      if (r.ok) {
        const data = await r.json();
        setConversations(data.conversations || []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [pathname]);

  async function newSession() {
    const r = await fetch('/api/conversations', { method: 'POST' });
    if (r.ok) {
      const { conversation } = await r.json();
      router.push(`/chat/${conversation.id}`);
    }
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this thought session?')) return;
    const r = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    if (r.ok) {
      setConversations((c) => c.filter((x) => x.id !== id));
      if (pathname.includes(id)) router.push('/dashboard');
    }
  }

  return (
    <aside className="hidden md:flex flex-col w-72 shrink-0 border-r border-border/60 h-dvh sticky top-0 bg-paper/60 backdrop-blur-sm">
      <div className="px-5 h-16 flex items-center border-b border-border/60">
        <Logo />
      </div>

      <div className="p-3">
        <button
          onClick={newSession}
          className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border border-ink/15 hover:border-moss-600 hover:bg-moss-50/40 transition-all group"
        >
          <span className="text-moss-700 text-lg leading-none">+</span>
          <span className="text-[14px] text-ink/80 group-hover:text-ink font-medium">
            New thought session
          </span>
        </button>
      </div>

      <nav className="px-3 pb-3 space-y-1 text-[13px]">
        <SidebarLink href="/dashboard" active={pathname === '/dashboard'}>
          Dashboard
        </SidebarLink>
        <SidebarLink href="/settings" active={pathname === '/settings'}>
          Settings
        </SidebarLink>
      </nav>

      <div className="px-5 pt-2 pb-1 text-[10px] uppercase tracking-wider text-ink/40">
        Recent sessions
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <p className="px-3 py-2 text-xs text-ink/40">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="px-3 py-2 text-xs text-ink/40 font-serif italic">
            No sessions yet. Start one.
          </p>
        ) : (
          conversations.map((c) => {
            const active = pathname.includes(`/chat/${c.id}`);
            return (
              <Link
                key={c.id}
                href={`/chat/${c.id}`}
                className={`group flex items-center justify-between px-3 py-2 rounded-md text-[13px] transition-colors ${
                  active
                    ? 'bg-moss-50 text-ink'
                    : 'text-ink/70 hover:bg-ink/5 hover:text-ink'
                }`}
              >
                <span className="truncate flex-1">{c.title}</span>
                <button
                  onClick={(e) => deleteConversation(c.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-ink/40 hover:text-ink ml-2 px-1 transition-opacity"
                  aria-label="Delete"
                >
                  ×
                </button>
              </Link>
            );
          })
        )}
      </div>

      <div className="border-t border-border/60 p-4 flex items-center justify-between">
        <UserButton afterSignOutUrl="/" />
        <span className="text-[11px] text-ink/40 font-serif italic">
          Socria Core 1.0
        </span>
      </div>
    </aside>
  );
}

function SidebarLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`block px-3 py-2 rounded-md transition-colors ${
        active
          ? 'bg-moss-50 text-ink'
          : 'text-ink/70 hover:bg-ink/5 hover:text-ink'
      }`}
    >
      {children}
    </Link>
  );
}
