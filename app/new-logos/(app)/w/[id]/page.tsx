import { ObjectiveCanvas } from '@/components/new-logos/ObjectiveCanvas';

export default function NewLogosWorkspace({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id);
  return <ObjectiveCanvas key={id} id={id} />;
}
