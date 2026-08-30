'use client';

import { useState } from 'react';

// Visual subscribe form. When you're ready to capture emails, wire this
// to /api/subscribe (Resend, ConvertKit, Buttondown, or a Supabase table).
export function SubscribeForm() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setDone(true);
    setEmail('');
    setTimeout(() => setDone(false), 2600);
  }

  return (
    <form className="sub-form reveal d1" onSubmit={onSubmit}>
      <input
        type="email"
        placeholder={done ? "You're on the list." : 'you@example.com'}
        aria-label="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <button type="submit">
        {done ? 'Subscribed ✓' : 'Subscribe'}{' '}
        <span className="arrow">→</span>
      </button>
    </form>
  );
}
