import { Bell, BellRing, CheckCheck, Stethoscope, ClipboardList, Globe, Activity } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../../api/client';
import type { StaffNotification, StaffUser } from '../../types/careflow';

interface NotificationsPanelProps {
  activeStaff: StaffUser | null;
}

const categoryIcon: Record<string, ReactNode> = {
  ASSIGNMENT: <Stethoscope size={15} aria-hidden="true" />,
  INTAKE: <ClipboardList size={15} aria-hidden="true" />,
  TRIAGE: <Activity size={15} aria-hidden="true" />,
  RESEARCH: <Globe size={15} aria-hidden="true" />,
};

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) {
    return 'Now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

export function NotificationsPanel({ activeStaff }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<StaffNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  const role = activeStaff?.role;
  const staffLookup = activeStaff?.staffCode ?? activeStaff?.displayName;

  const load = useCallback(async () => {
    if (!role) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }
    try {
      setNotifications(await getNotifications(role, staffLookup));
    } catch {
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  }, [role, staffLookup]);

  useEffect(() => {
    setIsLoading(true);
    void load();
    const intervalId = window.setInterval(() => void load(), 12_000);
    return () => window.clearInterval(intervalId);
  }, [load]);

  const unreadCount = notifications.filter((item) => !item.read).length;

  const handleMarkRead = async (notification: StaffNotification) => {
    if (notification.read) {
      return;
    }
    setNotifications((current) => current.map((item) => (item.id === notification.id ? { ...item, read: true } : item)));
    try {
      await markNotificationRead(notification.id);
    } catch {
      void load();
    }
  };

  const handleMarkAll = async () => {
    if (!role || unreadCount === 0) {
      return;
    }
    setIsBusy(true);
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    try {
      await markAllNotificationsRead(role, staffLookup);
    } catch {
      void load();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="flex h-full min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
            {unreadCount > 0 ? <BellRing size={18} aria-hidden="true" /> : <Bell size={18} aria-hidden="true" />}
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">
                {unreadCount}
              </span>
            ) : null}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Notifications</h3>
            <p className="text-xs text-slate-500">
              {activeStaff ? `${activeStaff.role.replace(/_/g, ' ').toLowerCase()} inbox` : 'Sign in to receive alerts'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleMarkAll()}
          disabled={isBusy || unreadCount === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCheck size={14} aria-hidden="true" />
          Mark all
        </button>
      </div>

      <div className="scrollbar-hide mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-lg bg-slate-100" />)
        ) : notifications.length === 0 ? (
          <div className="flex h-full min-h-32 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 p-6 text-center">
            <Bell size={22} className="text-slate-300" aria-hidden="true" />
            <p className="mt-2 text-sm text-slate-500">No notifications yet.</p>
            <p className="mt-1 text-xs text-slate-400">The Notification Agent will alert you when patients are routed to you.</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <button
              key={notification.id}
              type="button"
              onClick={() => void handleMarkRead(notification)}
              className={`animate-message-in flex w-full items-start gap-3 rounded-lg border p-3 text-left transition ${
                notification.read
                  ? 'border-slate-100 bg-white'
                  : 'border-sky-200 bg-sky-50 shadow-sm hover:bg-sky-100'
              }`}
            >
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                  notification.read ? 'bg-slate-100 text-slate-500' : 'bg-slate-950 text-white'
                }`}
              >
                {categoryIcon[notification.category] ?? <Bell size={15} aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-950">{notification.title}</p>
                  {!notification.read ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-500" /> : null}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-600">{notification.body}</p>
                <p className="mt-1 text-[11px] font-medium text-slate-400">
                  {notification.agent} - {relativeTime(notification.createdAt)}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
