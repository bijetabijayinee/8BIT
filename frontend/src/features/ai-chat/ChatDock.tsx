import { Bot, MessageCircle, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import type { StaffUser } from '../../types/careflow';
import { AiAgentChat } from './AiAgentChat';
import { HospitalLiveChat } from './HospitalLiveChat';

interface ChatDockProps {
  activeStaff: StaffUser | null;
  onAction: (action: string) => void;
}

type DockPanel = 'savi' | 'hospital' | null;

/**
 * Nav-style chat launcher fixed at the top of every route: Savi question answering
 * and the hospital-wide live chat open as panels dropping down below the bar.
 */
export function ChatDock({ activeStaff, onAction }: ChatDockProps) {
  const [openPanel, setOpenPanel] = useState<DockPanel>(null);

  const toggle = (panel: Exclude<DockPanel, null>) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };

  return (
    <div className="fixed right-4 top-3 z-50 flex flex-col items-end">
      <div className="flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/90 px-2 py-1.5 shadow-lg backdrop-blur">
        <DockButton
          label="Ask Savi"
          active={openPanel === 'savi'}
          onClick={() => toggle('savi')}
          icon={openPanel === 'savi' ? <X size={15} aria-hidden="true" /> : <Bot size={15} aria-hidden="true" />}
        />
        <DockButton
          label="Hospital chat"
          active={openPanel === 'hospital'}
          onClick={() => toggle('hospital')}
          icon={openPanel === 'hospital' ? <X size={15} aria-hidden="true" /> : <MessageCircle size={15} aria-hidden="true" />}
        />
      </div>

      {openPanel === 'savi' ? (
        <div className="animate-message-in mt-2 w-[26rem] max-w-[calc(100vw-2rem)]">
          <AiAgentChat activeStaff={activeStaff} onAction={onAction} embedded />
        </div>
      ) : null}
      {openPanel === 'hospital' ? (
        <div className="animate-message-in mt-2 w-[26rem] max-w-[calc(100vw-2rem)]">
          <HospitalLiveChat activeStaff={activeStaff} />
        </div>
      ) : null}
    </div>
  );
}

function DockButton({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
        active ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
