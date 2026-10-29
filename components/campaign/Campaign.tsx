'use client';

// components/campaign/Campaign.tsx — THE RELAUNCH PAGE.
//
// Black. A chat window assembles, starts typing, and comes apart into a
// network of nodes (lib/campaign/scene.ts, drawn by ./draw.ts). Then the one
// line — WE KILLED THE CHATBOT. — and beneath it a field for the access code
// and an Enter button. That is all the page says.
//
// The code goes to the server (app/api/access/enter) and nowhere else; a right
// one comes back as an httpOnly cookie, and the page steps into Logos 5: /chat
// from the homepage, or the address that was asked for (a share link, say),
// which the middleware now lets through. A wrong one is said quietly under
// the field.
//
// TIME. The opening runs once, about six and a half seconds; in a tab that has
// already seen it, a reload starts at the network forming; a key or a tap
// skips to the end; with reduced motion there is no opening at all, only the
// finished network, still. Its clock starts when the page arrived, not when
// the script did, so a slow phone joins the story late rather than holding the
// words back. And if the script never runs, the words and the field show
// anyway (campaign.css), and the field still works as a plain form.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CAMPAIGN_SEEN_KEY, ENTER_ROUTE, WAITLIST_ROUTE, enterError, waitlistError } from '@/lib/campaign';
import { TIMELINE, buildScene, type Scene } from '@/lib/campaign/scene';
import { drawFrame, painterFor, type Painter } from './draw';
import './campaign.css';

export function Campaign() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<() => void>(() => {});
  const leaveRef = useRef(0);
  const [live, setLive] = useState(false);
  const [stage, setStage] = useState(0);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  // no code yet: the same field takes an email for the waitlist (app/api/waitlist)
  const [list, setList] = useState(false);
  const [email, setEmail] = useState('');
  const [joined, setJoined] = useState(false);

  // the opening: its clock, its scene, its loop
  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!root || !canvas || !ctx) return;
    // alive: the opening calls the words in from here (campaign.css stands down its fallback)
    setLive(true);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(CAMPAIGN_SEEN_KEY) === '1';
    } catch {}
    // where the story starts: from the top; at the network forming for a tab that has seen it;
    // at the end without motion; and never further behind the page's arrival than two seconds
    const arrived = performance.now() / 1000;
    let offset = reduce ? TIMELINE.settled + 1 : Math.max(seen ? 4.1 : 0, Math.min(TIMELINE.settled, arrived - 2));
    const t0 = performance.now();
    const clock = () => offset + (performance.now() - t0) / 1000;

    let scene: Scene | null = null;
    let painter: Painter;
    let dpr = 1;
    // the network is rebuilt for a new width (a rotation, a resized window), never for a keyboard
    // that only takes height away — the nodes would all jump
    const size = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      if (scene && Math.abs(r.width - scene.w) < 1 && r.height <= scene.h + 1) return;
      scene = buildScene({ w: Math.max(1, r.width), h: Math.max(1, r.height) });
      painter = painterFor(scene);
    };
    size();

    // the pointer, which the network leans away from a little (eased)
    const fine = window.matchMedia('(pointer: fine)').matches;
    const aim = { x: 0, y: 0 };
    const lean = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      aim.x = -(e.clientX - window.innerWidth / 2);
      aim.y = -(e.clientY - window.innerHeight / 2);
    };
    if (fine && !reduce) window.addEventListener('pointermove', onMove, { passive: true });

    let shown = 0;
    const reveal = (t: number) => {
      const s = t >= TIMELINE.form ? 2 : t >= TIMELINE.title ? 1 : 0;
      if (s <= shown) return;
      shown = s;
      setStage(s);
      if (s === 2) {
        try {
          window.sessionStorage.setItem(CAMPAIGN_SEEN_KEY, '1');
        } catch {}
      }
    };

    let raf = 0;
    const frame = () => {
      const t = clock();
      lean.x += (aim.x - lean.x) * 0.05;
      lean.y += (aim.y - lean.y) * 0.05;
      const out = leaveRef.current ? 1 - Math.min(1, (performance.now() - leaveRef.current) / 600) : 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (scene) drawFrame(ctx, scene, painter, t, lean.x, lean.y, out);
      reveal(t);
      if (!reduce) raf = window.requestAnimationFrame(frame);
    };
    frame();

    // a key or a tap during the opening goes to its end
    skipRef.current = () => {
      const t = clock();
      if (t < TIMELINE.form) offset += TIMELINE.form + 0.05 - t;
      if (reduce) frame();
    };
    const onKey = (e: KeyboardEvent) => {
      if (clock() >= TIMELINE.form || e.metaKey || e.ctrlKey || e.altKey) return;
      skipRef.current();
      // a letter typed before the field was there still goes in it
      if (e.key.length === 1) {
        e.preventDefault();
        setCode((c) => (c + e.key).slice(0, 64));
      }
      window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
    };
    window.addEventListener('keydown', onKey);

    const resized = new ResizeObserver(() => {
      size();
      if (reduce) frame();
    });
    resized.observe(canvas);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('keydown', onKey);
      resized.disconnect();
    };
  }, []);

  // the field arrives: ready to type into, where there is a keyboard that will not cover it
  useEffect(() => {
    if (stage === 2 && window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus({ preventScroll: true });
  }, [stage]);

  // a phone's keyboard must not cover the field: lift the words and the field above it
  useEffect(() => {
    const vv = window.visualViewport;
    const root = rootRef.current;
    if (!vv || !root) return;
    let lift = 0;
    const fit = () => {
      const form = formRef.current;
      if (!form) return;
      const natural = form.getBoundingClientRect().bottom - lift;
      const visible = vv.offsetTop + vv.height;
      lift = Math.min(0, Math.round(visible - 16 - natural));
      root.style.setProperty('--wk-lift', `${lift}px`);
    };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    return () => {
      vv.removeEventListener('resize', fit);
      vv.removeEventListener('scroll', fit);
    };
  }, []);

  function shake() {
    const field = fieldRef.current;
    if (!field) return;
    field.classList.remove('is-wrong');
    void field.offsetWidth;
    field.classList.add('is-wrong');
  }

  async function join() {
    const typed = email.trim();
    if (!typed) {
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    let status: number | null = null;
    try {
      const res = await fetch(WAITLIST_ROUTE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: typed }), credentials: 'same-origin' });
      status = res.status;
      if (res.ok) {
        setBusy(false);
        setJoined(true);
        return;
      }
    } catch {
      status = null;
    }
    setBusy(false);
    setError(waitlistError(status));
    shake();
  }

  async function enter(e: FormEvent) {
    e.preventDefault();
    if (busy || leaving) return;
    if (list) {
      if (!joined) await join();
      return;
    }
    const typed = code.trim();
    if (!typed) {
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    let status: number | null = null;
    try {
      const res = await fetch(ENTER_ROUTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: typed }),
        credentials: 'same-origin',
      });
      status = res.status;
      if (res.ok) {
        // in: the page fades, then Logos 5 — from the homepage /chat, anywhere else the address asked for
        leaveRef.current = performance.now();
        setLeaving(true);
        window.setTimeout(() => {
          if (window.location.pathname === '/') window.location.assign('/chat');
          else window.location.reload();
        }, 650);
        return;
      }
    } catch {
      status = null;
    }
    setBusy(false);
    setError(enterError(status));
    // a small shake, started over on every miss
    shake();
    window.requestAnimationFrame(() => inputRef.current?.select());
  }

  return (
    <div
      ref={rootRef}
      className={`wk${live ? ' is-live' : ''}${stage >= 1 ? ' is-title' : ''}${stage >= 2 ? ' is-form' : ''}${leaving ? ' is-leaving' : ''}`}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget || e.target === canvasRef.current) skipRef.current();
      }}
    >
      <canvas ref={canvasRef} className="wk-canvas" aria-hidden="true" />
      <div className="wk-vignette" aria-hidden="true" />
      <main className="wk-stage">
        <h1 className="wk-title">
          <span>WE KILLED</span> <span>THE CHATBOT.</span>
        </h1>
        <form ref={formRef} className="wk-form" method="post" action={ENTER_ROUTE} onSubmit={enter} noValidate>
          <label className="wk-sr" htmlFor="wk-code">
            {list ? 'Email' : 'Access code'}
          </label>
          <div ref={fieldRef} className="wk-field" onAnimationEnd={(e) => e.currentTarget.classList.remove('is-wrong')}>
            <input
              ref={inputRef}
              id="wk-code"
              name={list ? 'email' : 'code'}
              className={`wk-input${list ? ' is-email' : ''}`}
              value={list ? email : code}
              onChange={(e) => {
                if (list) setEmail(e.target.value.slice(0, 254));
                else setCode(e.target.value.slice(0, 64));
                if (error) setError(null);
              }}
              placeholder={list ? 'Email' : 'Access code'}
              type={list ? 'email' : 'text'}
              inputMode={list ? 'email' : 'text'}
              autoComplete={list ? 'email' : 'off'}
              autoCapitalize={list ? 'none' : 'characters'}
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              maxLength={list ? 254 : 64}
              disabled={leaving || (list && joined)}
              aria-invalid={error ? true : undefined}
              aria-describedby="wk-error"
            />
            <button type="submit" className="wk-go" disabled={busy || leaving} aria-busy={busy || undefined}>
              {busy || leaving ? <span className="wk-spin" aria-label="Checking" /> : list ? joined ? 'Joined' : 'Join' : 'Enter'}
            </button>
          </div>
          <p id="wk-error" className={`wk-error${error || (list && joined) ? ' is-on' : ''}${list && joined && !error ? ' is-ok' : ''}`} role="status" aria-live="polite">
            {error ?? (list && joined ? 'You’re on the list.' : '')}
          </p>
          <button
            type="button"
            className="wk-alt"
            onClick={() => {
              setList((v) => !v);
              setError(null);
              window.requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            {list ? 'Have a code?' : 'No code? Join the waitlist'}
          </button>
        </form>
      </main>
    </div>
  );
}
