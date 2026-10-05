// lib/rooms-flag.ts
//
// THE TWO-SEAT ROOM IS IN THE TREE AND NOT IN THE PRODUCT.
//
// The room code — lib/collab.ts, lib/collab-transport.ts,
// lib/logos-rooms-server.ts, lib/logos-rooms-shared.ts, components/useLogosCollab.ts,
// components/CollabBar.tsx and app/api/logos/room/* — was deleted for the
// production cut and restored here from that commit's parent, unchanged, so
// that shipping it is a wiring job and not an archaeology job. Until it ships
// the routes answer 404 and nothing on the Logos surface mounts the hook.
//
// ONE SWITCH, READ ON THE SERVER. The routes are the only live code; the hook
// and the bar are imported by nothing. Setting LOGOS_ROOMS=on turns the routes
// on; mounting the hook in LogosApp is the rest, and docs/LOGOS-ROOMS-PARKED.md
// says exactly what that wiring was.
//
// NOT NEXT_PUBLIC_, deliberately: a client-readable flag would advertise the
// endpoints before the surface could use them.

//
// LOGOS 3 PUT THE ROOM BACK, ON DEV. Outside production the routes are on by
// default, so the dev and preview deployments can think together without an
// environment change; LOGOS_ROOMS=off turns them off there. Production stays
// off unless LOGOS_ROOMS=on is set explicitly — Logos 3 is not offered there.

import { isProduction } from './environment';

export function roomsEnabled(): boolean {
  const v = process.env.LOGOS_ROOMS;
  if (v === 'on') return true;
  if (v === 'off') return false;
  return !isProduction();
}
