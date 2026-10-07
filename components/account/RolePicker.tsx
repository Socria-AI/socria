'use client';

// Manage Account → What you mostly think about. The same seven as onboarding
// (lib/onboarding-roles.ts), changeable any time, or none at all. Kept in this
// browser; it only shapes the examples Socria reaches for.

import { useEffect, useState } from 'react';
import { ROLES, readRole, writeRole, type RoleId } from '@/lib/onboarding-roles';
import { ObIcon } from '@/components/onboarding/ObIcon';

export function RolePicker() {
  const [role, setRole] = useState<RoleId | null>(null);
  useEffect(() => setRole(readRole()), []);
  const pick = (id: RoleId | null) => {
    writeRole(id);
    setRole(id);
  };
  return (
    <div className="rp" role="radiogroup" aria-label="What you mostly think about">
      {ROLES.map((r) => (
        <button key={r.id} type="button" role="radio" aria-checked={role === r.id} className={`rp-o${role === r.id ? ' on' : ''}`} onClick={() => pick(role === r.id ? null : r.id)} title={r.line}>
          <ObIcon name={r.id} size={16} />
          <span>{r.title}</span>
        </button>
      ))}
      <p className="rp-note">{role ? 'Socria leans its examples this way. Press it again to clear.' : 'Not set — Socria makes no guess.'}</p>
    </div>
  );
}
