// One Project, at /projects/[id].

'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { ProjectView } from '@/components/projects/ProjectView';

export default function ProjectPage({ params }: { params: { id: string } }) {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace(`/sign-in?redirect_url=/projects/${encodeURIComponent(params.id)}`);
  }, [isLoaded, isSignedIn, router, params.id]);
  if (!isLoaded || !isSignedIn) return null;
  // useSearchParams inside needs a Suspense boundary to build statically.
  return (
    <Suspense fallback={null}>
      <ProjectView id={params.id} />
    </Suspense>
  );
}
