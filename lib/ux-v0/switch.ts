// lib/ux-v0/switch.ts — whether SocriaUX v0 is open on this deployment.
//
// As Logos 6's parts are (lib/logos6/switches.ts): ON on dev, previews and a
// local server; OFF in production until NEXT_PUBLIC_SOCRIAUX_V0=on is set
// there. So merging dev into main cannot open /ux-v0 by accident. Read with
// the literal property name so Next inlines it for the browser too.

import { currentEnv, type Env } from '../environment';

export function readV0(value: string | undefined, where: Env): boolean {
  const v = (value ?? '').trim().toLowerCase();
  if (['on', '1', 'true', 'yes'].includes(v)) return true;
  if (['off', '0', 'false', 'no'].includes(v)) return false;
  return where !== 'production';
}

export function socriauxV0On(): boolean {
  return readV0(process.env.NEXT_PUBLIC_SOCRIAUX_V0, currentEnv());
}
