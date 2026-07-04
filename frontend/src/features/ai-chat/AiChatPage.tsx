import { AlertCircle, ArrowLeft, Bot, Loader2, Send, UserRound } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { sendAiTestChatMessage } from '../../api/client';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  aiBacked?: boolean;
}

export function AiChatPage() {
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: 'assistant',
      text: 'Ready.',
      aiBacked: false,
    },
  ]);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || isSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      text: message,
    };
    const pendingId = Date.now() + 1;

    setInput('');
    setError(null);
    setIsSending(true);
    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: pendingId,
        role: 'assistant',
        text: 'Thinking...',
        aiBacked: false,
      },
    ]);

    try {
      const response = await sendAiTestChatMessage({ message });
      setMessages((current) =>
        current.map((item) =>
          item.id === pendingId
            ? {
                ...item,
                text: response.message || 'No response text returned.',
                aiBacked: response.aiBacked,
              }
            : item,
        ),
      );
    } catch (caughtError) {
      const detail = caughtError instanceof Error ? caughtError.message : 'Unable to reach the chat endpoint.';
      setError(detail);
      setMessages((current) =>
        current.map((item) =>
          item.id === pendingId
            ? {
                ...item,
                text: 'Request failed.',
                aiBacked: false,
              }
            : item,
        ),
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-sky-50 text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4 border-b border-sky-100 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white">
              <Bot size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-slate-950">AI Chat</h1>
              <p className="text-sm text-slate-500">Spring AI test channel</p>
            </div>
          </div>
          <a
            href="/"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-sky-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-sky-50"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Workspace
          </a>
        </header>

        {error ? (
          <div className="mt-4 flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p className="break-words">{error}</p>
          </div>
        ) : null}

        <section className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-sky-100 bg-white shadow-sm">
          <div ref={transcriptRef} className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            {messages.map((message) => {
              const isUser = message.role === 'user';
              return (
                <article
                  key={message.id}
                  className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser ? (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sky-50 text-sky-700">
                      <Bot size={16} aria-hidden="true" />
                    </span>
                  ) : null}
                  <div
                    className={`max-w-[min(42rem,92%)] rounded-lg px-3 py-2 text-sm leading-6 sm:max-w-[min(42rem,80%)] ${
                      isUser
                        ? 'bg-slate-950 text-white'
                        : 'border border-sky-100 bg-sky-50 text-slate-800'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{message.text}</p>
                    {!isUser ? (
                      <p className="mt-2 text-[11px] font-medium uppercase tracking-normal opacity-60">
                        {message.aiBacked ? 'OpenAI backed' : 'Waiting'}
                      </p>
                    ) : null}
                  </div>
                  {isUser ? (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                      <UserRound size={16} aria-hidden="true" />
                    </span>
                  ) : null}
                </article>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-sky-100 p-3 sm:p-4">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="input-field mt-0"
                placeholder="Message"
                disabled={isSending}
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Send message"
              >
                {isSending ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Send size={16} aria-hidden="true" />
                )}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
