'use client';

import { useEffect, useRef, useState } from 'react';
import type { Insight } from '@/lib/socria-prompt';

type ShareFormat = 'square' | 'story';

const FORMAT_META: Record<
  ShareFormat,
  { label: string; canvasW: number; canvasH: number; previewW: number; previewH: number }
> = {
  square: {
    label: 'Square',
    canvasW: 1080,
    canvasH: 1080,
    previewW: 300,
    previewH: 300,
  },
  story: {
    label: 'Story',
    canvasW: 1080,
    canvasH: 1920,
    previewW: 220,
    previewH: 391,
  },
};

// Resolve the *actual* font-family string the browser uses for our serif /
// sans CSS variables. next/font emits an obfuscated family name (e.g.
// "__Instrument_Serif_abc123"), so a canvas that hard-codes "Instrument
// Serif" silently falls back to Georgia. Probing the computed style gives
// us the real stack to hand to the canvas.
function resolveFontStack(cssValue: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  try {
    const probe = document.createElement('span');
    probe.style.fontFamily = cssValue;
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    document.body.appendChild(probe);
    const fam = getComputedStyle(probe).fontFamily;
    probe.remove();
    return fam || fallback;
  } catch {
    return fallback;
  }
}

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    window.innerWidth < 640
  );
}

export function InsightShareModal({
  open,
  onClose,
  insight,
}: {
  open: boolean;
  onClose: () => void;
  insight: Insight | null;
}) {
  // Default to Story (portrait) on phones — that's what Instagram Stories
  // wants and where the native share sheet exposes it.
  const [format, setFormat] = useState<ShareFormat>('square');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [canFileShare, setCanFileShare] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (isMobileViewport()) setFormat('story');
    // Feature-detect file sharing (Web Share Level 2).
    try {
      const nav: any = navigator;
      const testFile = new File([new Blob()], 't.png', { type: 'image/png' });
      setCanFileShare(!!nav?.canShare?.({ files: [testFile] }));
    } catch {
      setCanFileShare(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !insight) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    (async () => {
      try {
        // Wait for Instrument Serif + Inter to be ready before drawing.
        if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
          await (document as any).fonts.ready;
        }
      } catch {}
      // Load the Socria mark so we can draw it on the card footer.
      const logo = await loadLogo();
      if (cancelled) return;
      const serif = resolveFontStack(
        'var(--font-serif), "Instrument Serif", Georgia, serif',
        'Georgia, serif'
      );
      const sans = resolveFontStack(
        'var(--font-sans), Inter, system-ui, sans-serif',
        'system-ui, sans-serif'
      );
      renderInsightCanvas(canvas, format, insight, logo, { serif, sans });
    })();

    return () => {
      cancelled = true;
    };
  }, [open, format, insight]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function handleShare() {
    const canvas = canvasRef.current;
    if (!canvas || !insight) return;

    setBusy(true);
    setStatus(null);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png', 0.95);
    });

    if (!blob) {
      setBusy(false);
      setStatus('Could not generate image.');
      return;
    }

    const filename = `socria-insight-${insight.id}.png`;
    const file = new File([blob], filename, { type: 'image/png' });

    try {
      const nav: any = typeof navigator !== 'undefined' ? navigator : null;
      if (nav?.canShare?.({ files: [file] }) && nav?.share) {
        await nav.share({
          files: [file],
          title: 'Socria insight',
          text: insight.text,
        });
        setStatus('Shared.');
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setStatus('Downloaded.');
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error('Share failed:', e);
        setStatus('Share cancelled.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open || !insight) return null;
  const meta = FORMAT_META[format];

  return (
    <div
      className="insight-share-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Share this insight"
    >
      <div className="insight-share-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="insight-share-close"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <p className="insight-share-eyebrow">Share this insight</p>
        <h3 className="insight-share-title">A card, made for reposting.</h3>

        <div className="insight-share-format-picker" role="tablist">
          {(Object.keys(FORMAT_META) as ShareFormat[]).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={f === format}
              onClick={() => setFormat(f)}
              className={`insight-share-format ${f === format ? 'active' : ''}`}
            >
              {FORMAT_META[f].label}
              <span className="insight-share-format-dims">
                {f === 'story' ? 'Instagram Story' : 'Post · 1:1'}
              </span>
            </button>
          ))}
        </div>

        <div className="insight-share-preview-wrap">
          <canvas
            ref={canvasRef}
            className="insight-share-canvas"
            style={{ width: meta.previewW, height: meta.previewH }}
          />
        </div>

        <div className="insight-share-actions">
          <button
            type="button"
            onClick={handleShare}
            disabled={busy}
            className="insight-share-primary"
          >
            <span className="insight-share-primary-shine" aria-hidden />
            <span className="insight-share-primary-label">
              {busy
                ? 'Preparing…'
                : canFileShare
                  ? format === 'story'
                    ? 'Share to Stories'
                    : 'Share'
                  : 'Download image'}
            </span>
            <span aria-hidden>→</span>
          </button>
          {status && <p className="insight-share-status">{status}</p>}
        </div>
        <p className="insight-share-hint">
          {canFileShare
            ? 'Opens your share sheet — pick Instagram to post to your Story.'
            : 'Saves a PNG you can upload to your Instagram Story.'}
        </p>
      </div>
    </div>
  );
}

// ---------- Canvas renderer ----------

// Load the Socria logo once, cached, for canvas drawing. Resolves null
// if it fails so the renderer can fall back to a drawn glyph.
let logoPromise: Promise<HTMLImageElement | null> | null = null;
function loadLogo(): Promise<HTMLImageElement | null> {
  if (logoPromise) return logoPromise;
  logoPromise = new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = '/socria-logo.png';
    } catch {
      resolve(null);
    }
  });
  return logoPromise;
}

function renderInsightCanvas(
  canvas: HTMLCanvasElement,
  format: ShareFormat,
  insight: Insight,
  logo: HTMLImageElement | null,
  fonts: { serif: string; sans: string }
) {
  const { serif, sans } = fonts;
  const { canvasW, canvasH } = FORMAT_META[format];
  canvas.width = canvasW;
  canvas.height = canvasH;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const isStory = format === 'story';

  // ---- Background ----
  const bg = ctx.createLinearGradient(0, 0, canvasW, canvasH);
  bg.addColorStop(0, '#F5F3EB');
  bg.addColorStop(1, '#ECE8DA');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Soft radial moss glow
  const glow = ctx.createRadialGradient(
    canvasW * 0.5,
    canvasH * (isStory ? 0.42 : 0.45),
    0,
    canvasW * 0.5,
    canvasH * (isStory ? 0.42 : 0.45),
    Math.max(canvasW, canvasH) * 0.55
  );
  glow.addColorStop(0, 'rgba(94, 118, 51, 0.14)');
  glow.addColorStop(1, 'rgba(94, 118, 51, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Faint grid pattern for texture
  ctx.strokeStyle = 'rgba(31, 31, 31, 0.03)';
  ctx.lineWidth = 1;
  const gridStep = 60;
  for (let y = 0; y < canvasH; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasW, y);
    ctx.stroke();
  }

  // ---- Header label ----
  const headerY = isStory ? canvasH * 0.18 : canvasH * 0.16;
  ctx.fillStyle = '#475a28';
  ctx.font = `600 ${isStory ? 26 : 24}px ${sans}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawSpacedText(
    ctx,
    (insight.headerLabel || 'ONE THING I NOTICED').toUpperCase(),
    canvasW * 0.5,
    headerY,
    5
  );

  // Small moss underline
  ctx.fillStyle = '#5e7633';
  const uW = 60;
  ctx.fillRect(canvasW * 0.5 - uW / 2, headerY + (isStory ? 30 : 26), uW, 3);

  // ---- Main insight text ----
  ctx.fillStyle = '#1F1F1F';
  const insightSize = isStory ? 78 : 68;
  ctx.font = `italic 400 ${insightSize}px ${serif}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxWidth = canvasW * 0.8;
  const lineHeight = insightSize * 1.28;
  const lines = wrapText(ctx, insight.text, maxWidth);
  const totalTextH = lines.length * lineHeight;
  const centerY = isStory ? canvasH * 0.48 : canvasH * 0.52;
  const startY = centerY - totalTextH / 2 + lineHeight / 2;

  lines.forEach((line, i) => {
    ctx.fillText(line, canvasW * 0.5, startY + i * lineHeight);
  });

  // ---- Footer / branding ----
  const footerY = isStory ? canvasH * 0.90 : canvasH * 0.88;

  // Socria mark — draw the real logo, contained in a small box above the
  // wordmark. Falls back to a drawn circle glyph if the image didn't load.
  const markSize = isStory ? 56 : 50;
  const markY = footerY - 46 - markSize / 2;
  if (logo && logo.width > 0) {
    const ratio = logo.width / logo.height || 1;
    let dw = markSize;
    let dh = markSize;
    if (ratio >= 1) dh = markSize / ratio;
    else dw = markSize * ratio;
    ctx.drawImage(logo, canvasW * 0.5 - dw / 2, markY + (markSize - dh) / 2, dw, dh);
  } else {
    ctx.strokeStyle = '#5e7633';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(canvasW * 0.5, footerY - 42, 14, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Socria wordmark
  ctx.fillStyle = '#1F1F1F';
  ctx.font = `400 ${isStory ? 46 : 42}px ${serif}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Socria', canvasW * 0.5, footerY);

  // Tagline
  ctx.fillStyle = '#475a28';
  ctx.font = `500 ${isStory ? 20 : 18}px ${sans}`;
  drawSpacedText(
    ctx,
    'THINK FOR YOURSELF.',
    canvasW * 0.5,
    footerY + (isStory ? 34 : 30),
    3
  );

  // Handle
  ctx.fillStyle = 'rgba(31, 31, 31, 0.42)';
  ctx.font = `400 ${isStory ? 18 : 16}px ${sans}`;
  ctx.fillText('@socriaai', canvasW * 0.5, footerY + (isStory ? 64 : 58));
}

// Word-wrap for canvas text.
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Manually draw text with letter-spacing (canvas 2d doesn't support it
// in all browsers). Uses measureText per character.
function drawSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  spacing: number
) {
  const chars = text.split('');
  const widths = chars.map((c) => ctx.measureText(c).width);
  const totalW = widths.reduce((s, w) => s + w, 0) + spacing * (chars.length - 1);
  let x = cx - totalW / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => {
    ctx.fillText(c, x, y);
    x += widths[i] + spacing;
  });
  ctx.textAlign = prevAlign;
}
