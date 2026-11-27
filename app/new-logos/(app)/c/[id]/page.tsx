import { Suspense } from 'react';
import { ConversationView } from '@/components/new-logos/Conversation';

export default function NewLogosConversation({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id);
  return (
    <Suspense fallback={null}>
      <ConversationView key={id} id={id} />
    </Suspense>
  );
}
