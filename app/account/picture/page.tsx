// app/account/picture/page.tsx — compose the picture that represents you.
import type { Metadata } from 'next';
import './picture.css';
import { PicturePane } from './PicturePane';

export const metadata: Metadata = {
  title: 'Your picture — Socria',
  description: 'Compose your picture from the marks Socria already uses.',
  robots: { index: false, follow: false },
};

export default function PicturePage() {
  return <PicturePane />;
}
