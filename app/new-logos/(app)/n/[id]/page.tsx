import { NodeView } from '@/components/new-logos/NodeView';

export default function NewLogosNode({ params }: { params: { id: string } }) {
  return <NodeView id={decodeURIComponent(params.id)} />;
}
