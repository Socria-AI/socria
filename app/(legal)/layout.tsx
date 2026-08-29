import './legal.css';
import { LegalShell } from './LegalShell';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <LegalShell>{children}</LegalShell>;
}
