import {
  Armchair,
  Bell,
  Clock3,
  Loader2,
  MapPin,
  MoveRight,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  Stethoscope,
  X,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  createNotification,
  getDepartments,
  getQueueEntries,
  getStaffUsers,
  updateQueuePlacement,
  updateQueueStatus,
} from '../../api/client';
import { showToast } from '../../components/toast';
import type { QueueEntry, StaffUser, UrgencyCategory } from '../../types/careflow';

type HomeRoute = 'queue' | 'patients' | 'intake' | 'allocation' | 'dashboard' | 'people' | 'knowledge' | 'calendar' | 'home';

interface WaitingRoomQueueProps {
  activeStaff: StaffUser | null;
  onNavigate: (route: HomeRoute) => void;
}

// Only patients physically still in the waiting room - once treatment starts they
// move to the doctor's care and drop off this view (they still live in the full
// queue page's IN_TREATMENT list, which is a separate view from this one).
const activeStatuses = new Set(['WAITING', 'IN_TRIAGE']);
const urgencyRank: Record<UrgencyCategory, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

// Seat shell per urgency: the chair glyph, glow ring, and label tint. Critical/high
// seats pulse - they are the ones that "need urgent attention" in the waiting room.
const seatStyles: Record<UrgencyCategory, { seat: string; ring: string; label: string; pulse: boolean }> = {
  CRITICAL: { seat: 'text-rose-600', ring: 'ring-rose-300 shadow-[0_0_14px_rgba(244,63,94,0.45)]', label: 'text-rose-700', pulse: true },
  HIGH: { seat: 'text-amber-600', ring: 'ring-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.35)]', label: 'text-amber-700', pulse: true },
  MEDIUM: { seat: 'text-sky-600', ring: 'ring-sky-200', label: 'text-sky-700', pulse: false },
  LOW: { seat: 'text-emerald-600', ring: 'ring-emerald-200', label: 'text-emerald-700', pulse: false },
};

function toastActionError(caughtError: unknown, fallback: string) {
  if (caughtError instanceof ApiError && caughtError.status === 403) {
    showToast('error', 'Action not allowed', caughtError.message);
    return;
  }
  showToast('error', fallback, caughtError instanceof Error ? caughtError.message : undefined);
}

/**
 * Home-page patient queue rendered as a hospital waiting room: one seat per patient
 * still waiting (not yet in treatment), colored and pulsing by urgency so critical/
 * high cases read as "needs attention" at a glance. Starting treatment on a patient
 * clears their seat here - the full queue page (a separate view) keeps tracking them
 * from there. Selecting a seat opens an action bar to view, start treatment, notify
 * the care team, or move the patient to another department.
 */
export function WaitingRoomQueue({ activeStaff, onNavigate }: WaitingRoomQueueProps) {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [doctors, setDoctors] = useState<StaffUser[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [busyPatientId, setBusyPatientId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    try {
      const result = await getQueueEntries();
      setEntries(result);
    } catch {
      setEntries([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    void loadQueue();
  };

  useEffect(() => {
    void loadQueue();
    const intervalId = window.setInterval(() => void loadQueue(), 8_000);
    return () => window.clearInterval(intervalId);
  }, [loadQueue]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [doctorList, departmentList] = await Promise.all([
          getStaffUsers({ role: 'DOCTOR' }),
          getDepartments(),
        ]);
        if (mounted) {
          setDoctors(doctorList.filter((doctor) => doctor.active));
          setDepartments(departmentList);
        }
      } catch {
        // Move/notify pickers just show fewer options; the seat grid itself still works.
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const seated = useMemo(
    () =>
      entries
        .filter((entry) => activeStatuses.has(entry.status))
        .sort((a, b) => {
          const rank = urgencyRank[a.urgencyCategory] - urgencyRank[b.urgencyCategory];
          return rank !== 0 ? rank : b.waitingMinutes - a.waitingMinutes;
        }),
    [entries],
  );

  const emptySeatCount = Math.max(0, Math.min(6, Math.ceil((seated.length + 1) / 6) * 6 - seated.length));
  const selectedEntry = seated.find((entry) => entry.patientId === selectedPatientId) ?? null;
  const attentionCount = seated.filter((entry) => entry.urgencyCategory === 'CRITICAL' || entry.urgencyCategory === 'HIGH').length;

  const runAction = async (patientId: string, action: () => Promise<void>, successMessage: string, failureMessage: string) => {
    setBusyPatientId(patientId);
    try {
      await action();
      showToast('success', successMessage);
      await loadQueue();
    } catch (caughtError) {
      toastActionError(caughtError, failureMessage);
    } finally {
      setBusyPatientId(null);
    }
  };

  const handleStartTreatment = (entry: QueueEntry) =>
    runAction(
      entry.patientId,
      async () => {
        await updateQueueStatus(entry.patientId, {
          status: 'IN_TREATMENT',
          actorName: activeStaff?.staffCode ?? activeStaff?.displayName ?? 'Care team',
          actorRole: activeStaff?.role ?? 'TRIAGE_NURSE',
        });
      },
      `${entry.patientDisplayId} moved to treatment`,
      'Unable to start treatment',
    );

  const handleMove = (entry: QueueEntry, department: string) =>
    runAction(
      entry.patientId,
      async () => {
        await updateQueuePlacement(entry.patientId, {
          status: entry.status,
          department,
          actorName: activeStaff?.staffCode ?? activeStaff?.displayName ?? 'Care team',
          actorRole: activeStaff?.role ?? 'TRIAGE_NURSE',
        });
      },
      `${entry.patientDisplayId} moved to ${department}`,
      'Unable to move patient',
    );

  const handleNotify = (entry: QueueEntry, recipient: StaffUser, message: string) =>
    runAction(
      entry.patientId,
      async () => {
        await createNotification({
          recipientStaffLookup: recipient.staffCode || recipient.id,
          patientDisplayId: entry.patientDisplayId,
          category: 'STAFF_MESSAGE',
          title: `Attention needed: ${entry.patientDisplayId}`,
          body: message,
          agent: activeStaff?.displayName ?? activeStaff?.staffCode ?? 'Care team',
        });
      },
      `Notified ${recipient.displayName}`,
      'Unable to send notification',
    );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
            <Armchair size={18} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Waiting room</h3>
            <p className="text-xs text-slate-500">
              {seated.length} seated
              {attentionCount > 0 ? (
                <span className="font-semibold text-rose-600"> - {attentionCount} need attention</span>
              ) : (
                ' - all stable'
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Refresh waiting room"
            title="Refresh waiting room"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('queue')}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Full queue
            <MoveRight size={13} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* legend */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-500">
        <LegendDot className="bg-rose-500" label="Critical" />
        <LegendDot className="bg-amber-500" label="High" />
        <LegendDot className="bg-sky-500" label="Medium" />
        <LegendDot className="bg-emerald-500" label="Low" />
        <LegendDot className="bg-slate-200" label="Open seat" />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))
        ) : (
          <>
            {seated.map((entry) => (
              <SeatButton
                key={entry.patientId}
                entry={entry}
                selected={selectedPatientId === entry.patientId}
                onSelect={() => setSelectedPatientId((current) => (current === entry.patientId ? null : entry.patientId))}
              />
            ))}
            {Array.from({ length: emptySeatCount }).map((_, index) => (
              <div
                key={`empty-${index}`}
                className="flex h-24 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200 text-slate-300"
              >
                <Armchair size={22} aria-hidden="true" />
                <span className="text-[10px] font-medium text-slate-400">Open</span>
              </div>
            ))}
          </>
        )}
      </div>

      {!isLoading && seated.length === 0 ? (
        <div className="mt-2 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 p-6 text-center">
          <ShieldAlert size={22} className="text-emerald-400" aria-hidden="true" />
          <p className="mt-2 text-sm text-slate-500">The waiting room is empty right now.</p>
        </div>
      ) : null}

      {selectedEntry ? (
        <SeatActionBar
          key={selectedEntry.patientId}
          entry={selectedEntry}
          doctors={doctors}
          departments={departments}
          isBusy={busyPatientId === selectedEntry.patientId}
          onClose={() => setSelectedPatientId(null)}
          onView={() => {
            onNavigate('queue');
            setSelectedPatientId(null);
          }}
          onStartTreatment={() => void handleStartTreatment(selectedEntry)}
          onMove={(department) => void handleMove(selectedEntry, department)}
          onNotify={(recipient, message) => void handleNotify(selectedEntry, recipient, message)}
        />
      ) : null}
    </section>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function SeatButton({
  entry,
  selected,
  onSelect,
}: {
  entry: QueueEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const style = seatStyles[entry.urgencyCategory];
  const needsAttention = entry.urgencyCategory === 'CRITICAL' || entry.urgencyCategory === 'HIGH' || entry.staffEscalated;

  return (
    <button
      type="button"
      onClick={onSelect}
      title={`${entry.patientDisplayId} - ${entry.chiefComplaint}`}
      className={`group relative flex h-24 flex-col items-center justify-center gap-1 rounded-xl bg-white p-2 ring-1 ring-inset transition hover:-translate-y-0.5 hover:shadow-md ${style.ring} ${
        selected ? 'outline outline-2 outline-offset-2 outline-slate-950' : ''
      }`}
    >
      {needsAttention ? (
        <span className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ${style.pulse ? 'animate-pulse' : ''}`} aria-hidden="true" />
      ) : null}
      <Armchair size={26} className={`${style.seat} ${style.pulse ? 'animate-soft-pulse' : ''}`} aria-hidden="true" />
      <span className="max-w-full truncate text-[11px] font-bold text-slate-900">{entry.patientDisplayId}</span>
      <span className={`text-[10px] font-semibold ${style.label}`}>{entry.waitingMinutes}m</span>
    </button>
  );
}

interface SeatActionBarProps {
  entry: QueueEntry;
  doctors: StaffUser[];
  departments: string[];
  isBusy: boolean;
  onClose: () => void;
  onView: () => void;
  onStartTreatment: () => void;
  onMove: (department: string) => void;
  onNotify: (recipient: StaffUser, message: string) => void;
}

function SeatActionBar({ entry, doctors, departments, isBusy, onClose, onView, onStartTreatment, onMove, onNotify }: SeatActionBarProps) {
  const [mode, setMode] = useState<'idle' | 'move' | 'notify'>('idle');
  const [moveDepartment, setMoveDepartment] = useState(entry.department);
  const [recipientId, setRecipientId] = useState(entry.assignedDoctor?.id ?? '');
  const [message, setMessage] = useState(`Please review ${entry.patientDisplayId} - ${entry.chiefComplaint}`);

  const recipient = doctors.find((doctor) => doctor.id === recipientId) ?? null;

  return (
    <div className="animate-message-in mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-950">{entry.patientDisplayId}</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset ${
              entry.urgencyCategory === 'CRITICAL' ? 'bg-rose-100 text-rose-700 ring-rose-200' :
              entry.urgencyCategory === 'HIGH' ? 'bg-amber-100 text-amber-700 ring-amber-200' :
              entry.urgencyCategory === 'MEDIUM' ? 'bg-sky-100 text-sky-700 ring-sky-200' :
              'bg-emerald-100 text-emerald-700 ring-emerald-200'
            }`}>
              {entry.urgencyCategory}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-600">{entry.chiefComplaint}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1"><Clock3 size={11} aria-hidden="true" />{entry.waitingMinutes}m waiting</span>
            <span className="inline-flex items-center gap-1"><MapPin size={11} aria-hidden="true" />{entry.department}</span>
            {entry.assignedDoctor ? (
              <span className="inline-flex items-center gap-1"><Stethoscope size={11} aria-hidden="true" />{entry.assignedDoctor.displayName}</span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-white hover:text-slate-700"
          aria-label="Close seat details"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <ActionButton icon={<Stethoscope size={13} aria-hidden="true" />} label="View in queue" onClick={onView} />
        <ActionButton
          icon={isBusy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <PlayCircle size={13} aria-hidden="true" />}
          label="Start treatment"
          disabled={isBusy}
          onClick={onStartTreatment}
        />
        <ActionButton
          icon={<Bell size={13} aria-hidden="true" />}
          label="Notify care team"
          active={mode === 'notify'}
          onClick={() => setMode((current) => (current === 'notify' ? 'idle' : 'notify'))}
        />
        <ActionButton
          icon={<MoveRight size={13} aria-hidden="true" />}
          label="Move"
          active={mode === 'move'}
          onClick={() => setMode((current) => (current === 'move' ? 'idle' : 'move'))}
        />
      </div>

      {mode === 'move' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
          <select
            value={moveDepartment}
            onChange={(event) => setMoveDepartment(event.target.value)}
            className="h-8 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            {departments.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={isBusy || moveDepartment === entry.department}
            onClick={() => {
              onMove(moveDepartment);
              setMode('idle');
            }}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirm move
          </button>
        </div>
      ) : null}

      {mode === 'notify' ? (
        <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
          <select
            value={recipientId}
            onChange={(event) => setRecipientId(event.target.value)}
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">Choose a recipient...</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.displayName} - {doctor.specialty ?? doctor.department ?? 'Doctor'}
              </option>
            ))}
          </select>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={2}
            className="w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!recipient || !message.trim() || isBusy}
              onClick={() => {
                if (recipient) {
                  onNotify(recipient, message.trim());
                  setMode('idle');
                }
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Bell size={12} aria-hidden="true" />
              Send
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled = false,
  active = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
