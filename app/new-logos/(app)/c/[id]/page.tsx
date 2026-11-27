import { Suspense } from 'react';
import { ConversationCanvas } from '@/components/new-logos/ConversationCanvas';

export default function NewLogosConversation({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id);
  return (
    <Suspense fallback={null}>
      <ConversationCanvas key={id} id={id} />
    </Suspense>
  );
}
