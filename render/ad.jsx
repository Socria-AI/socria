// ad.jsx — Socria "Think For Yourself." 15s vertical spot
// Composes scenes inside the <Stage> from animations.jsx.

const C = {
  bg:      '#f5f3eb',
  ink:     '#2f2e29',   // warm near-black body text
  inkSoft: '#56544c',
  green:   '#5e7633',   // primary — Socria label
  forest:  '#354620',   // deep forest — slogan / mark
  sage:    '#9cb874',
  gold:    '#b8a26b',   // insight gold — breakthrough, used once
  line:    'rgba(53,70,32,0.10)',
};

const SERIF = "'Instrument Serif', Georgia, serif";
const SANS  = "'Inter', system-ui, sans-serif";

const PAD = 78;          // side padding
const STAGE_W = 1080;
const CONTENT_W = STAGE_W - PAD * 2;

// ── timing map (seconds) ─────────────────────────────────────────────
const T = {
  msg1:      0.4,
  sTyping0:  2.5,  sTyping1: 3.7,
  sLabel:    3.75,
  q1:        4.0,  q2: 4.65, q3: 5.3,
  uTyping0:  8.5,  uTyping1: 9.45,
  msg2:      9.55,
  chatOut:   11.4,
  card:      11.7,
  cardLogo:  11.95,
  cardSlogan:12.7,
};

// ── reusable reveal wrapper ──────────────────────────────────────────
function Appear({ at, dur = 0.55, out = null, outDur = 0.45, y = 22, ease = Easing.easeOutCubic, style, children }) {
  const time = useTime();
  let opacity = 0, ty = y;
  if (time >= at) {
    const e = ease(clamp((time - at) / dur, 0, 1));
    opacity = e;
    ty = (1 - e) * y;
  }
  if (out != null && time >= out) {
    const e = Easing.easeInCubic(clamp((time - out) / outDur, 0, 1));
    opacity = (1 - e);
    ty -= e * 14;
  }
  return (
    <div style={{ opacity, transform: `translateY(${ty}px)`, willChange: 'transform, opacity', ...style }}>
      {children}
    </div>
  );
}

// ── Socria mark — official logo (hand-drawn pyramid) ─────────────────
function Mark({ size = 46, light = false }) {
  const R = (typeof window !== 'undefined' && window.__resources) || {};
  const src = light ? (R.logoLight || 'logo-light.png') : (R.logo || 'logo.png');
  return (
    <img src={src} alt="Socria" width={size} height={size} style={{ display: 'block', objectFit: 'contain' }} />
  );
}

// ── animated typing indicator (three dots) ───────────────────────────
function TypingDots({ at, until, align = 'left', top }) {
  const time = useTime();
  if (time < at || time >= until) return null;
  const appear = clamp((time - at) / 0.22, 0, 1);
  const leave = clamp((until - time) / 0.18, 0, 1);
  const o = Math.min(appear, leave);
  const dot = (i) => {
    const ph = ((time * 2.6) + i * 0.28) % 1;
    const lift = Math.sin(ph * Math.PI);
    return (
      <span key={i} style={{
        width: 15, height: 15, borderRadius: '50%',
        background: C.green,
        opacity: 0.35 + 0.55 * lift,
        transform: `translateY(${-lift * 6}px)`,
        display: 'inline-block',
      }} />
    );
  };
  return (
    <div style={{
      position: 'absolute', top, left: PAD, right: PAD,
      display: 'flex', justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
      opacity: o,
    }}>
      <div style={{
        display: 'flex', gap: 13, alignItems: 'center',
        padding: '26px 34px',
        background: 'rgba(255,255,255,0.55)',
        border: `1px solid ${C.line}`,
        borderRadius: 26,
      }}>
        {[0, 1, 2].map(dot)}
      </div>
    </div>
  );
}

// ── user message bubble (right aligned) ──────────────────────────────
function UserBubble({ at, out, top, children, accent = false }) {
  return (
    <Appear at={at} out={out} y={20} style={{
      position: 'absolute', top, left: PAD, right: PAD,
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div style={{
        maxWidth: 760,
        padding: '30px 40px',
        background: accent ? 'rgba(184,162,107,0.13)' : 'rgba(255,255,255,0.55)',
        border: `1px solid ${accent ? 'rgba(184,162,107,0.55)' : C.line}`,
        borderRadius: 30,
        borderBottomRightRadius: 10,
        color: C.ink,
        fontFamily: SANS,
        fontWeight: 500,
        fontSize: 43,
        lineHeight: 1.34,
        letterSpacing: '-0.01em',
        textAlign: 'left',
      }}>
        {children}
      </div>
    </Appear>
  );
}

// ── the chat scene ───────────────────────────────────────────────────
function ChatScene() {
  const time = useTime();
  // gentle continuous drift so the frame is never dead-static
  const drift = -interpolate([0, 15], [0, 46], Easing.linear)(time);
  const out = T.chatOut;

  return (
    <div style={{ position: 'absolute', inset: 0, transform: `translateY(${drift}px)` }}>

      {/* header */}
      <Appear at={0.15} y={0} dur={0.6} out={out} style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 132,
        display: 'flex', alignItems: 'center', gap: 22,
        padding: `0 ${PAD}px`,
        borderBottom: `1px solid ${C.line}`,
        background: 'rgba(245,243,235,0.7)',
      }}>
        <Mark size={48} />
        <span style={{ fontFamily: SERIF, fontSize: 56, color: C.ink, lineHeight: 1, letterSpacing: '0.01em' }}>Socria</span>
        <span style={{ marginLeft: 'auto', fontFamily: SANS, fontSize: 24, letterSpacing: '0.18em', color: C.inkSoft, textTransform: 'uppercase', fontWeight: 600 }}>Thought session</span>
      </Appear>

      {/* user dilemma */}
      <UserBubble at={T.msg1} out={out} top={278}>
        UT or A&amp;M? Twelve pro-con lists in and I&rsquo;m still stuck.
      </UserBubble>

      {/* Socria thinking */}
      <TypingDots at={T.sTyping0} until={T.sTyping1} top={520} align="left" />

      {/* Socria label + reflective question */}
      <Appear at={T.sLabel} out={out} y={10} style={{
        position: 'absolute', top: 520, left: PAD, right: PAD,
      }}>
        <div style={{
          fontFamily: SANS, fontSize: 24, fontWeight: 600,
          letterSpacing: '0.22em', color: C.green, textTransform: 'uppercase',
          marginBottom: 30,
        }}>Socria</div>
      </Appear>

      <div style={{ position: 'absolute', top: 592, left: PAD, right: PAD }}>
        <Appear at={T.q1} out={out} y={20}>
          <Line>Set the lists aside for a second.</Line>
        </Appear>
        <Appear at={T.q2} out={out} y={20} style={{ marginTop: 14 }}>
          <Line>Which version of the next four years</Line>
        </Appear>
        <Appear at={T.q3} out={out} y={20}>
          <Line>already feels like <em style={{ fontStyle: 'italic', fontFamily: SERIF, fontSize: 60, color: C.forest }}>yours</em>?</Line>
        </Appear>
      </div>

      {/* user thinking */}
      <TypingDots at={T.uTyping0} until={T.uTyping1} top={980} align="right" />

      {/* realization — insight gold */}
      <UserBubble at={T.msg2} out={out} top={970} accent>
        &hellip;honestly? I think I&rsquo;ve known the answer all along.
      </UserBubble>

    </div>
  );
}

function Line({ children }) {
  return (
    <div style={{
      fontFamily: SANS, fontWeight: 500, fontSize: 50,
      lineHeight: 1.28, letterSpacing: '-0.012em', color: C.ink,
    }}>{children}</div>
  );
}

// ── end card — logo lockup + slogan ──────────────────────────────────
function EndCard() {
  const time = useTime();
  if (time < T.card - 0.05) return null;
  // slow breathing scale so the hold isn't static
  const s = interpolate([T.card, 15], [1.0, 1.035], Easing.easeOutSine)(time);
  const intro = Easing.easeOutCubic(clamp((time - T.card) / 0.5, 0, 1));

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: C.green,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      opacity: intro,
      transform: `scale(${s})`,
      transformOrigin: 'center',
    }}>
      <Appear at={T.cardLogo} dur={0.6} y={26} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
        <Mark size={150} light />
        <div style={{ fontFamily: SERIF, fontSize: 132, color: C.bg, lineHeight: 0.9, letterSpacing: '0.01em' }}>Socria</div>
      </Appear>

      {/* spacing between wordmark and slogan */}
      <div style={{ height: 96 }} />

      <Appear at={T.cardSlogan} dur={0.75} y={30} ease={Easing.easeOutCubic}>
        <div style={{
          fontFamily: SERIF, fontSize: 78, lineHeight: 1.04,
          color: C.bg, textAlign: 'center', letterSpacing: '0.005em', whiteSpace: 'nowrap',
        }}>
          Think For Yourself.
        </div>
      </Appear>
    </div>
  );
}

// ── timecode tagger (for review comments) ────────────────────────────
function Timecode() {
  const time = useTime();
  React.useEffect(() => {
    const root = document.getElementById('socria-video');
    if (root) root.setAttribute('data-screen-label', `t=${time.toFixed(1)}s`);
  }, [Math.floor(time)]);
  return null;
}

// ── record button ────────────────────────────────────────────────────
function RecordButton({ recording, onClick }) {
  return (
    <button onClick={onClick} disabled={recording} title="Record the spot and download" style={{
      position: 'fixed', bottom: 14, right: 16, zIndex: 60,
      display: 'flex', alignItems: 'center', gap: 9,
      padding: '9px 15px',
      background: recording ? 'rgba(94,118,51,0.95)' : 'rgba(20,20,20,0.92)',
      border: '1px solid rgba(255,255,255,0.14)',
      borderRadius: 999,
      color: '#f5f3eb',
      fontFamily: "'Inter', system-ui, sans-serif",
      fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', whiteSpace: 'nowrap',
      cursor: recording ? 'default' : 'pointer',
    }}>
      <span style={{
        width: 11, height: 11, borderRadius: '50%',
        background: recording ? '#fff' : '#d6533e',
        boxShadow: recording ? '0 0 0 3px rgba(255,255,255,0.25)' : 'none',
        animation: recording ? 'socria-rec-pulse 1s ease-in-out infinite' : 'none',
      }} />
      {recording ? 'Recording…' : 'Record'}
    </button>
  );
}

// ── timeline bridge — exposes playback controls to the recorder ───────
function TimelineBridge({ ctrlRef }) {
  const { setTime, setPlaying, duration } = useTimeline();
  React.useEffect(() => {
    ctrlRef.current.setTime = setTime;
    ctrlRef.current.setPlaying = setPlaying;
    ctrlRef.current.duration = duration;
  });
  return null;
}

// ── app ──────────────────────────────────────────────────────────────
function SocriaAd() {
  const [recording, setRecording] = React.useState(false);
  const ctrl = React.useRef({});

  const record = async () => {
    if (recording) return;
    const c = ctrl.current;
    if (!c.setTime) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia || !window.MediaRecorder) {
      alert('This browser can\u2019t record in-page. Use a screen recorder (e.g. OBS) instead.');
      return;
    }

    // Kick off fullscreen + display capture together, within the click gesture,
    // so the browser grabs the maximum on-screen pixel density.
    const fsP = (document.documentElement.requestFullscreen
      ? document.documentElement.requestFullscreen().catch(() => {})
      : Promise.resolve());
    let display;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 60, width: { ideal: 3840 }, height: { ideal: 2160 } },
        audio: true,
      });
    } catch (e) {
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch (_) {}
      return; // user cancelled the picker
    }
    await fsP;
    await new Promise(r => setTimeout(r, 400)); // let fullscreen layout settle

    // Mirror just the 9:16 frame onto a clean 1080×1920 canvas (no letterbox).
    const video = document.createElement('video');
    video.srcObject = display; video.muted = true; video.playsInline = true;
    await video.play().catch(() => {});
    await new Promise(r => { if (video.videoWidth) r(); else video.onloadedmetadata = () => r(); });

    const W = STAGE_W, H = 1920;
    const pc = document.createElement('canvas'); pc.width = W; pc.height = H;
    const pctx = pc.getContext('2d');
    pctx.imageSmoothingEnabled = true; pctx.imageSmoothingQuality = 'high';

    let raf = 0;
    const draw = () => {
      const el = document.getElementById('anim-canvas');
      const vw = video.videoWidth, vh = video.videoHeight;
      if (el && vw && vh) {
        const r = el.getBoundingClientRect();
        const rx = vw / window.innerWidth, ry = vh / window.innerHeight;
        let sx = r.left * rx, sy = r.top * ry, sw = r.width * rx, sh = r.height * ry;
        sx = Math.max(0, sx); sy = Math.max(0, sy);
        sw = Math.min(sw, vw - sx); sh = Math.min(sh, vh - sy);
        if (sw > 0 && sh > 0) pctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
      }
      raf = requestAnimationFrame(draw);
    };

    // Build the output stream: crisp canvas video only (silent spot).
    const out = new MediaStream();
    pc.captureStream(60).getVideoTracks().forEach(t => out.addTrack(t));

    const mimes = [
      'video/mp4;codecs=avc1.640028',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    const mimeType = mimes.find(m => MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(out, mimeType
      ? { mimeType, videoBitsPerSecond: 24000000 }
      : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const cleanup = () => {
      cancelAnimationFrame(raf);
      display.getTracks().forEach(t => t.stop());
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch (_) {}
    };
    rec.onstop = () => {
      cleanup();
      const type = rec.mimeType || mimeType || 'video/webm';
      const blob = new Blob(chunks, { type });
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'socria-think-for-yourself.' + ext;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 8000);
      setRecording(false);
      c.setPlaying(false);
    };
    display.getVideoTracks()[0].addEventListener('ended', () => { if (rec.state !== 'inactive') rec.stop(); });

    setRecording(true);
    c.setTime(0);
    c.setPlaying(false);
    setTimeout(() => {
      draw();                 // begin mirroring
      c.setPlaying(true);     // play from 0:00
      rec.start();
      const dur = (c.duration || 15);
      setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, dur * 1000 + 300);
    }, 250);
  };

  return (
    <div id="socria-video" data-screen-label="t=0.0s" style={{ position: 'absolute', inset: 0 }}>
      <Stage width={STAGE_W} height={1920} duration={15} background={C.bg} persistKey="socria-ad" loop>
        {/* soft branded ground — subtle radial warmth, never flat */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(125% 80% at 78% 4%, #faf8f1 0%, #f3f1e7 52%, #eeecdf 100%)',
        }} />
        <ChatScene />
        <EndCard />
        <Timecode />
        <TimelineBridge ctrlRef={ctrl} />
      </Stage>
    </div>
  );
}

const __recStyle = document.createElement('style');
__recStyle.textContent = '@keyframes socria-rec-pulse{0%,100%{opacity:1}50%{opacity:0.4}}';
document.head.appendChild(__recStyle);

ReactDOM.createRoot(document.getElementById('root')).render(<SocriaAd />);
