// components/NewSessionButton.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from './Button';

export function NewSessionButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    try {
      const r = await fetch('/api/conversations', { method: 'POST' });
      if (r.ok) {
        const { conversation } = await r.json();
        router.push(`/chat/${conversation.id}`);
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <Button onClick={start} disabled={loading} size="lg">
      {loading ? 'Opening…' : 'Begin a thought session'}
    </Button>
  );
}
