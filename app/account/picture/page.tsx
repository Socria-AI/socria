// app/account/picture/page.tsx — compose the picture that represents you.
import type { Metadata } from 'next';
import './picture.css';
import { PictureComposer } from '@/components/account/PictureComposer';

export const metadata: Metadata = {
  title: 'Your picture — Socria',
  description: 'Compose your picture from the marks Socria already uses.',
  robots: { index: false, follow: false },
};

export default function PicturePage() {
  return <PictureComposer />;
}
