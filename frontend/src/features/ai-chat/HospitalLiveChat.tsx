import { Bot, Loader2, MessageCircle, Send } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { getHospitalChatMessages, sendHospitalChatMessage } from '../../api/client';
import { FormattedMessage } from '../../components/FormattedMessage';
import type { HospitalChatMessage, StaffUser } from '../../types/careflow';

interface HospitalLiveChatProps {
  activeStaff: StaffUser | null;
}

export function HospitalLiveChat({ activeStaff }: HospitalLiveChatProps) {
  const [messages, setMessages] = useState<HospitalChatMessage[]>([]);
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    try {
      setMessages(await getHospitalChatMessages());
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load hospital chat.');
    }
  }, []);

  useEffect(() => {
    void loadMessages();
    const intervalId = window.setInterval(() => void loadMessages(), 8_000);
    return () => window.clearInterval(intervalId);
  }, [loadMessages]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || isSending) {
      return;
    }
    setIsSending(true);
    setBody('');
    try {
      setMessages(await sendHospitalChatMessage({
        authorName: activeStaff?.displayName ?? 'Care team',
        authorRole: activeStaff?.role ?? 'TRIAGE_NURSE',
        body: trimmed,
      }));
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to send message.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="flex h-[33rem] min-w-0 flex-col overflow-hidden rounded-lg border border-sky-100 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-sky-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-sky-700 text-white">
            <MessageCircle size={18} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Hospital live chat</h3>
            <p className="text-xs text-slate-500">Tag @savi for an LLM answer</p>
          </div>
        </div>
        {isSending ? <Loader2 size={17} className="animate-spin text-sky-700" aria-hidden="true" /> : null}
      </header>

      <div className="scrollbar-hide min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
        {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
        {messages.length === 0 ? (
          <p className="rounded-md bg-sky-50 p-3 text-sm text-slate-500">No hospital messages yet.</p>
        ) : (
          messages.map((message) => {
            const isOwn = !message.savi && !!activeStaff && message.authorName === activeStaff.displayName;
            return (
              <div key={message.id} className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
                {!isOwn ? (
                  <span
                    className={`mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                      message.savi ? 'bg-emerald-600' : 'bg-slate-400'
                    }`}
                  >
                    {message.savi ? <Bot size={13} aria-hidden="true" /> : message.authorName.charAt(0).toUpperCase()}
                  </span>
                ) : null}
                <div
                  className={`animate-message-in max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] shadow-sm ${
                    isOwn
                      ? 'rounded-br-md bg-gradient-to-br from-slate-800 to-slate-950 text-white'
                      : message.savi
                        ? 'rounded-bl-md border border-emerald-100 bg-emerald-50/80 text-slate-800'
                        : 'rounded-bl-md border border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  {!isOwn ? (
                    <p className={`mb-1 text-[11px] font-semibold ${message.savi ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {message.authorName}
                    </p>
                  ) : null}
                  {message.savi ? (
                    <FormattedMessage text={message.body} />
                  ) : (
                    <p className="whitespace-pre-wrap break-words leading-6">{message.body}</p>
                  )}
                  <p className={`mt-1 text-[10px] ${isOwn ? 'text-slate-300' : 'text-slate-400'}`}>
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={submit} className="border-t border-sky-100 p-3">
        <div className="flex gap-2">
          <input
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={isSending}
            className="input-field mt-0 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60"
            placeholder={isSending ? 'Savi is thinking...' : 'Message the hospital, or tag @savi'}
          />
          <button
            type="submit"
            disabled={isSending || !body.trim()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Send hospital chat"
          >
            <Send size={16} aria-hidden="true" />
          </button>
        </div>
      </form>
    </section>
  );
}
