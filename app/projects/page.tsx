// Projects, at /projects.
//
// Focused regions of the one Mind Graph — see lib/mind/projects.ts. The page
// itself is a shell: sign-in, then the list.

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { ProjectsList } from '@/components/projects/ProjectsList';

export default function ProjectsPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace('/sign-in?redirect_url=/projects');
  }, [isLoaded, isSignedIn, router]);
  if (!isLoaded || !isSignedIn) return null;
  return <ProjectsList />;
}
