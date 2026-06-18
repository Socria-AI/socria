// app/studio/layout.tsx
// Studio gets its own layout so Clerk's ClerkProvider in the root layout
// doesn't interfere with Sanity's auth flow.
export const metadata = {
  title: 'Socria — Studio',
};

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
