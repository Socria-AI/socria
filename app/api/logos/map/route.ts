// app/api/logos/map/route.ts
// POST /api/logos/map  → { map, build?, display? } — the rebuilt Thinking Map,
// the model the engine built from this turn's proposal, if there was one, and
// the everyday display it made, if one was asked for.
//
// Runs INDEPENDENTLY of the conversational reply (the client fires both in
// parallel), so the map grows while the answer is still streaming.
//
// IT IS ALSO THE ON-RAMP. The extractor may PROPOSE a structured model; this
// route is the only place a proposal becomes one the engine owns
// (lib/model/propose.ts buildProposal). Nothing that arrives from a language
// model is trusted: the proposal is sanitised, validated, checked for missing
// structure, given a capability level and routed to a solver, and it either
// builds or is refused with what is missing named in the person's terms.

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { contentAsText } from '@/lib/inline-ui';
import OpenAI from 'openai';
import { tracked } from '@/lib/openai-usage';
import { auth } from '@clerk/nextjs/server';
import { GUEST_COOKIE, GUEST_LIMIT, guestMay } from '@/lib/guest-pass';
import {
  mapInstructions,
  mapAsItStands,
  buildProposePrompt,
  sanitizeMap,
  LOGOS_MAP_MODEL,
  EMPTY_MAP,
  type ThinkingMap,
} from '@/lib/logos';
import {
  discover,
  bindNodes,
  objectsForExtractor,
  EMPTY_SPACE,
  readDisplayRequest,
  buildDisplayPrompt,
  readDisplayProposal,
  makeFromRequest,
  makeDisplay,
  madeSays,
  kindOf,
  isoDay,
  todayDay,
  sanitizeCustom,
  templateShape,
  parseDraft,
  repairFor,
  type MapMaterial,
} from '@/lib/objects';
import type { DisplayRequest } from '@/lib/objects/display-request';
import { renderMessageForModel, sanitizeAttachments } from '@/lib/logos-attachments';
import { renderContextsForMap, sanitizeContexts } from '@/lib/logos-sources';
import { guidanceBlock, resolveDepth, resolveGuard } from '@/lib/logos-guidance';
import { depthForPlan } from '@/lib/socria-one';
import { boundaryNote, type Counter } from '@/lib/entitlements';
import { claimUnit, consume, left, QUOTA_UNAVAILABLE, refusal, savedMapHasNodes, unitClaimed } from '@/lib/quota';
import { addedNodes, drawingNote, keepAddedNodes, madeAny, madeArtifacts, withoutArtifacts, type Made } from '@/lib/quota-map';
import { meterFor, sleepAnswer, sleepGate } from '@/lib/sleep-server';
import { uncounted, withMeter } from '@/lib/token-meter';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { cacheKey, chooseAuxModel, firstAccepted, tierOf } from '@/lib/model-router';
import { enforceRateLimit } from '@/lib/rate-limit';
import { mayUse } from '@/lib/route-guard';
import { EMPTY_WORKSPACE, modelFor, openFromProposal } from '@/lib/model/docs';
import { solidFromWords } from '@/lib/model/solid-words';
import {
  wantedSimulation,
  correctionNote,
  bareRequest,
  answersOutright,
  answersInstead,
  isThatSimulation,
  type Wanted,
} from '@/lib/model/wants';
import { dropRemoved } from '@/lib/map-edit';
import { sanitizeViz } from '@/lib/logos-viz';
import { readPlotRequest, sameCurve } from '@/lib/plot-words';
import { askedToSee, diagramAsked, drawable, type DiagramShape } from '@/lib/runtime/orchestrate';
import { lastReplyIn } from '@/lib/map-skip';
import { isSynthesisText } from '@/lib/logos-synthesis';
import { settle, unanswered } from '@/lib/model/ask';
import {
  buildRestructurePrompt,
  GRAMMARS,
  keptEverything,
  readBuilding,
  satisfies,
  statedBuilding,
  type GrammarId,
} from '@/lib/representation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_HISTORY = 16;

/**
 * THE DRAWING THIS TURN ASKS FOR, IN A LINE (Logos 5.5) — after the map as it
 * stands, so the instructions above stay the same on every call (and in the
 * provider's cache). Asked for, it is drawn; a subject with a shape is drawn
 * if it would teach.
 */
function drawingAsked(drawing: DiagramShape | null, shaped: DiagramShape | null): string {
  const kind = drawing ?? shaped;
  if (!kind) return '';
  const g = GRAMMARS[kind];
  const what = `${/^[aeiou]/i.test(g.label) ? 'an' : 'a'} ${g.label.toLowerCase()} — ${g.builds}`;
  return drawing
    ? `\n\n=== ASKED FOR THIS TURN ===\nA diagram of what they named, drawn as ${what}. Draw it: every node of it "origin": "drawn", a "title", and "building": {"kind": "${kind}"}. Their own thinking is kept as it is, never reshaped to fit the drawing.`
    : `\n\n=== THIS TURN'S SUBJECT ===\nWhat they asked about has the shape of ${what}. Draw it beside their thinking if seeing it would teach (every node "origin": "drawn", a "title", "building": {"kind": "${kind}"}); if it would not, leave the map as it is.`;
}

/**
 * The map, answered by the engine's own simulation of what was named.
 *
 * Named for what it is — `simulating`, as sanitizeMap names a scene the
 * extractor drew itself — so the panel does not head a Kerr black hole with
 * "Graphing" because the extractor had called the turn mathematics.
 */
function withSimulation(map: ThinkingMap, w: Wanted): ThinkingMap {
  const { intent: _notMath, ...rest } = map;
  return {
    ...rest,
    // The surface draws the active document before any scene; the turn asked
    // for this, so no document is active. The documents themselves stay.
    ...(map.models?.active ? { models: { ...map.models, active: null } } : {}),
    viz: { kind: 'simulation', sim: { object: w.object } } as ThinkingMap['viz'],
    context: 'simulating',
    ask: {
      ...(map.ask ?? {}),
      action: 'construct',
      artifact: 'simulation',
      topic: map.ask?.topic || w.named,
    } as ThinkingMap['ask'],
  };
}

/** Appended to the retry after a truncated response: map only, no picture. */
const NO_PICTURE = `

THIS TURN ONLY: omit "viz" entirely. The previous attempt ran out of room. Return the nodes and edges and nothing else — the picture already on screen stays as it is.`;

export const POST = withMeter(async function POST(req: NextRequest) {
  const { userId } = auth();
  // a guest draws the map of their one line of thinking (lib/guest-pass.ts), and no
  // other — every signed-out caller, the typed access key included (October 31, 2026)
  void mayUse;
  const guest = !userId;
  if (guest && !req.cookies.get(GUEST_COOKIE)?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI key not configured' }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (guest && !guestMay(req.cookies.get(GUEST_COOKIE)?.value, body?.sessionId, Date.now())) {
    return NextResponse.json({ error: GUEST_LIMIT, guestLimit: true }, { status: 401 });
  }
  // The map the client is holding is this product's own state — its models were
  // built by the engine on an earlier turn — so it comes in on the stored path,
  // where a built model is re-validated rather than stripped.
  const current = sanitizeMap(body?.map, { trust: 'stored' });
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  // Grounded material attached to nodes — the extractor sees what is attached
  // and to which node, tagged with whose thinking it is.
  const grounded = renderContextsForMap(sanitizeContexts(body?.contexts));
  // The extractor is itself an answer-revealing surface — while the guard is on
  // it must not populate the result. Depth also shapes how much it extracts.
  // Depth is one of the things One opens, so a free request is answered at
  // Balanced whatever it asked for — clamped here rather than trusted.
  const plan = await resolvePlanForRequest(req, userId);
  // THE WEEK'S TOKENS (lib/sleep-server.ts): a free account whose week is spent rests until Monday
  // 00:00 UTC — no model is asked; one that is awake is metered from here, so every call this request
  // makes is held against its week and settled at what it cost.
  const sleep = await sleepGate(req, userId, plan);
  if (sleep.refuse) return sleep.refuse;
  if (sleep.meter) meterFor(sleep.meter);
  const depth = depthForPlan(resolveDepth(body?.depth), plan);
  const guidance = guidanceBlock(depth, resolveGuard(body?.guard), 'surface');

  // ── THE FREE PLAN'S LOGIC MAPS (lib/entitlements.ts, lib/quota.ts) ──
  //
  // Two Logic Maps a month, and ten nodes a month across them; artifacts are
  // their own two. A conversation with no map yet needs one of the month's
  // maps — and room for at least one node — before any model is asked, so a
  // free account past its maps costs no extraction. A map it already has (drawn
  // this month, or before these limits existed) keeps growing until the
  // month's nodes are spent. Signed out is a guest's one map, not counted here.
  const sessionKey = typeof body?.sessionId === 'string' && body.sessionId.trim() ? body.sessionId.trim().slice(0, 80) : '';
  const metered = !!userId && plan === 'free';
  // WHETHER THIS CONVERSATION ALREADY HAS ITS MAP is the server's to say, never
  // the browser's: the map it sends can be the previous conversation's (sent in
  // the moment after switching) or anything else, and trusting it let a new
  // conversation's map through without being counted. A conversation has its
  // map when its map was claimed (this month or before) or when it was saved
  // with one — drawn before these limits, or on another device.
  //
  // A pass that names no conversation has no conversation to have a map
  // already: each one that leaves a map is a new map, under a mark of its own,
  // so leaving the id out can never ride on a map that was counted elsewhere
  // (the page always sends it; this is for anything else that calls).
  let hadMap = current.nodes.length > 0;
  const mapMark = sessionKey || `pass:${randomUUID()}`;
  if (metered) hadMap = sessionKey ? (await unitClaimed(userId, 'maps', sessionKey)) || (await savedMapHasNodes(userId, sessionKey)) : false;
  if (metered && !hadMap) {
    const maps = await left(userId, plan, 'maps');
    const nodes = maps.left === 0 ? null : await left(userId, plan, 'nodes');
    const refused: { counter: Counter; used: number; limit: number | null; unavailable?: boolean } | null =
      maps.left === 0 ? { counter: 'maps', ...maps } : nodes && nodes.left === 0 ? { counter: 'nodes', ...nodes } : null;
    if (refused) {
      const r = refusal(refused.counter, refused);
      return NextResponse.json({ map: current, ...r.body }, { status: r.status });
    }
  }

  /**
   * Every answer that hands back a map passes through here. On Socria One it is
   * the map, as it was. On the free plan: a first map is claimed as one of the
   * month's maps (atomically — two passes racing for the last map cannot both
   * win), new nodes are kept while the month's nodes last and the rest are
   * taken back out with their connections, and each artifact the pass made is
   * claimed or taken back out — the display, model or picture they asked for
   * then says why, in the words of the boundary. Nothing they already had is
   * touched. `limit` tells the page which allowance stopped the map, so it can
   * say so beside the map instead of the map just going still.
   */
  const meter = async (out: ThinkingMap, extras: Record<string, unknown> = {}): Promise<NextResponse> => {
    if (!metered || !userId) return NextResponse.json({ map: out, ...extras });
    let map = out;
    let reached: { counter: Counter; used: number; limit: number | null } | null = null;
    /** a drawing left off because the month's nodes could not hold all of it — said in its own words */
    let drawingLeft: { needed: number; left: number; own: number } | null = null;
    const added = addedNodes(current, map);
    // A DRAWING IS KEPT WHOLE OR NOT AT ALL (lib/quota-map.ts): when this pass adds one and the month's nodes
    // cannot hold everything it added, the room is read first and only what will be kept is planned — the
    // person's own new ideas first, the drawing only if all of it fits. Never charged for a node not kept,
    // and planned BEFORE a first map is claimed, so a map that would be left empty is never charged.
    const drawnNew = new Set(map.nodes.filter((n) => n.origin === 'drawn').map((n) => n.id));
    const whole = drawnNew.size ? (id: string) => drawnNew.has(id) : undefined;
    let want = added.length;
    let room: Awaited<ReturnType<typeof left>> | null = null;
    if (added.length && whole && added.some(whole)) {
      room = await left(userId, plan, 'nodes');
      if (room.unavailable) {
        const r = refusal('nodes', room);
        return NextResponse.json({ map: current, ...r.body }, { status: r.status });
      }
      if (room.left !== null && room.left < added.length) {
        want = keepAddedNodes(map, current, room.left, whole).kept;
        // what the month had left for the drawing once their own new ideas were kept
        const drawn = added.filter(whole).length;
        const own = Math.min(room.left, added.length - drawn);
        const forDrawing = room.left - own;
        if (drawn > forDrawing) drawingLeft = { needed: drawn, left: forDrawing, own };
      }
    }
    // A first map is claimed whenever the pass leaves this conversation with a
    // map at all — not only when it added nodes, so a browser that sent a map
    // of its own cannot carry one in uncounted. A pass whose every new node
    // must be left off leaves no map, and claims none.
    const keeps = map.nodes.length - added.length + want;
    if (!hadMap && map.nodes.length > 0 && keeps > 0) {
      const claim = await claimUnit(userId, plan, 'maps', mapMark);
      if (!claim.ok) {
        const r = refusal('maps', claim);
        return NextResponse.json({ map: current, ...r.body }, { status: r.status });
      }
    }
    if (added.length) {
      const took = want > 0 ? await consume(userId, plan, 'nodes', want, { upTo: true }) : { ok: false, granted: 0, used: room?.used ?? 0, limit: room?.limit ?? null, unavailable: false };
      if (took.unavailable) {
        const r = refusal('nodes', took);
        return NextResponse.json({ map: current, ...r.body }, { status: r.status });
      }
      if (took.granted < added.length) {
        // what was planned is kept whole; in the rare race where another pass took nodes between the read and
        // the take, exactly what was granted is kept — a node taken cannot be given back
        map = keepAddedNodes(map, current, took.granted, took.granted === want ? whole : undefined).map;
        reached = { counter: 'nodes', used: took.used, limit: took.limit };
        // a drawing left off takes its title with it
        if (drawingLeft && !map.nodes.some((n) => n.origin === 'drawn')) {
          const { title: _left, ...rest } = map;
          map = current.title ? { ...rest, title: current.title } : rest;
        }
      }
    }
    const made = madeArtifacts(current, map);
    if (madeAny(made)) {
      const refused: Made = { objects: [], models: [], picture: false };
      const key = (what: string) => `${mapMark}:${what}`;
      let paused = false;
      const take = async (what: string) => {
        const c = await claimUnit(userId, plan, 'artifacts', key(what));
        if (!c.ok) {
          if (c.unavailable) paused = true;
          else reached = { counter: 'artifacts', used: c.used, limit: c.limit };
        }
        return c.ok;
      };
      for (const id of made.objects) if (!(await take(`obj:${id}`))) refused.objects.push(id);
      for (const id of made.models) if (!(await take(`model:${id}`))) refused.models.push(id);
      if (made.picture && !(await take('picture'))) refused.picture = true;
      if (madeAny(refused)) {
        map = withoutArtifacts(map, current, refused);
        const said = { ok: false, failure: 'limit', says: paused ? QUOTA_UNAVAILABLE : boundaryNote('artifacts') };
        const display = extras.display as { id?: string } | null | undefined;
        if (display && (!display.id || refused.objects.includes(display.id))) extras = { ...extras, display: said };
        if (extras.build && refused.models.length) extras = { ...extras, build: said };
      }
    }
    const stop = reached as { counter: Counter; used: number; limit: number | null } | null;
    // a drawing left off says so plainly: how many parts it needed and how many of the month's nodes are left
    const dl = drawingLeft as { needed: number; left: number; own: number } | null;
    const note = stop && dl && stop.counter === 'nodes' ? drawingNote(dl.needed, dl.left, dl.own) : stop ? boundaryNote(stop.counter) : null;
    return NextResponse.json({ map, ...extras, ...(stop ? { limit: { ...stop, note } } : {}) });
  };

  const kept = messages
    .filter(
      (m: any) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        // A SYNTHESIS IS SOCRIA'S READING, NOT THE PERSON'S THINKING. Mapped
        // from, it would write Socria's interpretation into their structure.
        !m.synthesis &&
        !isSynthesisText(m.content)
    )
    .slice(-MAX_HISTORY);

  // The extractor sees attachments too — a pasted page of notes or a photo of
  // a whiteboard is structural material, and a map blind to it would be a map
  // of half the conversation. The newest turn gets more room than the rest.
  const transcript = kept
    .map((m: any, i: number) => {
      // an inline element Socria drew is read as words, not as its JSON (lib/inline-ui.ts)
      const rendered = renderMessageForModel(
        { role: m.role, content: m.role === 'assistant' ? contentAsText(m.content) : m.content, attachments: sanitizeAttachments(m.attachments) },
        i === kept.length - 1
      );
      const room = i === kept.length - 1 ? 6_000 : 700;
      return rendered.trim()
        ? `${m.role === 'user' ? 'User' : 'Logos'}: ${rendered.slice(0, room)}`
        : '';
    })
    .filter(Boolean)
    .join('\n');

  // Nothing to extract from — hand back what we already have.
  if (!transcript) return NextResponse.json({ map: current });

  // ── WHAT THEY NAMED, DECIDED BEFORE ANY MODEL IS ASKED ───────────
  //
  // Whether the person asked for one of the simulations this product ships is
  // a fact about their words, decidable in code (lib/model/wants.ts). It is
  // read once, here, so that every way this route can end — a full
  // extraction, a refusal, a model that errored or returned nothing — can
  // still give them the thing they plainly asked for.
  const lastSaid = [...kept].reverse().find((m: any) => m.role === 'user');
  const said = lastSaid?.content;
  const wanted = wantedSimulation(said);
  const bare = !!wanted && bareRequest(said, wanted);
  /** A map that failed to extract still answers a named simulation. */
  // ── WHAT THEY ARE BUILDING, IF THEY SAID ──────────────────────────
  //
  // "Actually, show this as a process" is an instruction about the SHAPE.
  // It reaches the extractor as the reading the map already carries, so the
  // pass restructures what is there rather than starting over, and it wins
  // over whatever the extractor or the structure would have read.
  const stated: GrammarId | null = statedBuilding(said);
  // ── A DIAGRAM ASKED FOR, OR A SUBJECT WITH A SHAPE (Logos 5.5) ──────
  //
  // "Draw a flowchart of how a bill becomes law" is the Logic Map's to draw
  // (lib/runtime/orchestrate.ts diagramAsked): no display is drafted in
  // Artifacts beside it, and the extractor is told the shape asked for. "What
  // caused World War I?" has a shape worth seeing (drawable): the extractor is
  // told it may draw it. Their own thinking is never restructured for either —
  // a drawing is its own layer on the map (lib/logos.ts, THE SUBJECT, DRAWN).
  const drawing: DiagramShape | null = typeof said === 'string' ? diagramAsked(said) : null;
  // unasked, a subject is drawn for Socria One and a guest; a free account's week is not spent on it (needsMap drawUnasked)
  const shaped: DiagramShape | null = !drawing && !metered && typeof said === 'string' ? drawable(said) : null;
  const asked: ThinkingMap = stated
    ? { ...current, building: readBuilding({ map: current, stated, prev: current.building }) ?? undefined }
    : current;
  const salvage = (map: ThinkingMap): ThinkingMap => {
    if (!wanted || isThatSimulation(map.viz, wanted)) return map;
    console.info('logos map: extraction failed; %s', correctionNote(wanted));
    return withSimulation(map, wanted);
  };

  const openai = tracked(new OpenAI({ apiKey }), 'logos/map');
  // By tier (lib/model-router.ts): Socria One's map on GPT-6.1 Terra, the free
  // plan's on GPT-6 Luna, a guest's on GPT-4o mini — each stepping down its own
  // ladder if refused. LOGOS_ROUTER=off: GPT 5.6 Terra for everyone, as before
  // (OPENAI_MODEL_LOGOS_MAP still moves it then). Every call is shaped for the
  // model it goes to (lib/model-params.ts, through lib/openai-usage.ts).
  const route = chooseAuxModel(tierOf(userId, plan), 'standard', process.env, process.env.OPENAI_MODEL_LOGOS_MAP || LOGOS_MAP_MODEL);
  const mapCacheKey = cacheKey('map', typeof body?.sessionId === 'string' ? body.sessionId : null);
  /** Down the tier's ladder from the model that answered: a rung already refused is not asked again. */
  const ladderFrom = (model: string) => route.ladder.slice(Math.max(0, route.ladder.indexOf(model)));
  const stepped = (what: string) => (from: string, to: string, why: string) => console.warn('logos map: %s — %s was refused (%s); asking %s', what, from, why, to);

  // ── AN EVERYDAY DISPLAY ───────────────────────────────────────
  //
  // "Make me a study plan for finals", "turn this map into a checklist":
  // an artifact to look at and work in, not a model of anything. Asked for
  // in their words (lib/objects/display-request.ts) or read so by the
  // extractor (ask: construct → display), it is made in this route, beside
  // the model on-ramp and under the same rule: a language model may propose
  // a display's state, and only the kind's own sanitizer decides what of it
  // the workspace holds (lib/objects/display-propose.ts). A display made
  // from the map is computed from the map, not drafted. Either way the turn
  // says what came of it — and the model second pass, which would read the
  // same construction as a model nobody proposed, stands aside.
  //
  // ASKED FOR IN WORDS, IT IS DRAFTED BESIDE THE MAP, NOT AFTER IT. A simple
  // "make me a checklist" used to wait for the whole map extraction — the
  // largest prompt Socria sends — and was never attempted at all when that
  // extraction came back empty, cut off or unreadable: the route returned the
  // old map, the page said nothing, and the checklist simply did not appear.
  // A display the words name (and that is not made from the map) is now
  // drafted alongside the extraction, from the conversation alone, and is
  // made whatever becomes of the map.
  //
  // CHECKED, AND REPAIRED ONCE. A draft the kind cannot hold — not JSON, the
  // wrong kind, a state that does not follow the kind's rules, cut off — is
  // sent back once with what was wrong (display-propose.ts repairFor); what
  // comes back is checked the same way. Nothing is ever substituted for it:
  // when it still does not hold, the turn says so in a sentence.
  const displayWords = drawing ? null : readDisplayRequest(said, { stated });
  // THEIR TEMPLATE: a custom artifact asked for from one of their own templates carries it on the
  // message (lib/logos5/templates.ts) — read through the kind's own sanitizer, never taken as written
  const theirTemplate = (() => {
    const raw = (lastSaid as { make?: { template?: { name?: unknown; blocks?: unknown } } } | undefined)?.make?.template;
    if (displayWords?.kind !== 'custom' || !raw || typeof raw !== 'object') return null;
    const kept = sanitizeCustom({ title: raw.name, blocks: raw.blocks });
    return kept ? { name: kept.title, blocks: templateShape(kept.blocks) } : null;
  })();
  // what the PERSON said, with what they attached — the only numbers a table may call theirs
  const personSaid = kept
    .filter((m: any) => m.role === 'user')
    .map((m: any) => renderMessageForModel({ role: 'user', content: m.content, attachments: sanitizeAttachments(m.attachments) }, true))
    .join('\n');
  const userTurns: string[] = kept.filter((m: any) => m.role === 'user').map((m: any) => String(m.content ?? ''));
  const today = isoDay(body?.today) ?? todayDay();
  const DISPLAY_CAP = 2400;

  type Sealed = { kind: string; state: unknown; gaps: string[]; origin: 'socria' | 'person'; says?: string; from?: 'map' | 'words' | 'template' };
  type DisplayNote = { ok: boolean; says: string; id?: string; kind?: string; failure?: string };
  type Settled = { sealed: Sealed } | { note: DisplayNote };
  const mapMaterial = (m: ThinkingMap): MapMaterial => ({
    nodes: m.nodes.map((n) => ({ id: n.id, label: n.label, type: n.type, role: n.role, origin: n.origin, status: n.status })),
    edges: m.edges.map((e) => ({ from: e.from, to: e.to, relation: e.relation })),
  });

  /** MADE, NOT DRAFTED: what a request made in code becomes — sealed, opened, or why not. */
  const fromMade = (madeHere: ReturnType<typeof makeFromRequest>, space: typeof EMPTY_SPACE): Settled | null => {
    if (!madeHere) return null;
    if ('why' in madeHere) return { note: { ok: false, failure: 'empty', says: madeHere.why } };
    // the experience this is about is already here: opened, not made twice
    if ('open' in madeHere) return { note: { ok: true, id: madeHere.open, kind: space.objs.find((o) => o.id === madeHere.open)?.kind, says: madeHere.says } };
    const state = kindOf(madeHere.kind)?.sanitize(madeHere.state) ?? null;
    if (!state) return { note: { ok: false, failure: 'malformed', says: 'That could not be made from what is here.' } };
    return { sealed: { kind: madeHere.kind, state, gaps: [], origin: madeHere.origin, says: madeHere.says, from: madeHere.from } };
  };

  /** One display drafted by the model, read by its kind — and, when it does not hold, sent back once with why. */
  const draftDisplay = async (request: DisplayRequest | null, mapIdeas: MapMaterial | null, ladder: readonly string[]): Promise<Settled> => {
    const system = buildDisplayPrompt({ request, today, guarded: resolveGuard(body?.guard) === 'guard', map: request?.fromMap ? mapIdeas : null, template: theirTemplate });
    const ask =
      (extra: { role: 'assistant' | 'user'; content: string }[], cap: number) =>
      (model: string) =>
        openai.chat.completions.create({
          model,
          temperature: 0,
          max_tokens: cap,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: system }, { role: 'user', content: transcript }, ...extra],
        });
    const read = (c: { choices?: { message?: { content?: string | null }; finish_reason?: string | null }[] }) => {
      const text = c.choices?.[0]?.message?.content ?? '';
      const parsed = parseDraft(text);
      return { text, parsed, cut: c.choices?.[0]?.finish_reason === 'length', proposal: readDisplayProposal(parsed, { request, said: personSaid }) };
    };
    const first = await firstAccepted(ladder, ask([], DISPLAY_CAP), stepped('display'));
    let got = read(first.result);
    const fix = got.proposal.ok ? null : repairFor(got.parsed, { request, cut: got.cut });
    if (fix) {
      console.info('logos map: the display draft did not hold (%s) — sent back once', got.cut ? 'cut off' : got.proposal.ok ? 'ok' : got.proposal.failure);
      // the repair is ours (our check refused the draft): never counted against the week (lib/token-meter.ts)
      const again = await uncounted(() => firstAccepted(
        ladder.slice(Math.max(0, ladder.indexOf(first.model))),
        ask([{ role: 'assistant', content: got.text.slice(0, 8000) || '{}' }, { role: 'user', content: fix }], got.cut ? DISPLAY_CAP * 2 : DISPLAY_CAP),
        stepped('display repair')
      )).catch(() => null);
      // the repair stands when it holds, or when it declines honestly; otherwise the first draft's fault is
      // the one said — it is what the pass actually tried to make
      const second = again ? read(again.result) : null;
      if (second && (second.proposal.ok || second.proposal.failure === 'declined')) got = second;
      console.info('logos map: the repaired draft %s', second?.proposal.ok ? 'holds' : 'still does not hold');
    }
    const p = got.proposal;
    if (!p.ok) return { note: { ok: false, failure: p.failure, says: p.says } };
    // made from their template: it says so, and is theirs to save again
    const state = theirTemplate && p.kind === 'custom' ? (sanitizeCustom({ ...(p.state as object), from: theirTemplate.name }) ?? p.state) : p.state;
    return { sealed: { kind: p.kind, state, gaps: p.gaps, origin: 'socria' } };
  };

  // Drafted beside the map: asked for in words, not a simulation they named, not made from the map or
  // from what is already here (those need the map this pass is drawing)
  const EMPTY_FAIL: Settled = { note: { ok: false, failure: 'failed', says: 'The display could not be drafted just now — ask again in a moment.' } };
  const drawnBeside = !!displayWords && !wanted && !displayWords.fromMap && displayWords.kind !== 'exercise';
  let early: Promise<Settled> | null = null;
  /** Started the moment the extraction has been asked (so the two run together), or on first need. */
  const startEarly = (): Promise<Settled> | null => {
    if (!drawnBeside || !displayWords) return null;
    return (early ??= (async () => {
      const space = current.objects ?? EMPTY_SPACE;
      const made = fromMade(makeFromRequest(displayWords, { said: personSaid, map: null, space, latest: said, turns: userTurns, today }), space);
      return made ?? (await draftDisplay(displayWords, null, route.ladder));
    })().catch((e) => {
      console.warn('logos map: display pass failed', e instanceof Error ? e.message : e);
      return EMPTY_FAIL;
    }));
  };

  /** The display this turn makes, into `base`'s workspace: the one drafted beside the map, or made now. */
  const settleDisplay = async (base: ThinkingMap, opts: { mapIdeas: MapMaterial; topic?: string; ladder: readonly string[]; request: DisplayRequest | null }): Promise<{ map: ThinkingMap; display: DisplayNote; made: boolean }> => {
    const space = base.objects ?? EMPTY_SPACE;
    let settled: Settled;
    try {
      const beside = early ?? startEarly();
      settled =
        (beside ? await beside : null) ??
        (opts.request ? fromMade(makeFromRequest(opts.request, { said: personSaid, map: opts.mapIdeas, space, topic: opts.topic, latest: said, turns: userTurns, today }), space) : null) ??
        (await draftDisplay(opts.request, opts.mapIdeas, opts.ladder));
    } catch (e) {
      console.warn('logos map: display pass failed', e instanceof Error ? e.message : e);
      settled = EMPTY_FAIL;
    }
    if ('note' in settled) return { map: base, display: settled.note, made: false };
    const s = settled.sealed;
    const made = makeDisplay(space, s.kind, s.state, s.origin);
    if (!made.ok) return { map: base, display: { ok: false, failure: made.failure, says: made.says }, made: false };
    return {
      map: { ...base, objects: made.space },
      display: { ok: true, id: made.obj.id, kind: made.obj.kind, says: [madeSays(made.obj, s.gaps, s.from), s.says].filter(Boolean).join(' ').slice(0, 300) },
      made: true,
    };
  };

  /**
   * THE MAP COULD NOT BE DRAWN THIS TURN — THE DISPLAY THEY ASKED FOR STILL
   * IS. An extraction that came back empty, cut off, unreadable, or not at all
   * used to end the turn here with the map as it was and no word of what had
   * been asked: from the outside, Logos had stopped making things.
   */
  const withoutMap = async (map: ThinkingMap): Promise<NextResponse> => {
    if (!displayWords || wanted) return meter(map);
    const s = await settleDisplay(map, { mapIdeas: mapMaterial(current), ladder: route.ladder, request: displayWords });
    console.info('logos map: the map was not redrawn; display %s — %s', s.display.ok ? 'made' : 'not made', s.display.says.slice(0, 160));
    return meter(s.map, { display: s.display });
  };

  try {

    // The ceiling has to fit the JSON the prompt asks for, which is now a map
    // AND, when the conversation wants one, a picture the model authors part
    // by part. At 900 a busy turn ran out mid-object; the JSON then failed to
    // parse and the route quietly returned the map it was given — which on a
    // first turn is empty. Nothing drew, nothing errored, and nothing said
    // why.
    const CEILING = 3200;

    const make = (model: string, cap = CEILING, withPicture = true) =>
      openai.chat.completions.create({
        model,
        temperature: 0,
        max_tokens: cap,
        response_format: { type: 'json_object' },
        ...(mapCacheKey ? { prompt_cache_key: mapCacheKey } : {}),
        messages: [
          // THE INSTRUCTIONS ARE A MESSAGE OF THEIR OWN. They are the same on
          // every call — with the depth and the guard, which hold for the
          // whole conversation — and a provider's prompt cache can only stop
          // at the end of a message (lib/logos.ts mapInstructions). Everything
          // that changes turn to turn comes after them, in the message that
          // asks: the map as it stands, the objects, the conversation.
          { role: 'system', content: mapInstructions() + guidance },
          {
            role: 'user',
            content:
              mapAsItStands(asked, grounded) +
              // the objects the person is working on exist as themselves —
              // nodes refer to them, never copy or "compute" their values
              objectsForExtractor(current.objects) +
              drawingAsked(drawing, shaped) +
              `\n\n=== THE CONVERSATION ===\n${transcript}` +
              (withPicture ? '' : NO_PICTURE),
          },
        ],
      });

    // A REFUSED OR FAILING MODEL STEPS DOWN, NEVER OUT: down the tier's ladder
    // (lib/model-router.ts firstAccepted) — said in the log, so a map quietly
    // answered by another model is seen. A parameter the model does not take
    // is not a refusal of the model: lib/openai-usage.ts asks it again without
    // it. Every pass after this one asks the model that answered.
    const extraction = firstAccepted(route.ladder, (m: string) => make(m), stepped('map'));
    // the display their words asked for is drafted now, beside the extraction — asked after it, so the two
    // calls go out in the same order every time
    startEarly();
    const first = await extraction;
    let completion = first.result;
    const served = first.model;

    // Ran out of room even at the ceiling. The map is the product and the
    // picture is the extra, so drop the picture and ask again rather than
    // returning nothing: from the outside, a turn that produces no map at all
    // is indistinguishable from Logos having stopped working.
    if (completion.choices?.[0]?.finish_reason === 'length') {
      console.warn('logos map: truncated at the ceiling — retrying without the picture');
      try {
        completion = await make(served, CEILING, false);
      } catch {
        /* keep the truncated one; the parse below will decide */
      }
    }

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) {
      console.warn('logos map: empty completion', completion.choices?.[0]?.finish_reason);
      return withoutMap(salvage(asked));
    }

    // read as a model writes it when it strays (a fence, a sentence around it, a trailing comma) — the same
    // lenient reading a display draft gets
    const parsed: any = parseDraft(raw);
    if (!parsed) {
      // Said out loud, because the silent version of this looks exactly like
      // a map that has decided to stop building.
      console.error(
        'logos map: model returned unparseable JSON',
        completion.choices?.[0]?.finish_reason,
        raw.slice(0, 200)
      );
      return withoutMap(salvage(asked));
    }

    // The extractor's output is a PROPOSAL: sanitizeMap's default trust mode
    // strips any `built` it wrote and keeps a `propose` block instead.
    let next = sanitizeMap(parsed);
    // WHERE EACH NODE CAME FROM survives the rebuild: an accepted Socria
    // suggestion stays marked as one, whatever the extractor wrote back.
    {
      const origin = new Map(current.nodes.filter((n) => n.origin).map((n) => [n.id, n.origin!]));
      const byLabel = new Map(current.nodes.filter((n) => n.origin).map((n) => [n.label.toLowerCase(), n.origin!]));
      next = { ...next, nodes: next.nodes.map((n) => {
        const o = origin.get(n.id) ?? byLabel.get(n.label.toLowerCase());
        return o ? { ...n, origin: o } : n;
      }) };
    }

    // ── WHAT ARE THEY BUILDING? ───────────────────────────────────
    //
    // The extractor's reading of the conversation, the structure it actually
    // returned, and the person's own word, weighed in lib/representation.ts.
    // When the reading names a shape and the structure is not that shape — a
    // "process" handed back as a cloud of constraints with no order in it,
    // which is exactly the reported failure — the map is restructured once,
    // for the shape alone, and only kept if nothing the person thought was
    // lost on the way.
    const proposedShape = next.building ?? null;
    const shape = readBuilding({ map: next, proposed: proposedShape, stated, prev: asked.building ?? null });
    if (shape) next.building = shape;
    else delete next.building;
    const claimed = shape && (shape.by === 'person' || proposedShape?.kind === shape.kind) ? shape.kind : null;
    // A DRAWING IS NEVER RESHAPED THIS WAY (Logos 5.5): the restructure rewires every edge on the map,
    // and a map holding a drawing holds the person's thinking beside it, which no drawing's shape may
    // rewire. A drawing that is not its shape is shown in a lens that fits what it is (lib/logos-layout.ts).
    const holdsDrawing = next.nodes.some((n) => n.origin === 'drawn');
    if (claimed && claimed !== 'model' && !holdsDrawing && next.nodes.length >= 3 && !satisfies(next, claimed)) {
      try {
        const again = await openai.chat.completions.create({
          model: served,
          temperature: 0,
          max_tokens: CEILING,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: buildRestructurePrompt(next, claimed) },
            { role: 'user', content: transcript },
          ],
        });
        const text = again.choices?.[0]?.message?.content;
        const got = text ? JSON.parse(text) : null;
        const fixed = got && typeof got === 'object' ? sanitizeMap({ ...got, context: next.context, building: next.building }) : null;
        if (fixed && satisfies(fixed, claimed) && keptEverything(next, fixed)) {
          // THE RESTRUCTURE GIVES SHAPE, NOT CONTENT. It is shown each card's
          // id, type, role and label — never its status, whose idea it is, or
          // what was merged into it — so what it returns for those is a guess,
          // and taken whole it reopened every resolved card and stripped
          // Socria's mark from its own suggestions. Each card keeps everything
          // it had and takes only its role from here (and anything newly
          // folded into it); a step the restructure added that nobody named is
          // kept, as Socria's reading, never as the person's words.
          const had = new Map(next.nodes.map((n) => [n.id, n]));
          const nodes = fixed.nodes.map((n) => {
            const was = had.get(n.id);
            if (!was) return { ...n, origin: 'socria' as const };
            const merged = Array.from(new Set([...(was.merged ?? []), ...(n.merged ?? [])]));
            return { ...was, ...(n.role ? { role: n.role } : {}), ...(merged.length ? { merged } : {}) };
          });
          next = { ...next, nodes, edges: fixed.edges };
          const settled = readBuilding({ map: next, proposed: proposedShape, stated, prev: asked.building ?? null });
          if (settled) next.building = settled;
          console.info('logos map: restructured as a %s — the first pass had no %s in it', claimed, GRAMMARS[claimed].label.toLowerCase());
        } else {
          console.info('logos map: the restructure as a %s was not kept (%s)', claimed, !fixed ? 'unreadable' : !satisfies(fixed, claimed) ? 'still not that shape' : 'it dropped thinking');
        }
      } catch (e) {
        console.warn('logos map: restructure failed', e);
      }
    }

    // ── WHAT THEY PLAINLY ASKED FOR ───────────────────────────────
    //
    // "Generate me a black hole" came back as a map node of kind `concept`
    // called "Black hole creation", beside a paragraph explaining that making
    // one would require collapsing a massive star beyond its Schwarzschild
    // radius — while this engine ships a Kerr black hole with real geodesics,
    // a shadow from the critical impact parameter, and sliders for mass and
    // spin. Then, on main, "generate black hole" came back with a one-node
    // map and the on-ramp's refusal in the panel: the extractor had proposed
    // a "Black hole simulation" with nothing formal in it, and a proposal —
    // any proposal — used to stop the engine reaching for its own.
    //
    // The rules are in lib/model/wants.ts, where a suite holds them. Here they
    // are applied at the two points they belong to: OUTRIGHT, before anything
    // is built, for a bare request the engine's own surface answers better
    // than any proposal could; and INSTEAD, after the engine has genuinely
    // tried, for a named simulation where nothing drew and nothing built.
    let bySimulation = false;
    const answer = (w: Wanted) => {
      next = withSimulation(next, w);
      bySimulation = true;
      // Said out loud rather than done silently: a correction nobody can see
      // is the engine overruling the reading of somebody's words without
      // telling them, and if it is wrong they cannot tell why.
      console.info('logos map: %s', correctionNote(w));
    };
    if (wanted && answersOutright(wanted, bare, next.viz)) {
      answer(wanted);
      // Answered. A proposal beside it would be built into a second model
      // competing with the one they asked for — the "canned scene beside a
      // proposal" the sign-off removed, from the other side.
      delete next.propose;
    }
    // The extractor drew exactly what they named. That is an answer too, and
    // nothing below should report the turn as having failed.
    const answeredByScene = () => bySimulation || isThatSimulation(next.viz, wanted);

    // Never let a malformed extraction blank a map the user has built up — and never let it take the display
    // they asked for with it.
    if (next.nodes.length === 0 && current.nodes.length > 0) {
      return withoutMap(salvage(asked));
    }
    // What the person took off the map stays off, whatever the extractor made
    // of the transcript that still mentions it. The client does this too; the
    // server does it so a map read from here is already honest.
    next = dropRemoved(next, current.removed) as typeof next;
    // ── THE OBJECTS OF THOUGHT ────────────────────────────────────
    // Carried from the client's map, never taken from the extractor: an
    // object's states are computed, and the extractor cannot compute. A
    // matrix or function the person wrote that the workspace does not hold
    // yet (a turn from a collaborator, a session from before objects) is
    // found in their own words and added. Then every node that carries a
    // matrix is held to the objects: bound to a computed state when it is
    // one, and not shown as a result when nothing computed it.
    {
      const { objects: _ignored, ...rest } = next;
      let objects = current.objects ?? EMPTY_SPACE;
      const theirs = kept.filter((m: any) => m.role === 'user').map((m: any) => String(m.content));
      for (const t of theirs) objects = discover(objects, t, 'person').space;
      next = bindNodes({ ...rest, ...(objects.objs.length ? { objects } : {}) } as typeof next, theirs.join('\n')) as typeof next;
    }
    // ── AN EVERYDAY DISPLAY (above: settleDisplay) ────────────────
    //
    // Asked for in their words, it has been drafting beside this extraction
    // (`startEarly`); read so by the extractor alone, or made from the map, it
    // is made now, from what the extraction found.
    // a diagram the Logic Map draws (diagramAsked) is not also made in Artifacts, whatever the extractor proposed
    const displayAsked =
      !drawing &&
      !answeredByScene() &&
      (!!displayWords ||
        (next.ask?.action === 'construct' && (next.ask.artifact === 'display' || (next.ask.artifact === 'comparison' && !next.viz))));
    let display: DisplayNote | null = null;
    if (displayAsked) {
      const settled = await settleDisplay(next, {
        mapIdeas: mapMaterial(current.nodes.length ? current : next),
        topic: next.ask?.topic,
        ladder: ladderFrom(served),
        request: displayWords,
      });
      next = settled.map;
      display = settled.display;
      // ONE ANSWER TO ONE ASK. Told to draw whenever someone says "chart", "plot" or
      // "diagram", the extractor also drew this turn's request as a picture of its own — a
      // second, cruder copy made by hand from the same words: a chart's numbers as bars, a
      // Venn diagram as overlapping triangles on axes. The display is the answer, whatever
      // its kind; a picture this turn invented beside it is dropped, and one already on
      // screen stays.
      if (settled.made && next.viz && JSON.stringify(next.viz) !== JSON.stringify(current.viz ?? null)) {
        const { viz: _drawn, ...rest } = next;
        next = (current.viz ? { ...rest, viz: current.viz } : rest) as typeof next;
      }
      console.info('logos map: display %s — %s', display.ok ? 'made' : 'not made', display.says.slice(0, 160));
    }
    // ── A FUNCTION THEY ASKED TO SEE ──────────────────────────────
    //
    // "Graph y = x²" holds the whole curve. The extractor was the only thing
    // that drew it, so what appeared was whatever a language model copied out —
    // a different function, a misplaced exponent, or nothing when it filed the
    // turn as conversation. Read from their words (lib/plot-words.ts), the Plot
    // lens draws exactly what they wrote; the extractor's own picture stands
    // when it already plots the same curve, since it may carry more (sliders,
    // a caption) than the bare curve does.
    {
      const stated = !displayAsked && !answeredByScene() ? readPlotRequest(said) : null;
      if (stated && !(next.viz?.kind === 'function' && sameCurve(next.viz.expr, stated.expr))) {
        const scene = sanitizeViz({
          kind: 'function',
          expr: stated.expr,
          varName: 'x',
          title: stated.title,
          ...(stated.more.length ? { overlays: stated.more.map((expr, i) => ({ id: `c${i + 2}`, expr, visible: true, source: 'user' })) } : {}),
          ...(stated.view ? { view: stated.view } : {}),
        });
        if (scene) {
          next = { ...next, viz: scene };
          console.info('logos map: drew the function they wrote — %s', stated.title);
        }
      }
    }
    // ── THE ON-RAMP ───────────────────────────────────────────────
    //
    // A proposal reaches the engine HERE, on the server, and only here. The
    // extractor proposed a structured model; buildProposal sanitises it,
    // validates it, finds what is missing, works out what it can honestly claim
    // and routes it to a solver — and either hands back a model the engine owns
    // or refuses with the missing structure named.
    //
    // This is what makes `built` mean what it says. A model that reached the
    // client without passing through here would be a language model's JSON
    // wearing the engine's stamp, and everything downstream trusts that stamp.
    //
    // Carried forward rather than rebuilt: the documents the person already has
    // travel with the map, so a turn that proposes nothing leaves their models
    // exactly as they were.
    const carried = current.models ?? EMPTY_WORKSPACE;
    let models = carried;
    let build: {
      ok: boolean;
      says: string;
      id?: string;
      /** when it did not build and one was asked for, which kind of failure */
      failure?: string;
      /** names the person used that are nowhere in what got built */
      unanswered?: string[];
      /** built from the second pass rather than the first */
      secondPass?: boolean;
      /** read from the person's own words by the shape reader, because nothing proposed built */
      reader?: boolean;
    } | null = null;
    // At the top level now, not inside the picture — see sanitizeMap. Read
    // from the sanitised map so the legacy inlet is already hoisted.
    let proposal = next.propose;
    let made: ReturnType<typeof openFromProposal> | null = proposal
      ? openFromProposal(models, proposal, { at: Date.now() })
      : null;
    // ── THE SECOND PASS ───────────────────────────────────────────
    //
    // "Model a pulsar" came back as a concept node and a paragraph asking
    // which aspect of a pulsar they were interested in. The ask was read
    // correctly — construct, a model — and the extractor, busy with the map,
    // proposed nothing. So when the turn wanted a construction and no
    // proposal came, ask once more, for the proposal alone (lib/logos.ts
    // buildProposePrompt), and run the on-ramp on what comes back.
    //
    // AND WHEN WHAT CAME WROTE NOTHING DOWN. A proposal that names the thing
    // and states nothing formally — no expression, no system, no
    // specification — is refused as prose, and that is the same fault as no
    // proposal at all: the extractor did not do the work. It used to end the
    // turn with the refusal, because the retry only fired for "nothing
    // proposed". It gets the same second chance now, told why the first was
    // refused. One retry, never more, and the engine still validates every
    // word of it.
    const wantedBuild = settle(next.ask ?? null, { proposed: false, built: false }).wanted;
    const prose = !!made && !made.doc && !(made.refusal?.missing?.length);
    let secondPass = false;
    if (!answeredByScene() && !displayAsked && ((!proposal && wantedBuild) || prose)) {
      try {
        const again = await openai.chat.completions.create({
          model: served,
          temperature: 0,
          max_tokens: CEILING,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: buildProposePrompt(next.ask ?? null, prose && made?.refusal ? { refused: made.refusal.because } : undefined),
            },
            { role: 'user', content: transcript },
          ],
        });
        const text = again.choices?.[0]?.message?.content;
        const got = text ? JSON.parse(text) : null;
        const p = got && typeof got === 'object' ? (got.propose ?? null) : null;
        if (p && typeof p === 'object') {
          proposal = p;
          made = openFromProposal(models, p, { at: Date.now() });
          secondPass = true;
          console.info(
            'logos map: %s — proposed on the second pass, %s',
            prose ? 'the first proposal wrote nothing down' : 'construction asked for and not proposed',
            made.doc ? 'and it built' : 'and it was refused'
          );
        } else {
          console.info('logos map: second pass declined to propose:', String(got?.because ?? '').slice(0, 160));
        }
      } catch (e) {
        console.warn('logos map: second pass failed', e);
      }
    }
    // ── AND IF STILL NOTHING BUILDS: THE SHAPE THEY STATED ──────────
    //
    // "Model a 2 × 2 × 2 metre cube": construct, a model — and both passes
    // wrote nothing down. The person stated a shape and its sizes, and Live
    // 3D's reader has the grammar for that, so its reading is proposed to the
    // engine like any other proposal (lib/model/solid-words.ts). Only for a
    // construction nothing built; only what they said, each size a control.
    let byReader = false;
    if (!answeredByScene() && !displayAsked && wantedBuild && !made?.doc) {
      const read = solidFromWords(said);
      const got = read ? openFromProposal(models, read.proposal, { at: Date.now() }) : null;
      if (read && got?.doc) {
        proposal = read.proposal;
        made = got;
        byReader = true;
        console.info('logos map: nothing proposed built; %s, and it built', read.says);
      }
    }
    if (proposal) {
      if (made?.doc) models = made.workspace;
      // The proposal has been answered either way; it must not travel on. A
      // map that still carried one would have the client asking again forever.
      delete next.propose;
      // …and the legacy inlet is cleared too, for a scene that still has one.
      if (next.viz?.propose) {
        const { propose: _answered, ...scene } = next.viz;
        next.viz = scene;
      }
    }

    // ── AND IF THE ENGINE TRIED AND NOTHING CAME OF IT ────────────
    //
    // A named simulation answers the turn rather than a refusal that has
    // nothing in it worth reading — see answersInstead for exactly when.
    if (
      !answeredByScene() &&
      wanted &&
      answersInstead(wanted, bare, {
        scene: !!next.viz,
        proposed: !!proposal,
        built: !!made?.doc,
        missing: made?.refusal?.missing?.length ?? 0,
      })
    ) {
      answer(wanted);
    }

    // ── DID THE TURN GET WHAT IT ASKED FOR? ───────────────────────
    //
    // THE FAILURE THIS ANSWERS. A turn that asked for a model to be built and
    // got none used to be indistinguishable, from the outside, from a turn that
    // asked a question: a map came back with a plausible node on it and nothing
    // anywhere recorded that an artifact had been requested and not produced.
    // The map is very good at its job, which is exactly why the failure was
    // silent — something always appears.
    //
    // So the ask and the RESULT are settled against each other, here, on the
    // server, where both are known. The result wins: an ask that said
    // `construct` and a build that refused settles to a named failure, not to a
    // shrug. See lib/model/ask.ts for the failure kinds and why each one needs
    // something different from the person.
    //
    // A TURN THE SIMULATION ANSWERED DID NOT FAIL. It asked for a thing and
    // the thing is on screen; a refusal of a proposal nobody needed, shown
    // beside it, is exactly the note that made this look broken.
    const verdict = settle(next.ask ?? null, {
      proposed: !!proposal,
      built: !!made?.doc || answeredByScene() || !!display?.ok,
      because: made?.doc ? undefined : made?.says,
      missing: made?.refusal?.missing,
    });

    if (made?.doc) {
      build = {
        ok: true,
        says: made.says,
        id: made.doc.id,
        // BUILT IS NOT THE SAME AS BUILT WHAT THEY ASKED FOR. A proposal
        // that quietly dropped a variable the person named still builds,
        // and before this nothing noticed. It does not block the build —
        // a model missing one named variable is still a model — it is
        // something the surface can say.
        ...(() => {
          const left = unanswered(next.ask ?? null, modelFor(made!.doc!));
          return left.length ? { unanswered: left } : {};
        })(),
        ...(secondPass ? { secondPass: true } : {}),
        ...(byReader ? { reader: true } : {}),
      };
    } else if (answeredByScene()) {
      build = null;
    } else if (made) {
      build = { ok: false, says: made.says, ...(verdict.failure ? { failure: verdict.failure } : {}) };
    } else if (verdict.wanted && !displayAsked) {
      // ASKED FOR, AND NOTHING WAS EVEN PROPOSED. This is the original bug in
      // its purest form and it is now reported rather than absorbed: the
      // extractor read a construction request and returned only a map.
      build = { ok: false, says: verdict.says, failure: verdict.failure };
    }

    // ── A PICTURE IS MADE WHEN IT IS ASKED FOR ─────────────────────
    //
    // Four views, four jobs (lib/runtime/orchestrate.ts): Artifacts holds what
    // was made, and something is made when the person asked for it — or said
    // yes to an offer of it. Told to draw "when seeing the idea move would
    // teach it", the extractor put a picture in Artifacts on any turn the map
    // pass ran, a background pass on the cadence included, and the workspace
    // filled with things nobody asked for. A picture this turn drew unasked is
    // not kept; one already on screen stays, and is kept current while the
    // conversation is still about it — the same kind, the same simulation.
    {
      const at = kept.lastIndexOf(lastSaid);
      const priorReply = lastReplyIn(at > 0 ? kept.slice(0, at) : []);
      const askedForPicture = askedToSee(String(said ?? ''), priorReply) || !!readPlotRequest(said) || answeredByScene();
      const was = current.viz;
      const continuing =
        !!was && !!next.viz && next.viz.kind === was.kind && (next.viz.kind !== 'simulation' || next.viz.sim?.object === was.sim?.object);
      if (next.viz && !askedForPicture && !continuing) {
        const { viz: _unasked, ...rest } = next;
        next = (was ? { ...rest, viz: was } : rest) as typeof next;
        console.info('logos map: a picture nobody asked for was not kept');
      }
    }

    // A SIMULATION ANSWERED, SO IT IS WHAT THE SURFACE SHOWS. The plot lens
    // draws the active model document before any scene, so a person who built
    // a saddle and then asked for a black hole kept looking at the saddle.
    // Their documents are kept; none of them is the one on screen.
    if (bySimulation && models.active) models = { ...models, active: null };
    const withModels = models.docs.length ? { ...next, models } : next;
    // Whether this turn changed the workspace. Every other answer hands back
    // the one it was sent — re-sanitised, so never byte-for-byte the same — and
    // a person moving a slider while this ran must not see it moved back.
    const modelsChanged = models !== carried ? { modelsChanged: true } : {};

    // The free plan's allowances are held in `meter` (above): new nodes while
    // the month's last, artifacts while the month's last — nothing already on
    // the map is ever taken off it.
    return meter(withModels, { ...modelsChanged, ...(build ? { build } : {}), ...(display ? { display } : {}) });
  } catch (e) {
    // the week's last tokens taken by another request first: the map stays as it is, and Sleep Mode says why
    const resting = sleepAnswer(e);
    if (resting) return resting;
    console.error('logos map error:', e);
    // the map could not be drawn at all (every model on the ladder failed, or this route did): the display
    // they asked for is still made if it can be, and said if it cannot — never silence
    return withoutMap(salvage(current ?? EMPTY_MAP)).catch(() => meter(salvage(current ?? EMPTY_MAP)).catch(() => NextResponse.json({ map: current ?? EMPTY_MAP })));
  }
});
