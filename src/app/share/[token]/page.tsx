import { notFound } from 'next/navigation';
import { getSharedConversation } from '@/lib/featureStorage';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { Bot, User, Lock, Share2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface SharePageProps {
  params: { token: string };
}

export const metadata = {
  title: 'Percakapan Bersama - Hyunk AI Hub',
  description: 'Percakapan bersama yang dibagikan secara publik.',
};

export default async function SharePage({ params }: SharePageProps) {
  const token = (params?.token || '').trim();
  if (!token) notFound();

  const shared = await getSharedConversation(token);
  if (!shared) notFound();

  return (
    <div className="min-h-full bg-slate-950 text-slate-100 overflow-y-auto">
      <header className="sticky top-0 z-10 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
            <Share2 className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold truncate">{shared.title}</h1>
            <p className="text-[11px] text-slate-400 truncate">
              Dibagikan dari Hyunk AI Hub
              {shared.model ? ` · ${shared.model}` : ''}
            </p>
          </div>
          <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
            <Lock className="w-3 h-3" />
            Read-only
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4 pb-16">
        {shared.messages.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-12">
            Percakapan ini belum memiliki pesan.
          </p>
        ) : (
          shared.messages.map((message, index) => {
            const isUser = message.role === 'user';
            return (
              <div
                key={`${message.createdAt || 'm'}-${index}`}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-cyan-400" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 border ${
                    isUser
                      ? 'bg-cyan-600/15 border-cyan-500/25 text-slate-100'
                      : 'bg-slate-900 border-slate-800 text-slate-200'
                  }`}
                >
                  {isUser ? (
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                      {message.content}
                    </p>
                  ) : (
                    <MarkdownRenderer content={message.content} />
                  )}
                </div>
                {isUser && (
                  <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4 text-slate-400" />
                  </div>
                )}
              </div>
            );
          })
        )}
      </main>

      <footer className="border-t border-slate-800 py-5 text-center">
        <a
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition"
        >
          Buka Hyunk AI Hub
        </a>
      </footer>
    </div>
  );
}
