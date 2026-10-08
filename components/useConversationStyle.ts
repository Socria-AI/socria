'use client';
// components/useConversationStyle.ts
//
// The account's Conversation Style, kept current in this tab — what every
// request to Core 4 and Logos carries as `conversationStyle`.
//
// The account is the authority (user_profiles.conversation_style, through
// /api/profile). This browser keeps a copy so the first message of a visit
// does not wait on a round trip, and asks the account again:
//
//   when the page loads, and
//   when the tab comes back into view — at most once a minute — so a style
//   changed on the phone is the one the laptop's next message uses.
//
// A change made in this tab (STYLE_CHANGED) or in another tab (the storage
// event) is heard at once. Signed out there is no account to ask, and the
// style is the Thinker.

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  DEFAULT_CONVERSATION_STYLE,
  readStoredStyle,
  resolveConversationStyle,
  STYLE_CHANGED,
  STYLE_STORAGE_KEY,
  writeStoredStyle,
  type ConversationStyle,
} from '@/lib/conversation-style';

const RECHECK_MS = 60_000;

// Shared by every instance in the tab: one question to the account at a time,
// and a choice made while a question was out wins over the stale answer.
let lastAsked = 0;
let asking: Promise<void> | null = null;
let epoch = 0;

function announce(style: ConversationStyle) {
  window.dispatchEvent(new CustomEvent(STYLE_CHANGED, { detail: style }));
}

/** Ask the account, and adopt its answer — unless the person chose since. */
function askAccount(force = false): Promise<void> {
  const now = Date.now();
  if (asking) return asking;
  if (!force && now - lastAsked < RECHECK_MS) return Promise.resolve();
  lastAsked = now;
  const startedAt = epoch;
  asking = (async () => {
    try {
      const res = await fetch('/api/profile?only=conversationStyle', { cache: 'no-store' });
      if (!res.ok) return;
      const j = await res.json().catch(() => null);
      // null: the account cannot hold a style yet — this browser's copy stands.
      if (!j || j.conversationStyle == null || startedAt !== epoch) return;
      const next = resolveConversationStyle(j.conversationStyle);
      if (next !== readStoredStyle(window.localStorage)) {
        writeStoredStyle(window.localStorage, next);
        announce(next);
      }
    } catch {
      /* offline: the copy stands until the next look */
    } finally {
      asking = null;
    }
  })();
  return asking;
}

export function useConversationStyle(signedIn: boolean): {
  style: ConversationStyle;
  /** for request builders that read it at send time */
  ref: MutableRefObject<ConversationStyle>;
} {
  const [style, setStyle] = useState<ConversationStyle>(DEFAULT_CONVERSATION_STYLE);
  const ref = useRef<ConversationStyle>(DEFAULT_CONVERSATION_STYLE);
  ref.current = style;

  useEffect(() => {
    if (!signedIn) {
      setStyle(DEFAULT_CONVERSATION_STYLE);
      return;
    }
    let local: ConversationStyle = DEFAULT_CONVERSATION_STYLE;
    try {
      local = readStoredStyle(window.localStorage);
    } catch {}
    setStyle(local);
    void askAccount(true);

    const onChange = (e: Event) => setStyle(resolveConversationStyle((e as CustomEvent).detail));
    const onStorage = (e: StorageEvent) => {
      if (e.key === STYLE_STORAGE_KEY || e.key === null) setStyle(readStoredStyle(window.localStorage));
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void askAccount();
    };
    window.addEventListener(STYLE_CHANGED, onChange);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(STYLE_CHANGED, onChange);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [signedIn]);

  return { style, ref };
}

/** Where a choice ended up. */
export type StyleSave = 'account' | 'device' | 'failed';

/**
 * Choose a style: this tab and this browser at once, then the account.
 *
 * 'device' is an account that cannot hold a style yet (the column is not in
 * the database) — the choice works here and follows nowhere else. 'failed' is
 * a choice the account did not take; the caller puts the old one back, so
 * what the sheet shows is what the next message will use.
 */
export async function saveConversationStyle(style: ConversationStyle): Promise<StyleSave> {
  epoch++;
  const s = writeStoredStyle(window.localStorage, style);
  announce(s);
  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationStyle: s }),
    });
    if (!res.ok) return 'failed';
    const j = await res.json().catch(() => null);
    return Array.isArray(j?.unsaved) && j.unsaved.includes('conversationStyle') ? 'device' : 'account';
  } catch {
    return 'failed';
  }
}

/** Put a choice back after the account refused it. */
export function restoreConversationStyle(style: ConversationStyle) {
  epoch++;
  const s = writeStoredStyle(window.localStorage, style);
  announce(s);
}
