// app/docs/layout.tsx — the wiki's shell wraps every docs page.
import './docs.css';
import { DocsShell } from './DocsShell';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <DocsShell>{children}</DocsShell>;
}
