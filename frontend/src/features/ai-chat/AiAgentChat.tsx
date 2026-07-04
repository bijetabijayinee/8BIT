import { Bot, ClipboardList, Loader2, Send, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { sendAiChatMessage } from '../../api/client';
import { FormattedMessage } from '../../components/FormattedMessage';
import type { ChatTurn, StaffUser } from '../../types/careflow';

interface ChatMessage {
  id: number;
  role: 'staff' | 'assistant';
  text: string;
  aiBacked?: boolean;
  isPending?: boolean;
}

interface AiAgentChatProps {
  activeStaff: StaffUser | null;
  onAction: (action: string) => void;
  embedded?: boolean;
}

const CHAT_STORAGE_KEY = 'careflow-savi-chat-v1';

const welcomeMessage: ChatMessage = {
  id: 1,
  role: 'assistant',
  text: 'I can answer from live queue, intake, doctor, bed, and hospital directory context - and take real actions like starting treatment, assigning doctors, or escalating priority.',
  aiBacked: false,
};

const exampleQueries = [
  'Which high urgency patients need attention first?',
  'Find chest pain patients and summarize their triage notes.',
  'Which doctors are assigned and who is still waiting?',
  'What beds are occupied by department?',
];

const actionPrompts = [
  'Start treatment for the longest waiting critical patient',
  'Assign the best available doctor to the current patient',
  'Escalate the longest waiting patient to high priority',
  'Discharge patients who finished treatment',
];

function loadStoredMessages(): ChatMessage[] {
  try {
    const stored = window.localStorage.getItem(CHAT_STORAGE_KEY);
    if (!stored) {
      return [welcomeMessage];
    }
    const parsed = JSON.parse(stored) as ChatMessage[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [welcomeMessage];
    }
    return parsed.filter((item) => !item.isPending).slice(-60);
  } catch {
    return [welcomeMessage];
  }
}

function localAgentFallback(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes('critical') || normalized.includes('urgent')) {
    return {
      text: 'I can switch you to the queue and search for critical cases. Backend AI is not reachable right now, so this is a local workflow fallback.',
      actions: ['filter_critical_high'],
    };
  }

  if (normalized.includes('intake')) {
    return {
      text: 'Open the intake route and capture arrival mode, complaint, symptoms, vitals, distress, risk flags, and department. Staff attribution is filled from the active staff profile.',
      actions: ['open_intake'],
    };
  }

  if (normalized.includes('refresh') || normalized.includes('reload')) {
    return {
      text: 'I can refresh the queue and dashboard views. Backend AI is not reachable right now, so this is a local workflow fallback.',
      actions: ['refresh_queue', 'refresh_dashboard'],
    };
  }

  if (normalized.includes('wait')) {
    return {
      text: 'Use the dashboard wait-time graph for overall trends, or sort the queue by wait time for row-level review.',
      actions: ['refresh_dashboard'],
    };
  }

  return {
    text: 'I can help with queue status, intake completeness, wait-time visibility, workflow navigation, and real actions like starting treatment or assigning doctors. The backend AI is unreachable right now.',
    actions: [],
  };
}

export function AiAgentChat({ activeStaff, onAction, embedded = false }: AiAgentChatProps) {
  const [isOpen, setIsOpen] = useState(embedded);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(loadStoredMessages);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hasStaffMessages = messages.some((item) => item.role === 'staff');

  useEffect(() => {
    try {
      window.localStorage.setItem(
        CHAT_STORAGE_KEY,
        JSON.stringify(messages.filter((item) => !item.isPending).slice(-60)),
      );
    } catch {
      // Storage may be unavailable; the chat still works for this session.
    }
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, isOpen]);

  const sendMessage = async (rawMessage: string) => {
    const trimmedMessage = rawMessage.trim();
    if (!trimmedMessage || isSending) {
      return;
    }

    const history: ChatTurn[] = messages
      .filter((item) => !item.isPending)
      .slice(-10)
      .map((item) => ({ role: item.role, text: item.text }));

    const pendingId = Date.now() + 1;
    setMessage('');
    setIsSending(true);
    setMessages((current) => [
      ...current,
      { id: Date.now(), role: 'staff', text: trimmedMessage },
      { id: pendingId, role: 'assistant', text: 'Savi is checking live workspace context...', aiBacked: false, isPending: true },
    ]);

    try {
      const response = await sendAiChatMessage({
        message: trimmedMessage,
        actorName: activeStaff?.displayName,
        actorRole: activeStaff?.role,
        history,
      });
      response.suggestedActions.forEach(onAction);
      setMessages((current) =>
        current.map((item) => item.id === pendingId ? {
          ...item,
          role: 'assistant',
          text: response.message,
          aiBacked: response.aiBacked,
          isPending: false,
        } : item),
      );
    } catch {
      const fallback = localAgentFallback(trimmedMessage);
      fallback.actions.forEach(onAction);
      setMessages((current) =>
        current.map((item) => item.id === pendingId ? {
          ...item,
          role: 'assistant',
          text: fallback.text,
          aiBacked: false,
          isPending: false,
        } : item),
      );
    } finally {
      setIsSending(false);
    }
  };

  const clearChat = () => {
    setMessages([welcomeMessage]);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage(message);
  };

  return (
    <div className={embedded ? 'w-full min-w-0' : ''}>
      {isOpen ? (
        <section className={`flex min-w-0 flex-col overflow-hidden rounded-lg border border-sky-200 bg-white shadow-2xl ${embedded ? 'h-[34rem] w-full' : 'h-[30rem] w-[24rem] max-w-[calc(100vw-2.5rem)]'}`}>
          <header className="flex shrink-0 items-center justify-between border-b border-sky-100 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-950 text-white">
                <Bot size={17} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">Savi - Healthcare AI Agent</p>
                <p className="text-xs text-slate-500">Live hospital context - takes real queue actions</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={clearChat}
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-sky-50 hover:text-slate-950"
                aria-label="Clear chat history"
                title="Clear chat history"
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
              {embedded ? null : (
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-sky-50 hover:text-slate-950"
                  aria-label="Close AI chat"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          </header>

          <div ref={scrollRef} className="scrollbar-hide min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((item) => (
              <div
                key={item.id}
                className={`animate-message-in max-w-full rounded-lg px-3 py-2 text-sm ${
                  item.role === 'staff'
                    ? 'ml-8 bg-slate-950 text-white'
                    : 'mr-8 border border-emerald-100 bg-emerald-50 text-slate-800'
                }`}
              >
                {item.role === 'assistant' ? <FormattedMessage text={item.text} /> : <PlainMessage text={item.text} />}
                {item.role === 'assistant' ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-normal opacity-60">
                    {item.isPending ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : null}
                    {item.isPending ? 'Working' : item.aiBacked ? 'LLM context answer' : 'Workflow fallback'}
                  </p>
                ) : null}
              </div>
            ))}
            {!hasStaffMessages ? (
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-slate-500">
                  <ClipboardList size={14} aria-hidden="true" />
                  Try asking
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {exampleQueries.map((query) => (
                    <button
                      key={query}
                      type="button"
                      disabled={isSending}
                      onClick={() => void sendMessage(query)}
                      className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-left text-xs font-medium leading-5 text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {query}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-slate-500">
                  <Wand2 size={14} aria-hidden="true" />
                  Or let Savi act
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {actionPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      disabled={isSending}
                      onClick={() => void sendMessage(prompt)}
                      className="min-w-0 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-left text-xs font-medium leading-5 text-indigo-900 transition hover:border-indigo-300 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="shrink-0 border-t border-sky-100 p-3">
            <div className="flex gap-2">
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                disabled={isSending}
                className="input-field mt-0 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60"
                placeholder={isSending ? 'Savi is thinking...' : 'Ask, or tell Savi to act on the queue'}
              />
              <button
                type="submit"
                disabled={isSending || !message.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Send AI message"
              >
                {isSending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex h-12 items-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-medium text-white shadow-2xl transition hover:scale-105"
          aria-label="Open AI agent chat"
        >
          <Sparkles size={18} aria-hidden="true" />
          Savi
        </button>
      )}
    </div>
  );
}

function PlainMessage({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap break-words leading-6">{text}</p>;
}
