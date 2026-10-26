// lib/voice/flag.ts — SOCRIA VOICE, SWITCHABLE.
//
// On by default where it can work (Logos 5, a browser that can listen, someone
// who may send); off for a deployment with NEXT_PUBLIC_SOCRIA_VOICE=off (or 0,
// false, no) — the button is then not drawn at all. Read with the literal
// property name so Next.js inlines it into the client bundle.

const off = (v: string | undefined): boolean => /^(off|0|false|no)$/i.test((v ?? '').trim());

export const SOCRIA_VOICE: boolean = !off(process.env.NEXT_PUBLIC_SOCRIA_VOICE);
