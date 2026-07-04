import { AlertCircle, RefreshCw } from 'lucide-react';
import { type DragEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { getQueueEntries, updateQueuePlacement } from '../../api/client';
import type { QueueEntry, QueueStatus } from '../../types/careflow';

const statusColumns: Array<{ status: QueueStatus; label: string }> = [
  { status: 'WAITING', label: 'Waiting' },
  { status: 'IN_TRIAGE', label: 'In triage' },
  { status: 'IN_TREATMENT', label: 'In treatment' },
  { status: 'DISCHARGED', label: 'Discharged' },
];

function formatWait(minutes: number) {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function CareBoard({ departments }: { departments: string[] }) {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState('All');
  const [draggedPatientId, setDraggedPatientId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedDepartment) {
      setSelectedDepartment('All');
    }
  }, [departments, selectedDepartment]);

  const loadEntries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setEntries(await getQueueEntries());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load board.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const visibleEntries = useMemo(
    () =>
      selectedDepartment === 'All'
        ? entries
        : entries.filter((entry) => entry.department.toLowerCase() === selectedDepartment.toLowerCase()),
    [entries, selectedDepartment],
  );

  const movePatient = async (status: QueueStatus, department: string) => {
    if (!draggedPatientId) {
      return;
    }
    setError(null);
    try {
      const draggedEntry = entries.find((entry) => entry.patientId === draggedPatientId);
      const targetDepartment = selectedDepartment === 'All'
        ? draggedEntry?.department ?? departments[0] ?? 'Emergency'
        : selectedDepartment;
      const updated = await updateQueuePlacement(draggedPatientId, {
        status,
        department: targetDepartment,
        actorName: 'Care Board',
        actorRole: 'TRIAGE_NURSE',
      });
      setEntries((current) => current.map((entry) => (entry.patientId === updated.patientId ? updated : entry)));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to move patient.');
    } finally {
      setDraggedPatientId(null);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, status: QueueStatus) => {
    event.preventDefault();
    void movePatient(status, selectedDepartment);
  };

  return (
    <section aria-labelledby="board-title" className="py-6">
      <div className="flex flex-col gap-4 border-b border-sky-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sky-700">Care board</p>
          <h2 id="board-title" className="mt-1 text-2xl font-semibold text-slate-950">
            Patient flow
          </h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={selectedDepartment}
            onChange={(event) => setSelectedDepartment(event.target.value)}
            className="h-10 rounded-md border border-sky-200 bg-white px-3 text-sm text-slate-800 shadow-sm"
          >
            <option value="All">All departments</option>
            {departments.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadEntries()}
            disabled={isLoading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-sky-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-sky-50 disabled:opacity-60"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-5 flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-4">
        {statusColumns.map((column) => {
          const columnEntries = visibleEntries.filter((entry) => entry.status === column.status);
          return (
            <div
              key={column.status}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, column.status)}
              className="min-h-96 rounded-lg border border-sky-100 bg-white p-3 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-950">{column.label}</h3>
                <span className="rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">
                  {columnEntries.length}
                </span>
              </div>

              <div className="mt-3 space-y-3">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-md bg-sky-100" />)
                ) : columnEntries.length === 0 ? (
                  <p className="rounded-md border border-dashed border-sky-200 p-4 text-center text-sm text-slate-500">
                    Drop patients here
                  </p>
                ) : (
                  columnEntries.map((entry) => (
                    <article
                      key={entry.patientId}
                      draggable
                      onDragStart={() => setDraggedPatientId(entry.patientId)}
                      className="cursor-grab rounded-md border border-sky-100 bg-sky-50 p-3 active:cursor-grabbing"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-950">{entry.patientDisplayId}</p>
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">
                          {entry.urgencyCategory}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{entry.chiefComplaint}</p>
                      <p className="mt-2 text-xs font-medium text-slate-500">
                        Score {entry.urgencyScore} - Wait {formatWait(entry.waitingMinutes)}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
