'use client';

// Manage Account → What you mostly think about. The same seven as onboarding
// (lib/onboarding-roles.ts), changeable any time, or none at all. Kept in this
// browser; it only shapes the examples Socria reaches for.

import { useEffect, useState } from 'react';
import { ROLES, readRole, writeRole, type RoleId } from '@/lib/onboarding-roles';
import { ObIcon } from '@/components/onboarding/ObIcon';
import { readName, sanitizeName, writeName } from '@/lib/onboarding-name';

/** What Socria calls them — the name onboarding asked for, changeable or clearable. */
export function NameField() {
  const [name, setName] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    const n = readName();
    setName(n ?? '');
    setSaved(n);
  }, []);
  const ok = !name.trim() || !!sanitizeName(name);
  const dirty = (sanitizeName(name) ?? null) !== saved;
  return (
    <form
      className="rp-name"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        setSaved(writeName(name.trim() ? name : null));
      }}
    >
      <input value={name} maxLength={40} placeholder="Not set" aria-label="What Socria calls you" onChange={(e) => setName(e.target.value)} />
      <button type="submit" disabled={!ok || !dirty}>
        Save
      </button>
      {!ok && <span className="rp-bad">Just a name, please.</span>}
    </form>
  );
}

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
