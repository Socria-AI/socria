// app/(app)/layout.tsx
import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/AppSidebar';
import { ensureUserExists } from '@/lib/ensure-user';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  // Mirror Clerk user → users table on first visit.
  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? null;
  await ensureUserExists(userId, email);

  return (
    <div className="flex min-h-dvh paper-bg">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">{children}</div>
    </div>
  );
}
