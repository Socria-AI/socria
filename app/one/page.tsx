// app/one/page.tsx — the Socria One page, at its own address.
import type { Metadata } from 'next';
import './one.css';
import { OneStory } from './OneStory';
import { priceWithPeriod } from '@/lib/socria-one';
import '../quiet.css';
import { QuietMast, QuietProgress, QuietFoot } from '@/components/quiet/Quiet';
import { QuietMotion } from '@/components/quiet/QuietMotion';

export const metadata: Metadata = {
  title: 'Socria One — the complete reasoning environment',
  description: `Socria One. Everything Socria does, without the ceiling. ${priceWithPeriod()}.`,
};

export default function OnePage() {
  return (
    <div className="q-root">
      <QuietMotion />
      <QuietProgress />
      <QuietMast section="Socria One" current="one" />
      <OneStory />
      <QuietFoot />
    </div>
  );
}
