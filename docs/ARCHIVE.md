# Archived: the Core chat, and every model but Logos 5

Decided and built on 24 October 2026; on `dev` from 25 October 2026. The
owner's words: "guests can have access to logos 5 … remove the old chat
interface entirely … but only 1 chat 1 map".

## What there is now

**Logos 5 is the one surface.** `/chat` hosts it and nothing else
(`app/chat/page.tsx`). Everybody opens it:

- **Signed in**: everything their plan allows (`lib/entitlements.ts`).
- **Holding the access key**: as before, kept on the device.
- **A guest** (signed out, no key): Logos 5 with **one line of thinking and
  its map**. The one line of thinking is named in a signed, httpOnly cookie
  (`lib/guest-pass.ts`), claimed by the guest's first turn
  (`POST /api/logos/guest`); the reply and the map routes accept a guest turn
  only in that line of thinking. Starting a second opens a note
  (`components/logos5/GuestWall.tsx`): sign up free, and the one they have
  comes with them — `components/LogosApp.tsx` saves a signed-out browser's
  lines of thinking to the account on the first sign-in, then stops keeping
  them on the device. What bounds a determined guest (a cleared cookie claims
  again) is the anonymous rate limit per address, as it always was.

## What was archived

| | What it was | Where it went |
|---|---|---|
| **The Core chat screen** | `/chat` before Logos: a thread, its own rail, model picker, readability and length controls, find panel, insight cards, the "Try Logos" pill and the Logos cover | Removed. `app/chat/page.tsx` is the host of Logos 5; the components only it used were deleted (`ChatAttachments`, `FindPanel`, `ImportProfileModal`, `InsightCard`, `InsightShareModal`, `IntroCore4Modal`, `LogosCover`, `MapThumb`, `TryLogosPill`, `RewardsSync` — Logos 5's rail reads rewards itself) |
| **Core 2, Core 3.1, Core 4** | the Core models | Withdrawn in `lib/socria-prompt.ts` (`withdrawn: …`), not deleted: a shared Core thread still answers where it is read (`app/api/chat`), and Core 4's engine is what Logos 5 runs on (`lib/runtime`, `lib/core4`) |
| **Logos 1 and Logos 2** | earlier Logos surfaces | Withdrawn; their conversations are lines of thinking and open in Logos 5 |
| **The Logos 4 layout** | the workspace layout behind the new-Socria code | Gone: Logos 5 no longer waits behind the code (`const l5 = true` in `LogosApp`); the gate itself remains in `lib/feature-gates.ts` and opens nothing until a model names it again |
| **Onboarding's fifth beat** | "how do you like to think something through?", which was the choice of model | Removed; onboarding is four beats and lands in Logos 5 (`components/onboarding/FirstRunIntro.tsx`) |
| **The model store's way back** | the last Core model, remembered for leaving Logos | Removed (`lib/socria-model-store.ts`); `withdrawnTo` hands a withdrawn Core to Logos |

## What still works

- **Every conversation.** Core chats were already brought into Logos 5
  (`lib/logos5/merge.ts`); a guest's Core chats kept by an old browser go to
  the account on its first sign-in, as before.
- **Old links.** `?model=<anything>` is dropped (there is one surface) and
  `?c=<id>`, which opened one Core chat, opens that conversation in Logos 5.
  The Mind atlas opens everything in Logos 5 (`components/mind/MindGraphView.tsx`).
- **Projects, a Project's home (`?p=`), a shared Core thread (`?shared=`)**,
  onboarding's first sentence: still hosted by `app/chat/page.tsx`.
- **What others share, and joining by a code.** The Core rail was the only
  place that listed what was shared with someone and the only way to type an
  eight-character invite code. Both moved into Logos 5 rather than going with
  it: **Shared with you** is a group under their own conversations in the
  Universal Map's List (`components/logos5/Universe.tsx`), and **Join with a
  code** is in the More menu and under that group (the page holds the dialog,
  `JoinCodeDialog`). A shared Project opens its home, a shared line of thinking
  opens together in Logos 5 (`?s=…&shared=1`), a shared Core conversation
  opens beside it (`?shared=`). Share links and emailed invites work as before.
- **The docs.** The current product is documented first; the archived models
  have their pages under the history section of `/docs`
  (`app/docs/content/history.tsx`, `app/docs/registry.ts`).

## Found and fixed while archiving

- `/docs/logos-5` and `/docs/history` were in the registry, the sidebar and the
  sitemap but not in `app/docs/content/index.ts`, so both would have been a
  404; they are wired in.
- `/chat` lost the plan-1 theme guard when the Core screen went
  (`useThemeGuard` in `app/chat/page.tsx`); put back.
- The tour's last step pointed at the Core 4 picker; it now points at **Make**.

## Bringing something back

A withdrawn model comes back by deleting its `withdrawn` line in
`lib/socria-prompt.ts`; nothing about the models themselves changed. The Core
chat screen does not come back that way — it was removed, so it would be a
revert of the commit that removed it.
