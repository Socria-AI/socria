// app/one/page.tsx — the Socria One page, at its own address.
import type { Metadata } from 'next';
import './one.css';
import { OneStory } from './OneStory';

export const metadata: Metadata = {
  title: 'Socria One — the complete reasoning environment',
  description: 'Socria One. Everything Socria does, without the ceiling. $15/month.',
};

export default function OnePage() {
  return <OneStory />;
}
