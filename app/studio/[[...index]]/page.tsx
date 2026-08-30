// app/studio/[[...index]]/page.tsx
// Mounts Sanity Studio at /studio for authoring blog posts.
'use client';

import { NextStudio } from 'next-sanity/studio';
import config from '@/sanity.config';
import { isSanityConfigured } from '@/sanity/env';

export default function StudioPage() {
  if (!isSanityConfigured()) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: '#F5F3EB',
          color: '#1F1F1F',
          fontFamily: 'system-ui, sans-serif',
          padding: '40px',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 480 }}>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 36, margin: 0 }}>
            Studio not configured
          </h1>
          <p style={{ marginTop: 16, opacity: 0.7, lineHeight: 1.5 }}>
            Add <code>NEXT_PUBLIC_SANITY_PROJECT_ID</code> and{' '}
            <code>NEXT_PUBLIC_SANITY_DATASET</code> to your environment, then
            redeploy.
          </p>
        </div>
      </div>
    );
  }

  return <NextStudio config={config} />;
}
