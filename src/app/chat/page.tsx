import { ChatPanel } from '@/components/chat-panel';

export const metadata = { title: 'Chat' };

export default function ChatPage() {
  return (
    <main className="page">
      <ChatPanel />
    </main>
  );
}
