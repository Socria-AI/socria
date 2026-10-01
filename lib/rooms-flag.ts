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

export function roomsEnabled(): boolean {
  return process.env.LOGOS_ROOMS === 'on';
}
