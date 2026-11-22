// app/studio/layout.tsx
// Studio gets its own layout so Clerk's ClerkProvider in the root layout
// doesn't interfere with Sanity's auth flow.
// The content studio is the team's, behind Sanity's sign-in: never a search result.
export const metadata = {
  title: { absolute: 'Socria — Studio' },
  robots: { index: false, follow: false },
};

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
