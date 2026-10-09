// app/api/logos/map/route.ts
// POST /api/logos/map  → { map, build? } — the rebuilt Thinking Map, and the
// model the engine built from this turn's proposal, if there was one.
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
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import {
  buildMapPrompt,
  buildProposePrompt,
  sanitizeMap,
  LOGOS_MODEL,
  LOGOS_FALLBACK_MODEL,
  EMPTY_MAP,
  type ThinkingMap,
} from '@/lib/logos';
import { discover, bindNodes, objectsForExtractor, EMPTY_SPACE } from '@/lib/objects';
import { renderMessageForModel, sanitizeAttachments } from '@/lib/logos-attachments';
import { renderContextsForMap, sanitizeContexts } from '@/lib/logos-sources';
import { guidanceBlock, resolveDepth, resolveGuard } from '@/lib/logos-guidance';
import { capMapForFree, depthForPlan } from '@/lib/socria-one';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
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

export async function POST(req: NextRequest) {
  const { userId } = auth();
  const keyUnlocked = mayUse(req, userId);
  if (!userId && !keyUnlocked) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI key not configured' }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
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
  const depth = depthForPlan(resolveDepth(body?.depth), plan);
  const guidance = guidanceBlock(depth, resolveGuard(body?.guard), 'surface');

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
      const rendered = renderMessageForModel(
        { role: m.role, content: m.content, attachments: sanitizeAttachments(m.attachments) },
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
  const asked: ThinkingMap = stated
    ? { ...current, building: readBuilding({ map: current, stated, prev: current.building }) ?? undefined }
    : current;
  const salvage = (map: ThinkingMap): ThinkingMap => {
    if (!wanted || isThatSimulation(map.viz, wanted)) return map;
    console.info('logos map: extraction failed; %s', correctionNote(wanted));
    return withSimulation(map, wanted);
  };

  try {
    const openai = new OpenAI({ apiKey });
    const configured =
      process.env.OPENAI_MODEL_LOGOS_MAP || process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL;

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
        messages: [
          {
            role: 'system',
            content:
              buildMapPrompt(asked, grounded) +
              guidance +
              // the objects the person is working on exist as themselves —
              // nodes refer to them, never copy or "compute" their values
              objectsForExtractor(current.objects) +
              (withPicture ? '' : NO_PICTURE),
          },
          { role: 'user', content: transcript },
        ],
      });

    let completion;
    try {
      completion = await make(configured);
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      const isModelError =
        status === 404 ||
        /model/i.test(e?.code || '') ||
        /model|not found|does not exist|unknown/i.test(e?.message || '');
      if (isModelError && configured !== LOGOS_FALLBACK_MODEL) {
        completion = await make(LOGOS_FALLBACK_MODEL);
      } else {
        throw e;
      }
    }

    // Ran out of room even at the ceiling. The map is the product and the
    // picture is the extra, so drop the picture and ask again rather than
    // returning nothing: from the outside, a turn that produces no map at all
    // is indistinguishable from Logos having stopped working.
    if (completion.choices?.[0]?.finish_reason === 'length') {
      console.warn('logos map: truncated at the ceiling — retrying without the picture');
      try {
        completion = await make(configured, CEILING, false);
      } catch {
        /* keep the truncated one; the parse below will decide */
      }
    }

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) {
      console.warn('logos map: empty completion');
      return NextResponse.json({ map: salvage(asked) });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Said out loud, because the silent version of this looks exactly like
      // a map that has decided to stop building.
      console.error(
        'logos map: model returned unparseable JSON',
        completion.choices?.[0]?.finish_reason,
        raw.slice(0, 200)
      );
      return NextResponse.json({ map: salvage(asked) });
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
    if (claimed && claimed !== 'model' && next.nodes.length >= 3 && !satisfies(next, claimed)) {
      try {
        const again = await openai.chat.completions.create({
          model: configured,
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
          next = { ...next, nodes: fixed.nodes, edges: fixed.edges };
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

    // Never let a malformed extraction blank a map the user has built up.
    if (next.nodes.length === 0 && current.nodes.length > 0) {
      return NextResponse.json({ map: salvage(asked) });
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
    if (!answeredByScene() && ((!proposal && wantedBuild) || prose)) {
      try {
        const again = await openai.chat.completions.create({
          model: configured,
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
    if (!answeredByScene() && wantedBuild && !made?.doc) {
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
      built: !!made?.doc || answeredByScene(),
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
    } else if (verdict.wanted) {
      // ASKED FOR, AND NOTHING WAS EVEN PROPOSED. This is the original bug in
      // its purest form and it is now reported rather than absorbed: the
      // extractor read a construction request and returned only a map.
      build = { ok: false, says: verdict.says, failure: verdict.failure };
    }

    // A SIMULATION ANSWERED, SO IT IS WHAT THE SURFACE SHOWS. The plot lens
    // draws the active model document before any scene, so a person who built
    // a saddle and then asked for a black hole kept looking at the saddle.
    // Their documents are kept; none of them is the one on screen.
    if (bySimulation && models.active) models = { ...models, active: null };
    const withModels = models.docs.length ? { ...next, models } : next;

    // A free map stops taking on NEW nodes at its boundary; everything already
    // on it — including anything the extractor has since refined — is kept.
    // `capped` tells the client the thinking outgrew the free map, so it can
    // say so once, quietly, instead of the map just going still.
    if (plan === 'free') {
      const held = capMapForFree(withModels, current);
      return NextResponse.json({
        map: { ...held.map, ...(models.docs.length ? { models } : {}), ...(next.objects ? { objects: next.objects } : {}) },
        capped: held.capped,
        ...(build ? { build } : {}),
      });
    }
    return NextResponse.json({ map: withModels, ...(build ? { build } : {}) });
  } catch (e) {
    console.error('logos map error:', e);
    return NextResponse.json({ map: salvage(current ?? EMPTY_MAP) });
  }
}
