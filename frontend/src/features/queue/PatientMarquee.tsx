import { AlertTriangle, Activity, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getQueueEntries } from '../../api/client';
import { PatientDetailDialog } from '../../components/PatientDetailDialog';
import type { QueueEntry, StaffUser, UrgencyCategory } from '../../types/careflow';

interface PatientMarqueeProps {
  refreshSignal?: number;
  activeStaff?: StaffUser | null;
  onSelectPatient?: (entry: QueueEntry) => void;
}

const urgencyRank: Record<UrgencyCategory, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const activeStatuses = new Set(['WAITING', 'IN_TRIAGE', 'IN_TREATMENT']);

// Per-urgency styling for the marquee pills against the dark bar.
const pillStyles: Record<UrgencyCategory, { dot: string; text: string; ring: string; glow: string }> = {
  CRITICAL: { dot: 'bg-rose-400', text: 'text-rose-100', ring: 'ring-rose-400/40', glow: 'shadow-[0_0_12px_rgba(244,63,94,0.35)]' },
  HIGH: { dot: 'bg-amber-300', text: 'text-amber-100', ring: 'ring-amber-300/40', glow: '' },
  MEDIUM: { dot: 'bg-sky-300', text: 'text-slate-200', ring: 'ring-white/15', glow: '' },
  LOW: { dot: 'bg-emerald-300', text: 'text-slate-200', ring: 'ring-white/15', glow: '' },
};

/**
 * A modern, always-scrolling ticker of the live patient queue pinned to the top bar.
 * Critical cases glow red, high urgency amber, everything else stays neutral. Hovering
 * pauses the scroll and each pill is clickable to jump straight to that patient.
 */
export function PatientMarquee({ refreshSignal = 0, activeStaff = null, onSelectPatient }: PatientMarqueeProps) {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [selected, setSelected] = useState<QueueEntry | null>(null);

  const load = useCallback(async () => {
    try {
      setEntries(await getQueueEntries());
    } catch {
      // Keep the last known snapshot; the ticker just holds steady on a fetch miss.
    }
  }, []);

  const handleClick = (entry: QueueEntry) => {
    if (onSelectPatient) {
      onSelectPatient(entry);
      return;
    }
    setSelected(entry);
  };

  useEffect(() => {
    void load();
    const intervalId = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(intervalId);
  }, [load, refreshSignal]);

  const activeEntries = useMemo(
    () =>
      entries
        .filter((entry) => activeStatuses.has(entry.status))
        .sort((a, b) => {
          const rank = urgencyRank[a.urgencyCategory] - urgencyRank[b.urgencyCategory];
          return rank !== 0 ? rank : b.waitingMinutes - a.waitingMinutes;
        }),
    [entries],
  );

  const criticalCount = activeEntries.filter((entry) => entry.urgencyCategory === 'CRITICAL').length;
  const highCount = activeEntries.filter((entry) => entry.urgencyCategory === 'HIGH').length;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {/* live summary badge */}
      <div className="hidden shrink-0 items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[11px] font-semibold ring-1 ring-inset ring-white/10 sm:flex">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <span className="text-slate-200">{activeEntries.length} live</span>
        {criticalCount > 0 ? <span className="text-rose-300">{criticalCount} critical</span> : null}
        {highCount > 0 ? <span className="text-amber-200">{highCount} high</span> : null}
      </div>

      {/* scrolling ticker */}
      <div className="marquee-viewport relative min-w-0 flex-1 overflow-hidden">
        {/* fade edges */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-slate-950 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-slate-950 to-transparent" />

        {activeEntries.length === 0 ? (
          <p className="flex items-center gap-2 py-1 text-xs font-medium text-slate-300">
            <ShieldCheck size={14} className="text-emerald-400" aria-hidden="true" />
            Queue clear - no active patients right now.
          </p>
        ) : (
          <div className="marquee-track gap-2 py-1">
            {[0, 1].map((copy) => (
              <div className="flex shrink-0 items-center gap-2 pr-2" key={copy} aria-hidden={copy === 1}>
                {activeEntries.map((entry) => {
                  const style = pillStyles[entry.urgencyCategory];
                  const Icon = entry.urgencyCategory === 'CRITICAL' ? AlertTriangle : Activity;
                  return (
                    <button
                      key={`${copy}-${entry.patientId}`}
                      type="button"
                      onClick={() => handleClick(entry)}
                      title={`${entry.patientDisplayId} - ${entry.chiefComplaint} - ${entry.waitingMinutes}m waiting`}
                      className={`inline-flex shrink-0 items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs ring-1 ring-inset transition hover:bg-white/12 ${style.ring} ${style.glow}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${style.dot} ${entry.urgencyCategory === 'CRITICAL' ? 'animate-pulse' : ''}`} />
                      {entry.urgencyCategory === 'CRITICAL' ? (
                        <Icon size={12} className="text-rose-300" aria-hidden="true" />
                      ) : null}
                      <span className={`font-semibold ${style.text}`}>{entry.patientDisplayId}</span>
                      <span className="max-w-[10rem] truncate text-slate-300">{entry.chiefComplaint}</span>
                      <span className="font-mono text-[10px] text-slate-400">{entry.waitingMinutes}m</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {selected ? (
        <PatientDetailDialog
          intakeId={selected.intakeId}
          patientDisplayId={selected.patientDisplayId}
          activeStaff={activeStaff}
          onChanged={() => void load()}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
