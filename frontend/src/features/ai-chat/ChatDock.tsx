import { Bell, BellRing, ChevronDown, LogOut, MessageCircle, X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { getNotifications } from '../../api/client';
import type { StaffUser } from '../../types/careflow';
import { NotificationsPanel } from '../notifications/NotificationsPanel';
import { PatientMarquee } from '../queue/PatientMarquee';
import { ClockWeatherWidget } from '../widgets/ClockWeatherWidget';
import { AiAgentChat } from './AiAgentChat';
import { HospitalLiveChat } from './HospitalLiveChat';
import { SaviOrb } from './SaviOrb';

interface ChatDockProps {
  activeStaff: StaffUser | null;
  onAction: (action: string) => void;
  onLogout: () => void;
  onNavigate: (route: 'queue') => void;
  marqueeRefreshSignal?: number;
}

type DockPanel = 'savi' | 'hospital' | 'notifications' | 'profile' | null;

function roleLabel(role: StaffUser['role']) {
  return role
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function initialsOf(name: string) {
  const parts = name.replace(/^Dr\.?\s+/i, '').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Global top bar: a live patient ticker on the left, and a dock on the right that
 * launches Savi, the hospital chat, notifications, and a profile menu. Panels drop
 * down beneath the bar.
 */
export function ChatDock({ activeStaff, onAction, onLogout, onNavigate, marqueeRefreshSignal = 0 }: ChatDockProps) {
  const [openPanel, setOpenPanel] = useState<DockPanel>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const toggle = (panel: Exclude<DockPanel, null>) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };

  const handleUnreadChange = useCallback((count: number) => setUnreadCount(count), []);

  // Keep the bell badge live even while the notifications panel is closed.
  useEffect(() => {
    if (!activeStaff) {
      setUnreadCount(0);
      return;
    }
    let mounted = true;
    const staffLookup = activeStaff.staffCode ?? activeStaff.displayName;
    const poll = async () => {
      try {
        const list = await getNotifications(activeStaff.role, staffLookup);
        if (mounted) {
          setUnreadCount(list.filter((item) => !item.read).length);
        }
      } catch {
        // ignore transient fetch errors; badge holds its last value
      }
    };
    void poll();
    const intervalId = window.setInterval(poll, 20_000);
    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, [activeStaff]);

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-3 border-b border-white/10 bg-slate-950 px-3 text-white shadow-lg">
      <ClockWeatherWidget />
      <PatientMarquee refreshSignal={marqueeRefreshSignal} activeStaff={activeStaff} />

      <div className="relative flex shrink-0 items-center gap-1">
        <DockButton
          label="Savi"
          hideLabelOnMobile
          active={openPanel === 'savi'}
          onClick={() => toggle('savi')}
          icon={openPanel === 'savi' ? <X size={15} aria-hidden="true" /> : <SaviOrb size={22} />}
        />
        <DockButton
          label="Chat"
          hideLabelOnMobile
          active={openPanel === 'hospital'}
          onClick={() => toggle('hospital')}
          icon={openPanel === 'hospital' ? <X size={15} aria-hidden="true" /> : <MessageCircle size={16} aria-hidden="true" />}
        />
        <button
          type="button"
          onClick={() => toggle('notifications')}
          aria-label="Notifications"
          className={`relative flex h-8 w-8 items-center justify-center rounded-full transition ${
            openPanel === 'notifications' ? 'bg-white text-slate-950' : 'text-slate-200 hover:bg-white/10 hover:text-white'
          }`}
        >
          {unreadCount > 0 ? <BellRing size={16} aria-hidden="true" /> : <Bell size={16} aria-hidden="true" />}
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-slate-950">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </button>

        <span className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />

        {/* Profile avatar */}
        <button
          type="button"
          onClick={() => toggle('profile')}
          aria-label="Profile menu"
          className={`flex h-8 items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-1.5 transition ${
            openPanel === 'profile' ? 'bg-white/15' : 'hover:bg-white/10'
          }`}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-[11px] font-bold text-white ring-1 ring-inset ring-white/30">
            {activeStaff ? initialsOf(activeStaff.displayName) : '?'}
          </span>
          <ChevronDown size={13} className={`hidden text-slate-300 transition sm:block ${openPanel === 'profile' ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>

        {/* Drop-down panels */}
        {openPanel === 'savi' ? (
          <DockDropdown wide>
            <AiAgentChat activeStaff={activeStaff} onAction={onAction} embedded />
          </DockDropdown>
        ) : null}
        {openPanel === 'hospital' ? (
          <DockDropdown wide>
            <HospitalLiveChat activeStaff={activeStaff} />
          </DockDropdown>
        ) : null}
        {openPanel === 'notifications' ? (
          <DockDropdown>
            <NotificationsPanel activeStaff={activeStaff} variant="dropdown" onUnreadChange={handleUnreadChange} />
          </DockDropdown>
        ) : null}
        {openPanel === 'profile' && activeStaff ? (
          <DockDropdown>
            <div className="animate-dropdown-in w-64 rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-sm font-bold text-white ring-1 ring-inset ring-white/30">
                  {initialsOf(activeStaff.displayName)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{activeStaff.displayName}</p>
                  <p className="truncate text-xs text-slate-500">{roleLabel(activeStaff.role)}</p>
                </div>
              </div>
              <dl className="mt-3 space-y-1.5 rounded-lg bg-slate-50 p-3 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Staff code</dt>
                  <dd className="font-mono font-medium text-slate-800">{activeStaff.staffCode}</dd>
                </div>
                {activeStaff.department ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Department</dt>
                    <dd className="font-medium text-slate-800">{activeStaff.department}</dd>
                  </div>
                ) : null}
                {activeStaff.specialty ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Specialty</dt>
                    <dd className="font-medium text-slate-800">{activeStaff.specialty}</dd>
                  </div>
                ) : null}
              </dl>
              <button
                type="button"
                onClick={() => {
                  setOpenPanel(null);
                  onLogout();
                }}
                className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-rose-200 bg-white text-sm font-medium text-rose-700 transition hover:bg-rose-50"
              >
                <LogOut size={15} aria-hidden="true" />
                Logout
              </button>
            </div>
          </DockDropdown>
        ) : null}
      </div>

      {/* click-away backdrop */}
      {openPanel ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setOpenPanel(null)}
          className="fixed inset-0 top-12 -z-10 cursor-default"
        />
      ) : null}
    </header>
  );
}

function DockDropdown({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={`animate-dropdown-in absolute right-0 top-full mt-2 max-w-[calc(100vw-1.5rem)] ${wide ? 'w-[29rem]' : ''}`}
    >
      {children}
    </div>
  );
}

function DockButton({
  label,
  active,
  onClick,
  icon,
  hideLabelOnMobile = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  hideLabelOnMobile?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition ${
        active ? 'bg-white text-slate-950' : 'text-slate-200 hover:bg-white/10 hover:text-white'
      }`}
    >
      {icon}
      <span className={hideLabelOnMobile ? 'hidden sm:inline' : ''}>{label}</span>
    </button>
  );
}
