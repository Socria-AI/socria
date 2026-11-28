import { ArtifactCanvas } from '@/components/new-logos/ArtifactCanvas';

export default function NewLogosArtifact({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id);
  return <ArtifactCanvas key={id} id={id} />;
}
