'use client';
// app/account/picture/PicturePane.tsx
//
// The composer needs to know what the person holds, and the route never told
// it. PictureComposer defaults `isOne` to false, so a paying member arrived
// to find the three One grounds, the One seal and the seal ring all dimmed
// and unclickable — locked out of the options they pay for.
//
// Worse, the composer sanitises the stored picture against that plan on
// mount. A member who had already saved a Prussian ground was silently
// downgraded on load, and the next Save wrote the downgrade back.
//
// Nothing renders until the plan is known: showing the locked state for a
// frame and then unlocking it is its own small lie, and the sanitise pass
// would run against the wrong answer.

import { usePlan } from '@/components/usePlan';
import { PictureComposer } from '@/components/account/PictureComposer';

export function PicturePane() {
  const plan = usePlan();
  if (!plan.known) {
    return (
      <div className="pfp-wait" role="status">
        <p>Opening your picture…</p>
      </div>
    );
  }
  return <PictureComposer isOne={plan.plan === 'one'} />;
}
