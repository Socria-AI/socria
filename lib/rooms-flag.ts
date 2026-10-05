// lib/rooms-flag.ts
//
// THE TWO-SEAT ROOM — PARKED FOR THE PRODUCTION CUT, SHIPPED AS LOGOS 3.
//
// The room code — lib/collab.ts, lib/collab-transport.ts,
// lib/logos-rooms-server.ts, lib/logos-rooms-shared.ts, components/useLogosCollab.ts,
// components/CollabBar.tsx and app/api/logos/room/* — was deleted for the
// production cut and restored here from that commit's parent, unchanged, so
// that shipping it is a wiring job and not an archaeology job. While it was
// parked the routes answered 404 and nothing on the Logos surface mounted the hook.
//
// ONE SWITCH, READ ON THE SERVER. docs/LOGOS-ROOMS-PARKED.md says what the
// wiring was; Logos 3 (lib/socria-prompt.ts, `collab`) is where it is mounted.
//
// NOT NEXT_PUBLIC_, deliberately: a client-readable flag would advertise the
// endpoints before the surface could use them.
//
// LOGOS 3 SHIPPED THE ROOM. The routes are on by default, everywhere;
// LOGOS_ROOMS=off is the switch that turns them off again — on one deployment
// or all of them — without a code change. The routes still check a Clerk
// session and re-check membership against the database on every call
// (lib/logos-rooms-server.ts); this switch is only whether they answer.

export function roomsEnabled(): boolean {
  return process.env.LOGOS_ROOMS !== 'off';
}
