import {
  Activity,
  AlertCircle,
  BadgeAlert,
  BrainCircuit,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Download,
  Droplets,
  FileText,
  Gauge,
  HeartPulse,
  Loader2,
  MapPin,
  Pill,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  Stethoscope,
  Thermometer,
  TimerReset,
  Trash2,
  UserRoundCheck,
  UsersRound,
  Wind,
  X,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { showToast } from '../../components/toast';
import {
  ApiError,
  assignQueueDoctor,
  createThreadComment,
  generatePatientReport,
  getIntake,
  getPatientThread,
  getQueueEntries,
  getStaffUsers,
  removeQueueEntry,
  updateQueueStatus,
} from '../../api/client';
import type {
  Appointment,
  IntakeResponse,
  PatientReportResponse,
  QueueEntry,
  QueueStatus,
  StaffUser,
  ThreadComment,
  UrgencyCategory,
} from '../../types/careflow';

const urgencyStyles: Record<UrgencyCategory, string> = {
  CRITICAL: 'bg-rose-100 text-rose-900 ring-rose-200',
  HIGH: 'bg-amber-100 text-amber-800 ring-amber-200',
  MEDIUM: 'bg-sky-100 text-sky-800 ring-sky-200',
  LOW: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
};

const urgencyBoardStyles: Record<
  UrgencyCategory,
  {
    accent: string;
    bar: string;
    border: string;
    glow: string;
    soft: string;
    text: string;
  }
> = {
  CRITICAL: {
    accent: 'bg-rose-700',
    bar: 'bg-rose-600',
    border: 'border-rose-200',
    glow: 'shadow-rose-100',
    soft: 'bg-rose-50',
    text: 'text-rose-900',
  },
  HIGH: {
    accent: 'bg-amber-500',
    bar: 'bg-amber-500',
    border: 'border-amber-200',
    glow: 'shadow-amber-100',
    soft: 'bg-amber-50',
    text: 'text-amber-800',
  },
  MEDIUM: {
    accent: 'bg-indigo-500',
    bar: 'bg-indigo-500',
    border: 'border-indigo-200',
    glow: 'shadow-indigo-100',
    soft: 'bg-indigo-50',
    text: 'text-indigo-800',
  },
  LOW: {
    accent: 'bg-emerald-500',
    bar: 'bg-emerald-500',
    border: 'border-emerald-200',
    glow: 'shadow-emerald-100',
    soft: 'bg-emerald-50',
    text: 'text-emerald-800',
  },
};

const urgencyOptions: Array<{ value: UrgencyCategory; label: string }> = [
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

const statusStyles: Record<QueueStatus, string> = {
  WAITING: 'bg-amber-50 text-amber-800 ring-amber-200',
  IN_TRIAGE: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
  IN_TREATMENT: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  DISCHARGED: 'bg-slate-100 text-slate-700 ring-slate-200',
  LEFT_WITHOUT_BEING_SEEN: 'bg-rose-50 text-rose-800 ring-rose-200',
};

function toastActionError(caughtError: unknown, fallback: string) {
  if (caughtError instanceof ApiError && caughtError.status === 403) {
    showToast('error', 'Action not allowed', caughtError.message);
    return;
  }
  showToast('error', fallback, caughtError instanceof Error ? caughtError.message : undefined);
}

function formatUrgency(category: UrgencyCategory) {
  return category.charAt(0) + category.slice(1).toLowerCase();
}

function formatEnumLabel(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

function formatWaitingTime(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function waitLabel(entry: QueueEntry) {
  if (entry.waitPriorityLevel === 'OVER_TARGET') {
    return '40m+ target';
  }
  if (entry.waitPriorityLevel === 'NEAR_TARGET') {
    return '30m+ target';
  }
  return null;
}

function normalizeMatchText(value?: string | null) {
  return value?.trim().toLowerCase() ?? '';
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function inferRequiredSpecialty(entry: QueueEntry) {
  const department = normalizeMatchText(entry.department);
  const complaint = normalizeMatchText(entry.chiefComplaint);
  const context = `${department} ${complaint}`;

  if (includesAny(context, ['pediatric', 'paediatric', 'child', 'infant']) || department.includes('pediatric')) {
    return 'Pediatrics';
  }
  if (includesAny(context, ['chest', 'cardiac', 'heart', 'palpitation'])) {
    return 'Cardiology';
  }
  if (includesAny(context, ['breath', 'asthma', 'oxygen', 'spo2', 'respiratory', 'wheez'])) {
    return 'Pulmonology';
  }
  if (includesAny(context, ['fracture', 'fall', 'trauma', 'sprain', 'orthopedic', 'bone'])) {
    return 'Orthopedics';
  }
  if (includesAny(context, ['pregnan', 'obstetric', 'labor', 'gyn'])) {
    return 'Obstetrics';
  }
  if (includesAny(context, ['stroke', 'seizure', 'altered mental', 'confusion', 'head injury', 'neurolog'])) {
    return 'Neurology';
  }
  if (includesAny(context, ['bleed', 'laceration', 'wound', 'burn'])) {
    return 'Emergency Medicine';
  }
  if (department.includes('emergency') || entry.urgencyCategory === 'CRITICAL' || entry.urgencyCategory === 'HIGH') {
    return 'Emergency Medicine';
  }

  return 'General Medicine';
}

function doctorMatchScore(doctor: StaffUser, entry: QueueEntry, requiredSpecialty: string) {
  const specialty = normalizeMatchText(doctor.specialty);
  const department = normalizeMatchText(doctor.department);
  const required = normalizeMatchText(requiredSpecialty);
  const patientDepartment = normalizeMatchText(entry.department);

  if (specialty && (specialty.includes(required) || required.includes(specialty))) {
    return 100;
  }
  if (required === 'pediatrics' && (specialty.includes('pediatric') || department.includes('pediatric'))) {
    return 95;
  }
  if (required === 'emergency medicine' && specialty.includes('emergency')) {
    return 90;
  }
  if (department && patientDepartment && department === patientDepartment && specialty.includes('emergency')) {
    return 70;
  }
  if (department && patientDepartment && department === patientDepartment && required === 'general medicine') {
    return 60;
  }

  return 0;
}

function assignmentReason(doctor: StaffUser, entry: QueueEntry, requiredSpecialty: string, manuallyAssigned: boolean) {
  if (manuallyAssigned) {
    return 'Manual override';
  }

  const specialty = doctor.specialty ?? doctor.department ?? 'Available doctor';
  if (normalizeMatchText(specialty).includes(normalizeMatchText(requiredSpecialty))) {
    return `${requiredSpecialty} specialty match`;
  }
  if (normalizeMatchText(doctor.department) === normalizeMatchText(entry.department)) {
    return `${entry.department} department match`;
  }
  return `${specialty} coverage`;
}

interface DoctorAssignment {
  doctor: StaffUser | null;
  entry: QueueEntry;
  manuallyAssigned: boolean;
  overrideDoctorId?: string;
  reason: string;
  requiredSpecialty: string;
}

function assignDoctorsToPatients(entries: QueueEntry[], doctors: StaffUser[], overrides: Record<string, string>) {
  const activeDoctors = doctors.filter((doctor) => doctor.active);
  const usedDoctorIds = new Set<string>();
  const assigned: DoctorAssignment[] = [];
  const queued: DoctorAssignment[] = [];

  entries.forEach((entry) => {
    const requiredSpecialty = inferRequiredSpecialty(entry);
    if (entry.assignedDoctor) {
      const assignedDoctor =
        activeDoctors.find((doctor) => doctor.id === entry.assignedDoctor?.id) ?? {
          id: entry.assignedDoctor.id,
          staffCode: entry.assignedDoctor.staffCode,
          displayName: entry.assignedDoctor.displayName,
          role: 'DOCTOR' as const,
          department: entry.assignedDoctor.department,
          specialty: entry.assignedDoctor.specialty,
          active: true,
        };
      usedDoctorIds.add(assignedDoctor.id);
      assigned.push({
        doctor: assignedDoctor,
        entry,
        manuallyAssigned: false,
        overrideDoctorId: assignedDoctor.id,
        reason: entry.assignedDoctor.assignmentReason,
        requiredSpecialty,
      });
      return;
    }

    const overrideDoctor = activeDoctors.find((doctor) => doctor.id === overrides[entry.patientId]);

    if (overrideDoctor && !usedDoctorIds.has(overrideDoctor.id)) {
      usedDoctorIds.add(overrideDoctor.id);
      assigned.push({
        doctor: overrideDoctor,
        entry,
        manuallyAssigned: true,
        overrideDoctorId: overrideDoctor.id,
        reason: assignmentReason(overrideDoctor, entry, requiredSpecialty, true),
        requiredSpecialty,
      });
      return;
    }

    if (overrideDoctor && usedDoctorIds.has(overrideDoctor.id)) {
      queued.push({
        doctor: null,
        entry,
        manuallyAssigned: true,
        overrideDoctorId: overrideDoctor.id,
        reason: `${overrideDoctor.displayName} is already engaged`,
        requiredSpecialty,
      });
      return;
    }

    const bestMatch = activeDoctors
      .filter((doctor) => !usedDoctorIds.has(doctor.id))
      .map((doctor) => ({
        doctor,
        score: doctorMatchScore(doctor, entry, requiredSpecialty),
      }))
      .filter((match) => match.score > 0)
      .sort((first, second) => second.score - first.score || first.doctor.displayName.localeCompare(second.doctor.displayName))[0];

    if (bestMatch) {
      usedDoctorIds.add(bestMatch.doctor.id);
      assigned.push({
        doctor: bestMatch.doctor,
        entry,
        manuallyAssigned: false,
        overrideDoctorId: overrides[entry.patientId],
        reason: assignmentReason(bestMatch.doctor, entry, requiredSpecialty, false),
        requiredSpecialty,
      });
      return;
    }

    queued.push({
      doctor: null,
      entry,
      manuallyAssigned: false,
      overrideDoctorId: overrides[entry.patientId],
      reason: `Needs ${requiredSpecialty}`,
      requiredSpecialty,
    });
  });

  return { assigned, queued };
}

interface QueueTableProps {
  refreshSignal?: number;
  searchQuery: string;
  activeStaff: StaffUser | null;
  onAppointmentSaved?: (appointment: Appointment) => void;
  onStatusUpdated?: () => void;
}

export function QueueTable({ refreshSignal = 0, searchQuery, activeStaff, onAppointmentSaved, onStatusUpdated }: QueueTableProps) {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [doctors, setDoctors] = useState<StaffUser[]>([]);
  const [doctorOverrides, setDoctorOverrides] = useState<Record<string, string>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Set<UrgencyCategory>>(new Set());
  const [updatingPatientId, setUpdatingPatientId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIntake, setSelectedIntake] = useState<IntakeResponse | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setEntries(await getQueueEntries());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load queue.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadDoctors() {
      try {
        const fetchedDoctors = await getStaffUsers({ role: 'DOCTOR' });
        if (isMounted) {
          setDoctors(fetchedDoctors.filter((doctor) => doctor.active));
        }
      } catch {
        if (isMounted) {
          setDoctors([]);
        }
      }
    }

    void loadDoctors();
    return () => {
      isMounted = false;
    };
  }, []);

  const visibleEntries = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    if (normalizedSearch.length === 0) {
      return entries;
    }
    return entries.filter((entry) =>
      [
        entry.patientDisplayId,
        entry.chiefComplaint,
        entry.department,
        entry.status,
        entry.urgencyCategory,
        entry.assignedDoctor?.displayName ?? '',
      ].some((value) => value.toLowerCase().includes(normalizedSearch)),
    );
  }, [entries, searchQuery]);

  const waitingEntries = useMemo(
    () => entries.filter((entry) => entry.status === 'WAITING' || entry.status === 'IN_TRIAGE'),
    [entries],
  );
  const currentPatient = waitingEntries[0] ?? null;
  const overdueEntries = useMemo(
    () => waitingEntries.filter((entry) => entry.waitThresholdExceeded),
    [waitingEntries],
  );
  const engagedEntries = useMemo(
    () => entries.filter((entry) => entry.status !== 'DISCHARGED' && entry.status !== 'LEFT_WITHOUT_BEING_SEEN'),
    [entries],
  );
  const groupedEntries = useMemo(
    () =>
      urgencyOptions.map((option) => ({
        ...option,
        entries: visibleEntries.filter((entry) => entry.urgencyCategory === option.value),
      })),
    [visibleEntries],
  );

  useEffect(() => {
    void loadQueue();
  }, [loadQueue, refreshSignal]);

  const handleStatusChange = async (entry: QueueEntry, status: QueueStatus) => {
    if (entry.status === status) {
      return;
    }

    setUpdatingPatientId(entry.patientId);
    setError(null);

    try {
      const updated = await updateQueueStatus(entry.patientId, {
        status,
        actorName: activeStaff?.staffCode ?? activeStaff?.displayName ?? 'Demo Triage',
        actorRole: activeStaff?.role ?? 'TRIAGE_NURSE',
      });
      setEntries((current) => current.map((item) => (item.patientId === updated.patientId ? updated : item)));
      if (status === 'DISCHARGED' || status === 'LEFT_WITHOUT_BEING_SEEN') {
        setDoctorOverrides((current) => {
          const next = { ...current };
          delete next[entry.patientId];
          return next;
        });
      }
      onStatusUpdated?.();
      showToast('success', `${entry.patientDisplayId} moved to ${formatEnumLabel(status)}`);
    } catch (caughtError) {
      toastActionError(caughtError, 'Unable to update queue status');
    } finally {
      setUpdatingPatientId(null);
    }
  };

  const handleAssignDoctor = async (entry: QueueEntry, doctorId: string) => {
    if (!doctorId || entry.assignedDoctor?.id === doctorId) {
      return;
    }

    setUpdatingPatientId(entry.patientId);
    setError(null);

    try {
      const updated = await assignQueueDoctor(entry.patientId, {
        doctorLookup: doctorId,
        actorName: activeStaff?.staffCode ?? activeStaff?.displayName ?? 'Care team',
        actorRole: activeStaff?.role ?? 'TRIAGE_NURSE',
        note: 'Manual queue assignment from patient queue.',
      });
      setEntries((current) => current.map((item) => (item.patientId === updated.patientId ? updated : item)));
      onStatusUpdated?.();
      showToast('success', `Doctor assigned to ${entry.patientDisplayId}`);
    } catch (caughtError) {
      toastActionError(caughtError, 'Unable to assign doctor');
    } finally {
      setUpdatingPatientId(null);
    }
  };

  const handleAssignDoctorFromIntake = async (intake: IntakeResponse, doctorId: string) => {
    const entry = entries.find((item) => item.patientId === intake.patientId);
    if (!entry) {
      throw new Error('Patient is not in the active queue.');
    }
    await handleAssignDoctor(entry, doctorId);
  };

  const handleStatusChangeFromIntake = async (intake: IntakeResponse, status: QueueStatus) => {
    const entry = entries.find((item) => item.patientId === intake.patientId);
    if (!entry) {
      throw new Error('Patient is not in the active queue.');
    }
    await handleStatusChange(entry, status);
    setSelectedIntake((current) => current && current.intakeId === intake.intakeId ? { ...current, currentStatus: status } : current);
  };

  const handleRemoveFromQueue = async (entry: QueueEntry) => {
    setUpdatingPatientId(entry.patientId);
    setError(null);

    try {
      await removeQueueEntry(entry.patientId, {
        actorName: activeStaff?.staffCode ?? activeStaff?.displayName ?? 'Care team',
        actorRole: activeStaff?.role ?? 'TRIAGE_NURSE',
        reason: 'Removed from queue by staff.',
      });
      setEntries((current) => current.filter((item) => item.patientId !== entry.patientId));
      onStatusUpdated?.();
      showToast('info', `${entry.patientDisplayId} removed from the queue`);
    } catch (caughtError) {
      toastActionError(caughtError, 'Unable to remove patient from queue');
    } finally {
      setUpdatingPatientId(null);
    }
  };

  const openIntakeDetail = async (entry: QueueEntry) => {
    setSelectedIntake(null);
    setDetailError(null);
    setIsDetailLoading(true);

    try {
      setSelectedIntake(await getIntake(entry.intakeId));
    } catch (caughtError) {
      setDetailError(caughtError instanceof Error ? caughtError.message : 'Unable to load intake details.');
    } finally {
      setIsDetailLoading(false);
    }
  };

  return (
    <section aria-labelledby="queue-title" className="py-6">
      <div className="flex flex-col gap-4 border-b border-sky-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sky-700">Patient queue</p>
          <h2 id="queue-title" className="mt-1 text-2xl font-semibold text-slate-950">
            Treatment priority
          </h2>
        </div>

        <button
          type="button"
          onClick={() => void loadQueue()}
          disabled={isLoading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-sky-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mt-5 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : null}

      <QueueCommandCenter
        currentPatient={currentPatient}
        doctors={doctors}
        doctorOverrides={doctorOverrides}
        engagedEntries={engagedEntries}
        overdueEntries={overdueEntries}
        totalPatients={entries.length}
        updatingPatientId={updatingPatientId}
        waitingCount={waitingEntries.length}
        onDoctorOverrideChange={(patientId, doctorId) => {
          const entry = entries.find((item) => item.patientId === patientId);
          if (entry) {
            void handleAssignDoctor(entry, doctorId);
          }
        }}
        onOpenEntry={openIntakeDetail}
        onStatusChange={handleStatusChange}
      />

      <div className="mt-5">
        {isLoading ? (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-80 animate-pulse rounded-lg border border-sky-100 bg-white shadow-sm" />
            ))}
          </div>
        ) : visibleEntries.length === 0 ? (
          <div className="rounded-lg border border-sky-100 bg-white px-4 py-12 text-center text-slate-500 shadow-sm">
            No patients are currently waiting in the treatment queue.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            {groupedEntries.map((group) => {
              const isCollapsed = collapsedGroups.has(group.value);
              return (
                <section key={group.value} className={`min-w-0 self-start rounded-lg border ${urgencyBoardStyles[group.value].border} ${urgencyBoardStyles[group.value].soft} p-3`}>
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedGroups((current) => {
                        const next = new Set(current);
                        if (next.has(group.value)) {
                          next.delete(group.value);
                        } else {
                          next.add(group.value);
                        }
                        return next;
                      })
                    }
                    className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-0.5 transition hover:bg-white/60"
                    aria-expanded={!isCollapsed}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`h-3 w-3 rounded-full ${urgencyBoardStyles[group.value].accent}`} />
                      <span className={`text-sm font-semibold ${urgencyBoardStyles[group.value].text}`}>
                        {group.label}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
                        {group.entries.length}
                      </span>
                      <ChevronDown
                        size={15}
                        aria-hidden="true"
                        className={`text-slate-500 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                      />
                    </span>
                  </button>

                  {!isCollapsed ? (
                    <div className="scrollbar-hide mt-3 max-h-[42rem] space-y-3 overflow-y-auto">
                      {group.entries.length === 0 ? (
                        <div className="rounded-md border border-dashed border-slate-200 bg-white/70 px-3 py-8 text-center text-sm text-slate-500">
                          No {group.label.toLowerCase()} cases
                        </div>
                      ) : (
                        group.entries.map((entry) => (
                          <PatientTriageCard
                            key={entry.patientId}
                            entry={entry}
                            updatingPatientId={updatingPatientId}
                            doctors={doctors}
                            onAssignDoctor={handleAssignDoctor}
                            onOpenEntry={openIntakeDetail}
                            onRemoveFromQueue={handleRemoveFromQueue}
                            onStatusChange={handleStatusChange}
                          />
                        ))
                      )}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {isDetailLoading || selectedIntake || detailError ? (
        <IntakeDetailDialog
          intake={selectedIntake}
          isLoading={isDetailLoading}
          error={detailError}
          activeStaff={activeStaff}
          doctors={doctors}
          onAppointmentSaved={onAppointmentSaved}
          onAssignDoctor={handleAssignDoctorFromIntake}
          onClose={() => {
            setSelectedIntake(null);
            setDetailError(null);
            setIsDetailLoading(false);
          }}
          onStatusChange={handleStatusChangeFromIntake}
        />
      ) : null}
    </section>
  );
}

interface QueueCommandCenterProps {
  currentPatient: QueueEntry | null;
  doctors: StaffUser[];
  doctorOverrides: Record<string, string>;
  engagedEntries: QueueEntry[];
  overdueEntries: QueueEntry[];
  totalPatients: number;
  updatingPatientId: string | null;
  waitingCount: number;
  onDoctorOverrideChange: (patientId: string, doctorId: string) => void;
  onOpenEntry: (entry: QueueEntry) => void;
  onStatusChange: (entry: QueueEntry, status: QueueStatus) => Promise<void>;
}

function QueueCommandCenter({
  currentPatient,
  doctors,
  doctorOverrides,
  engagedEntries,
  overdueEntries,
  totalPatients,
  updatingPatientId,
  waitingCount,
  onDoctorOverrideChange,
  onOpenEntry,
  onStatusChange,
}: QueueCommandCenterProps) {
  const queuePressure = Math.min(100, Math.round((waitingCount / Math.max(totalPatients, 1)) * 100));
  const doctorAssignments = useMemo(
    () => assignDoctorsToPatients(engagedEntries, doctors, doctorOverrides),
    [doctorOverrides, doctors, engagedEntries],
  );

  return (
    <div className="mt-5 grid gap-4 xl:grid-cols-[1.4fr_0.95fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-600">Queue meter</p>
                <p className="mt-2 text-4xl font-semibold text-slate-950">{waitingCount}</p>
                <p className="mt-1 text-sm text-slate-500">patients waiting</p>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-slate-950 text-white">
                <UsersRound size={20} aria-hidden="true" />
              </span>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-white ring-1 ring-inset ring-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500 transition-all"
                style={{ width: `${queuePressure}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Active wait</span>
              <span>{totalPatients} total tracked</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => currentPatient ? onOpenEntry(currentPatient) : undefined}
            disabled={!currentPatient}
            className="rounded-md border border-indigo-200 bg-indigo-50 p-4 text-left shadow-sm transition hover:border-indigo-300 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-indigo-700">Current patient</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {currentPatient?.patientDisplayId ?? 'No active queue'}
                </p>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-indigo-600 text-white">
                <UserRoundCheck size={20} aria-hidden="true" />
              </span>
            </div>
            {currentPatient ? (
              <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                <span className="inline-flex items-center gap-1.5">
                  <Activity size={15} aria-hidden="true" />
                  {formatUrgency(currentPatient.urgencyCategory)} {currentPatient.urgencyScore}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 size={15} aria-hidden="true" />
                  {formatWaitingTime(currentPatient.waitingMinutes)}
                </span>
                <span className="inline-flex items-center gap-1.5 sm:col-span-2">
                  <MapPin size={15} aria-hidden="true" />
                  {currentPatient.department}
                </span>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">The active queue is clear.</p>
            )}
          </button>
        </div>

        {overdueEntries.length > 0 ? (
          <div className="mt-4 min-w-0 rounded-md border border-rose-200 bg-rose-50 p-3 sm:p-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-rose-700 text-white">
                <BadgeAlert size={19} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-rose-900">Waiting time alert</h3>
                <p className="mt-1 text-sm text-rose-800">
                  {overdueEntries.length} patient{overdueEntries.length === 1 ? '' : 's'} past target on the home queue.
                </p>
              </div>
            </div>
            <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {overdueEntries.slice(0, 6).map((entry) => (
                <div key={entry.patientId} className="min-w-0 rounded-md bg-white p-3 shadow-sm ring-1 ring-inset ring-rose-100">
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar name={entry.patientDisplayId} kind="patient" size="sm" />
                    <button
                      type="button"
                      onClick={() => onOpenEntry(entry)}
                      className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-slate-950 hover:text-rose-700"
                    >
                      {entry.patientDisplayId}
                    </button>
                    <span className="shrink-0 text-xs font-semibold text-rose-700">{formatWaitingTime(entry.waitingMinutes)}</span>
                  </div>
                  <p className="mt-1.5 break-words text-xs leading-4 text-slate-500">{entry.chiefComplaint}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="flex max-h-[38rem] min-w-0 flex-col overflow-hidden rounded-lg border border-emerald-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white">
              <Stethoscope size={19} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-950">Engaged doctors</h3>
              <p className="truncate text-xs text-slate-500">
                {doctorAssignments.assigned.length} assigned, {doctorAssignments.queued.length} queued
              </p>
            </div>
          </div>
        </div>

        <div className="scrollbar-hide mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {engagedEntries.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">
              No doctors engaged right now.
            </div>
          ) : (
            <>
              {doctorAssignments.assigned.map((assignment) => (
                <DoctorAssignmentCard
                  key={assignment.entry.patientId}
                  assignment={assignment}
                  doctors={doctors}
                  updatingPatientId={updatingPatientId}
                  onDoctorOverrideChange={onDoctorOverrideChange}
                  onOpenEntry={onOpenEntry}
                  onStatusChange={onStatusChange}
                />
              ))}

              {doctorAssignments.queued.length > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-amber-900">Doctor queue</h4>
                      <p className="mt-1 text-xs text-amber-800">No matching active specialty is free yet.</p>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                      {doctorAssignments.queued.length}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {doctorAssignments.queued.map((assignment) => (
                      <DoctorAssignmentCard
                        key={assignment.entry.patientId}
                        assignment={assignment}
                        doctors={doctors}
                        updatingPatientId={updatingPatientId}
                        onDoctorOverrideChange={onDoctorOverrideChange}
                        onOpenEntry={onOpenEntry}
                        onStatusChange={onStatusChange}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

interface DoctorAssignmentCardProps {
  assignment: DoctorAssignment;
  doctors: StaffUser[];
  updatingPatientId: string | null;
  onDoctorOverrideChange: (patientId: string, doctorId: string) => void;
  onOpenEntry: (entry: QueueEntry) => void;
  onStatusChange: (entry: QueueEntry, status: QueueStatus) => Promise<void>;
}

function DoctorAssignmentCard({
  assignment,
  doctors,
  updatingPatientId,
  onDoctorOverrideChange,
  onOpenEntry,
  onStatusChange,
}: DoctorAssignmentCardProps) {
  const activeDoctors = doctors
    .filter((doctor) => doctor.active)
    .sort((first, second) => first.displayName.localeCompare(second.displayName));
  const isAssigned = Boolean(assignment.doctor);
  const selectedDoctorId = assignment.overrideDoctorId ?? assignment.doctor?.id ?? '';
  const entry = assignment.entry;

  return (
    <article className={`rounded-md border p-3 ${isAssigned ? 'border-emerald-100 bg-emerald-50' : 'border-amber-100 bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={assignment.doctor?.displayName ?? 'Awaiting specialist'} kind="doctor" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">
              {assignment.doctor?.displayName ?? 'Awaiting specialist'}
            </p>
            <p className="mt-1 truncate text-xs text-slate-500">
              {assignment.doctor?.specialty ?? assignment.requiredSpecialty}
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${
            assignment.manuallyAssigned
              ? 'bg-indigo-50 text-indigo-800 ring-indigo-200'
              : isAssigned
                ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                : 'bg-amber-50 text-amber-800 ring-amber-200'
          }`}
        >
          {assignment.manuallyAssigned ? 'Override' : isAssigned ? 'Matched' : 'Queued'}
        </span>
      </div>

      <div className="mt-3 rounded-md bg-white p-3 ring-1 ring-inset ring-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onOpenEntry(entry)}
              className="truncate text-left text-sm font-semibold text-slate-950 hover:text-emerald-700"
            >
              {entry.patientDisplayId}
            </button>
            <p className="mt-1 line-clamp-2 text-xs text-slate-500">{entry.chiefComplaint}</p>
          </div>
          <StatusPill status={entry.status} />
        </div>
        <p className="mt-2 text-xs font-medium text-slate-500">
          Needs {assignment.requiredSpecialty} - {assignment.reason}
        </p>
      </div>

      <label className="mt-3 block text-xs font-semibold text-slate-600">
        Manual doctor override
        <select
          value={selectedDoctorId}
          onChange={(event) => onDoctorOverrideChange(entry.patientId, event.target.value)}
          className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          aria-label={`Manual doctor override for ${entry.patientDisplayId}`}
        >
          <option value="">{isAssigned ? 'Use specialty match' : 'Select doctor'}</option>
          {activeDoctors.map((doctor) => (
            <option key={doctor.id} value={doctor.id}>
              {doctor.displayName} - {doctor.specialty ?? doctor.department ?? 'No specialty'}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => void onStatusChange(entry, 'DISCHARGED')}
        disabled={!isAssigned || updatingPatientId === entry.patientId}
        className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CheckCircle2 size={15} aria-hidden="true" />
        Treatment done
      </button>
    </article>
  );
}

interface PatientTriageCardProps {
  entry: QueueEntry;
  doctors: StaffUser[];
  updatingPatientId: string | null;
  onAssignDoctor: (entry: QueueEntry, doctorId: string) => Promise<void>;
  onOpenEntry: (entry: QueueEntry) => void;
  onRemoveFromQueue: (entry: QueueEntry) => Promise<void>;
  onStatusChange: (entry: QueueEntry, status: QueueStatus) => Promise<void>;
}

function PatientTriageCard({
  entry,
  doctors,
  updatingPatientId,
  onAssignDoctor,
  onOpenEntry,
  onRemoveFromQueue,
  onStatusChange,
}: PatientTriageCardProps) {
  const tone = urgencyBoardStyles[entry.urgencyCategory];
  const isClosed = entry.status === 'DISCHARGED' || entry.status === 'LEFT_WITHOUT_BEING_SEEN';
  const canStart = entry.status !== 'IN_TREATMENT' && !isClosed;
  const isUpdating = updatingPatientId === entry.patientId;
  const activeDoctors = doctors
    .filter((doctor) => doctor.active)
    .sort((first, second) => first.displayName.localeCompare(second.displayName));

  return (
    <article
      onClick={() => onOpenEntry(entry)}
      className={`cursor-pointer rounded-lg border ${tone.border} bg-white p-3 shadow-sm ${tone.glow} transition hover:-translate-y-0.5 hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Avatar name={entry.patientDisplayId} kind="patient" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {entry.staffEscalated ? <ShieldAlert size={15} className="shrink-0 text-rose-700" aria-label="Staff escalated" /> : null}
              <h4 className="truncate text-sm font-semibold text-slate-950">{entry.patientDisplayId}</h4>
            </div>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">{entry.chiefComplaint}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${urgencyStyles[entry.urgencyCategory]}`}>
          {entry.urgencyScore}
        </span>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs font-medium text-slate-500">
          <span>{formatUrgency(entry.urgencyCategory)}</span>
          <span>{entry.urgencyScore}/100</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(6, entry.urgencyScore)}%` }} />
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <Clock3 size={14} aria-hidden="true" />
          {formatWaitingTime(entry.waitingMinutes)}
          {waitLabel(entry) ? <span className="font-semibold text-amber-700">{waitLabel(entry)}</span> : null}
        </span>
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <MapPin size={14} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{entry.department}</span>
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusPill status={entry.status} />
        {entry.assignedDoctor ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-100">
            <Stethoscope size={13} aria-hidden="true" />
            {entry.assignedDoctor.displayName}
          </span>
        ) : null}
        {entry.waitThresholdExceeded ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-100">
            <TimerReset size={13} aria-hidden="true" />
            Over target
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2" onClick={(event) => event.stopPropagation()}>
        <select
          value={entry.assignedDoctor?.id ?? ''}
          disabled={isUpdating}
          onChange={(event) => void onAssignDoctor(entry, event.target.value)}
          className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={`Assign doctor for ${entry.patientDisplayId}`}
        >
          <option value="">Assign doctor</option>
          {activeDoctors.map((doctor) => (
            <option key={doctor.id} value={doctor.id}>
              {doctor.displayName} - {doctor.specialty ?? doctor.department ?? 'General'}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-5 gap-2">
          <IconStatusButton
            label="Triage"
            disabled={entry.status === 'IN_TRIAGE' || isClosed || isUpdating}
            onClick={() => void onStatusChange(entry, 'IN_TRIAGE')}
            icon={<ClipboardCheck size={15} aria-hidden="true" />}
          />
          <button
            type="button"
            onClick={() => void onStatusChange(entry, 'IN_TREATMENT')}
            disabled={!canStart || isUpdating}
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            title="Start treatment"
          >
            <PlayCircle size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void onStatusChange(entry, 'DISCHARGED')}
            disabled={entry.status !== 'IN_TREATMENT' || isUpdating}
            className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-700 text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            title="Discharge"
          >
            <CheckCircle2 size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void onOpenEntry(entry)}
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-800 shadow-sm transition hover:bg-slate-50"
            title="Open patient"
          >
            <FileText size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void onRemoveFromQueue(entry)}
            disabled={isUpdating}
            className="inline-flex h-9 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            title="Remove from queue"
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}

function IconStatusButton({
  label,
  disabled,
  icon,
  onClick,
}: {
  label: string;
  disabled: boolean;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}

function StatusPill({ status }: { status: QueueStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[status]}`}>
      {formatEnumLabel(status)}
    </span>
  );
}

function formatValue(value: string | number | undefined | null) {
  if (value === undefined || value === null || value === '') {
    return 'Not recorded';
  }
  return String(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function activeRiskFlags(intake: IntakeResponse) {
  return Object.entries(intake.riskFlags)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key.replace(/([A-Z])/g, ' $1').toLowerCase());
}

interface IntakeDetailDialogProps {
  intake: IntakeResponse | null;
  isLoading: boolean;
  error: string | null;
  activeStaff: StaffUser | null;
  doctors: StaffUser[];
  onAppointmentSaved?: (appointment: Appointment) => void;
  onAssignDoctor: (intake: IntakeResponse, doctorId: string) => Promise<void>;
  onClose: () => void;
  onStatusChange: (intake: IntakeResponse, status: QueueStatus) => Promise<void>;
}

function IntakeDetailDialog({
  intake,
  isLoading,
  error,
  activeStaff,
  doctors,
  onAppointmentSaved,
  onAssignDoctor,
  onClose,
  onStatusChange,
}: IntakeDetailDialogProps) {
  const [thread, setThread] = useState<ThreadComment[]>([]);
  const [authorName, setAuthorName] = useState('Care team');
  const [commentBody, setCommentBody] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [appointmentNote, setAppointmentNote] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [patientReport, setPatientReport] = useState<PatientReportResponse | null>(null);
  const [prescriptionDraft, setPrescriptionDraft] = useState('');
  const [threadError, setThreadError] = useState<string | null>(null);
  const [isThreadLoading, setIsThreadLoading] = useState(false);
  const [isAssigningDoctor, setIsAssigningDoctor] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isSavingAppointment, setIsSavingAppointment] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);

  const loadThread = useCallback(async () => {
    if (!intake) {
      return;
    }
    setIsThreadLoading(true);
    setThreadError(null);
    try {
      setThread(await getPatientThread(intake.patientId));
    } catch (caughtError) {
      setThreadError(caughtError instanceof Error ? caughtError.message : 'Unable to load thread.');
    } finally {
      setIsThreadLoading(false);
    }
  }, [intake]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  useEffect(() => {
    setSelectedDoctorId('');
    setPatientReport(null);
    setPrescriptionDraft('');
    setAppointmentTime('');
    setAppointmentNote('');
    setIsScheduleOpen(false);
  }, [intake?.intakeId]);

  const submitComment = async () => {
    if (!intake || commentBody.trim().length === 0) {
      return;
    }
    setThreadError(null);
    try {
      await createThreadComment(intake.intakeId, {
        authorName,
        body: commentBody,
        attachments:
          attachmentName.trim() && attachmentUrl.trim()
            ? [{ fileName: attachmentName.trim(), url: attachmentUrl.trim() }]
            : [],
      });
      setCommentBody('');
      setAttachmentName('');
      setAttachmentUrl('');
      await loadThread();
    } catch (caughtError) {
      setThreadError(caughtError instanceof Error ? caughtError.message : 'Unable to add comment.');
    }
  };

  const assignDoctor = async () => {
    if (!intake || !selectedDoctorId) {
      return;
    }
    setIsAssigningDoctor(true);
    setThreadError(null);
    try {
      await onAssignDoctor(intake, selectedDoctorId);
      await loadThread();
    } catch (caughtError) {
      setThreadError(caughtError instanceof Error ? caughtError.message : 'Unable to assign doctor.');
    } finally {
      setIsAssigningDoctor(false);
    }
  };

  const saveAppointment = async () => {
    if (!intake || !appointmentTime) {
      return;
    }
    setIsSavingAppointment(true);
    setThreadError(null);
    const appointment: Appointment = {
      id: `${intake.intakeId}-${Date.now()}`,
      patientId: intake.patientId,
      intakeId: intake.intakeId,
      patientDisplayId: intake.patientDisplayId,
      department: intake.department,
      startsAt: new Date(appointmentTime).toISOString(),
      note: appointmentNote.trim() || 'Follow-up visit',
    };
    try {
      onAppointmentSaved?.(appointment);
      await createThreadComment(intake.intakeId, {
        authorName: activeStaff?.displayName ?? 'Care team',
        body: `Next visit scheduled for ${formatDateTime(appointment.startsAt)}. ${appointment.note}`,
        attachments: [],
      });
      setAppointmentTime('');
      setAppointmentNote('');
      setIsScheduleOpen(false);
      showToast('success', 'Visit scheduled', `Next visit saved for ${intake.patientDisplayId}.`);
      await loadThread();
    } catch (caughtError) {
      setThreadError(caughtError instanceof Error ? caughtError.message : 'Unable to save appointment.');
    } finally {
      setIsSavingAppointment(false);
    }
  };

  const createReport = async () => {
    if (!intake) {
      return;
    }
    setIsGeneratingReport(true);
    setThreadError(null);
    try {
      setPatientReport(await generatePatientReport(intake.intakeId));
    } catch (caughtError) {
      setThreadError(caughtError instanceof Error ? caughtError.message : 'Unable to generate report.');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const generatePrescriptionDraft = () => {
    if (!intake) {
      return;
    }
    setPrescriptionDraft(
      [
        `Prescription draft for ${intake.patientDisplayId}`,
        `Complaint: ${intake.chiefComplaint}`,
        `Urgency: ${intake.assessment ? `${intake.assessment.finalCategory} ${intake.assessment.finalScore}` : 'Not assessed'}`,
        'Medication/orders: Clinician to complete after examination.',
        'Follow-up: Add next visit date and safety-net instructions before signing.',
      ].join('\n'),
    );
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true">
      <div className="mx-auto flex h-full max-w-6xl min-w-0 flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-sky-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={intake?.patientDisplayId ?? 'Patient'} kind="patient" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-slate-950">
                  {intake ? intake.patientDisplayId : 'Loading patient'}
                </h2>
                {intake?.assessment ? (
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${urgencyStyles[intake.assessment.finalCategory]}`}>
                    {formatEnumLabel(intake.assessment.finalCategory)} {intake.assessment.finalScore}
                  </span>
                ) : null}
                {intake ? (
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${statusStyles[intake.currentStatus]}`}>
                    {formatEnumLabel(intake.currentStatus)}
                  </span>
                ) : null}
              </div>
              {intake ? (
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {formatEnumLabel(intake.ageBand)} · {formatEnumLabel(intake.arrivalMode)} · {intake.department} · arrived {formatDateTime(intake.arrivalTimestamp)}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-sky-200 bg-white text-slate-800 transition hover:bg-sky-50"
            aria-label="Close intake details"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="h-64 animate-pulse rounded-lg bg-sky-100" />
          ) : error ? (
            <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p>{error}</p>
            </div>
          ) : intake ? (
            <div className="space-y-4">
              {/* Action toolbar: everything staff can do from here */}
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <select
                  value={selectedDoctorId}
                  onChange={(event) => setSelectedDoctorId(event.target.value)}
                  className="input-field mt-0 h-9 w-56 max-w-full text-xs"
                  aria-label="Assign doctor"
                >
                  <option value="">Assign doctor...</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.displayName} - {doctor.specialty ?? doctor.department ?? 'General'}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void assignDoctor()}
                  disabled={!selectedDoctorId || isAssigningDoctor}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isAssigningDoctor ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Stethoscope size={14} aria-hidden="true" />}
                  Assign
                </button>
                <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />
                <WorkflowButton icon={<CalendarPlus size={14} aria-hidden="true" />} onClick={() => setIsScheduleOpen(true)}>
                  Schedule visit
                </WorkflowButton>
                <WorkflowButton icon={<FileText size={14} aria-hidden="true" />} disabled={isGeneratingReport} onClick={() => void createReport()}>
                  {isGeneratingReport ? 'Generating...' : 'Report'}
                </WorkflowButton>
                <WorkflowButton icon={<Pill size={14} aria-hidden="true" />} onClick={generatePrescriptionDraft}>
                  Prescription
                </WorkflowButton>
                <WorkflowButton icon={<PlayCircle size={14} aria-hidden="true" />} onClick={() => void onStatusChange(intake, 'IN_TREATMENT')}>
                  Start treatment
                </WorkflowButton>
              </div>

              <div className="grid items-start gap-4 xl:grid-cols-2">
                {/* Vitals */}
                <InfoCard icon={<HeartPulse size={15} aria-hidden="true" />} tint="bg-rose-100 text-rose-700" title="Vitals">
                  <VitalsTable vitals={intake.vitals} />
                </InfoCard>

                {/* Presentation */}
                <InfoCard icon={<ClipboardList size={15} aria-hidden="true" />} tint="bg-sky-100 text-sky-700" title="Presentation">
                  <p className="text-sm font-semibold leading-6 text-slate-950">{intake.chiefComplaint}</p>
                  <DistressMeter level={intake.painLevel} />
                  {intake.structuredSymptoms.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Symptoms</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {intake.structuredSymptoms.map((symptom) => (
                          <span key={symptom} className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800 ring-1 ring-inset ring-sky-200">
                            {symptom}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {activeRiskFlags(intake).length > 0 ? (
                    <div className="mt-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Risk flags</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {activeRiskFlags(intake).map((flag) => (
                          <span key={flag} className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-800 ring-1 ring-inset ring-rose-200">
                            <ShieldAlert size={11} aria-hidden="true" />
                            {flag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {intake.symptomNotes ? (
                    <div className="mt-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Intake notes</p>
                      <p className="mt-1 whitespace-pre-wrap break-words rounded-md bg-slate-50 p-2.5 text-xs leading-5 text-slate-700">
                        {intake.symptomNotes}
                      </p>
                    </div>
                  ) : null}
                </InfoCard>

                {/* Savi AI assessment */}
                <InfoCard icon={<BrainCircuit size={15} aria-hidden="true" />} tint="bg-violet-100 text-violet-700" title="Savi AI assessment">
                  {intake.assessment ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${urgencyStyles[intake.assessment.finalCategory]}`}>
                          {formatEnumLabel(intake.assessment.finalCategory)} · {intake.assessment.finalScore}/100
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
                          Confidence {formatEnumLabel(intake.assessment.confidenceLevel)}
                        </span>
                      </div>
                      {intake.assessment.suggestedDiagnosis ? (
                        <div className="rounded-md border border-violet-100 bg-violet-50/70 p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700">Suggested diagnosis</p>
                          <p className="mt-1 text-sm font-medium leading-6 text-slate-900">{intake.assessment.suggestedDiagnosis}</p>
                        </div>
                      ) : null}
                      {intake.assessment.medicalAttentionNote ? (
                        <div className="rounded-md border border-amber-100 bg-amber-50/70 p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Attention needed</p>
                          <p className="mt-1 text-xs leading-5 text-slate-800">{intake.assessment.medicalAttentionNote}</p>
                        </div>
                      ) : null}
                      {intake.assessment.redFlagIndicators.length > 0 ? (
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Red flags</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {intake.assessment.redFlagIndicators.map((flag) => (
                              <span key={flag} className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-900 ring-1 ring-inset ring-rose-200">
                                <BadgeAlert size={11} aria-hidden="true" />
                                {flag}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {intake.assessment.structuredSymptomSummary ? (
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">What the AI understood</p>
                          <p className="mt-1 text-xs leading-5 text-slate-700">{intake.assessment.structuredSymptomSummary}</p>
                        </div>
                      ) : null}
                      {intake.assessment.scoreFactors.length > 0 ? (
                        <div className="rounded-md bg-slate-50 p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">How the score was set</p>
                          <ul className="mt-1.5 space-y-1 text-xs leading-5 text-slate-600">
                            {intake.assessment.scoreFactors.map((factor, index) => (
                              <li key={index} className="flex gap-2">
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" aria-hidden="true" />
                                <span className="min-w-0">{factor}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {intake.assessment.staffFacingExplanation ? (
                        <p className="border-t border-slate-100 pt-2.5 text-xs italic leading-5 text-slate-500">
                          {intake.assessment.staffFacingExplanation}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No triage assessment recorded.</p>
                  )}
                </InfoCard>

              <InfoCard icon={<UsersRound size={15} aria-hidden="true" />} tint="bg-emerald-100 text-emerald-700" title="Care thread">
                <div className="space-y-3">
                  {threadError ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{threadError}</p> : null}
                  {isThreadLoading ? (
                    <div className="h-24 animate-pulse rounded-md bg-sky-100" />
                  ) : thread.length === 0 ? (
                    <p className="rounded-md bg-white p-3 text-sm text-slate-500">No care-team comments yet.</p>
                  ) : (
                    thread.map((comment) => (
                      <article key={comment.id} className="rounded-md bg-white p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-950">{comment.authorName}</p>
                          <p className="text-xs text-slate-500">{formatDateTime(comment.createdAt)}</p>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{comment.body}</p>
                        {comment.attachments.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {comment.attachments.map((attachment) => (
                              <a
                                key={attachment.id}
                                href={attachment.url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800"
                              >
                                {attachment.fileName}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    ))
                  )}

                  <div className="rounded-md bg-white p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        value={authorName}
                        onChange={(event) => setAuthorName(event.target.value)}
                        className="input-field"
                        placeholder="Author"
                      />
                      <input
                        value={attachmentName}
                        onChange={(event) => setAttachmentName(event.target.value)}
                        className="input-field"
                        placeholder="Attachment name"
                      />
                      <input
                        value={attachmentUrl}
                        onChange={(event) => setAttachmentUrl(event.target.value)}
                        className="input-field sm:col-span-2"
                        placeholder="Attachment URL"
                      />
                    </div>
                    <textarea
                      value={commentBody}
                      onChange={(event) => setCommentBody(event.target.value)}
                      className="input-field mt-2 h-24 resize-y py-2"
                      placeholder="Add a care-team update"
                    />
                    <button
                      type="button"
                      onClick={() => void submitComment()}
                      className="mt-2 inline-flex h-9 items-center rounded-md bg-slate-950 px-3 text-sm font-medium text-white transition hover:bg-slate-800"
                    >
                      Add comment
                    </button>
                  </div>
                </div>
              </InfoCard>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {intake && isScheduleOpen ? (
        <ScheduleVisitModal
          patientDisplayId={intake.patientDisplayId}
          appointmentTime={appointmentTime}
          appointmentNote={appointmentNote}
          isSaving={isSavingAppointment}
          onTimeChange={setAppointmentTime}
          onNoteChange={setAppointmentNote}
          onSave={() => void saveAppointment()}
          onClose={() => setIsScheduleOpen(false)}
        />
      ) : null}

      {intake && (isGeneratingReport || patientReport) ? (
        <DocumentModal
          title={`Patient report - ${intake.patientDisplayId}`}
          badge={patientReport ? (patientReport.aiBacked ? 'LLM generated' : 'Fallback') : 'Generating'}
          isGenerating={isGeneratingReport}
          generatingLabel="Savi is writing the patient report"
          generatingHint="Compiling intake, triage assessment, research, and queue context..."
          body={patientReport?.report ?? ''}
          fileName={`${intake.patientDisplayId}-report.pdf`}
          onClose={() => setPatientReport(null)}
        />
      ) : null}

      {intake && prescriptionDraft ? (
        <DocumentModal
          title={`Prescription draft - ${intake.patientDisplayId}`}
          badge="Draft - clinician to complete"
          isGenerating={false}
          generatingLabel=""
          generatingHint=""
          body={prescriptionDraft}
          editable
          onBodyChange={setPrescriptionDraft}
          fileName={`${intake.patientDisplayId}-prescription.pdf`}
          onClose={() => setPrescriptionDraft('')}
        />
      ) : null}
    </div>
  );
}

function InfoCard({ icon, tint, title, children }: { icon: ReactNode; tint: string; title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-md ${tint}`}>{icon}</span>
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

type VitalStatus = 'ok' | 'warn' | 'alert' | 'missing';

const vitalStatusStyles: Record<VitalStatus, { dot: string; badge: string; label: string }> = {
  ok: { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200', label: 'Normal' },
  warn: { dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-800 ring-amber-200', label: 'Watch' },
  alert: { dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-800 ring-rose-200', label: 'Abnormal' },
  missing: { dot: 'bg-slate-300', badge: 'bg-slate-50 text-slate-500 ring-slate-200', label: 'Not taken' },
};

function rangeStatus(value: number | undefined, ok: [number, number], warn: [number, number]): VitalStatus {
  if (value == null) {
    return 'missing';
  }
  if (value >= ok[0] && value <= ok[1]) {
    return 'ok';
  }
  if (value >= warn[0] && value <= warn[1]) {
    return 'warn';
  }
  return 'alert';
}

function VitalsTable({ vitals }: { vitals: IntakeResponse['vitals'] }) {
  const bpStatus: VitalStatus = vitals.systolicPressure == null
    ? 'missing'
    : rangeStatus(vitals.systolicPressure, [90, 139], [80, 179]);

  const rows: Array<{ icon: ReactNode; label: string; value: string; unit: string; status: VitalStatus }> = [
    {
      icon: <UserRoundCheck size={15} aria-hidden="true" />,
      label: 'Age',
      value: vitals.age != null ? String(vitals.age) : '—',
      unit: 'yrs',
      status: vitals.age == null ? 'missing' : 'ok',
    },
    {
      icon: <Gauge size={15} aria-hidden="true" />,
      label: 'Height',
      value: vitals.heightCm != null ? vitals.heightCm.toFixed(1) : '—',
      unit: 'cm',
      status: vitals.heightCm == null ? 'missing' : 'ok',
    },
    {
      icon: <Gauge size={15} aria-hidden="true" />,
      label: 'Weight',
      value: vitals.weightKg != null ? vitals.weightKg.toFixed(1) : '—',
      unit: 'kg',
      status: vitals.weightKg == null ? 'missing' : 'ok',
    },
    {
      icon: <Thermometer size={15} aria-hidden="true" />,
      label: 'Temperature',
      value: vitals.temperatureC != null ? vitals.temperatureC.toFixed(1) : '—',
      unit: '°C',
      status: rangeStatus(vitals.temperatureC, [36.1, 37.9], [35, 38.9]),
    },
    {
      icon: <HeartPulse size={15} aria-hidden="true" />,
      label: 'Heart rate',
      value: vitals.heartRate != null ? String(vitals.heartRate) : '—',
      unit: 'bpm',
      status: rangeStatus(vitals.heartRate, [60, 100], [50, 120]),
    },
    {
      icon: <Gauge size={15} aria-hidden="true" />,
      label: 'Blood pressure',
      value: vitals.systolicPressure != null || vitals.diastolicPressure != null
        ? `${vitals.systolicPressure ?? '—'}/${vitals.diastolicPressure ?? '—'}`
        : '—',
      unit: 'mmHg',
      status: bpStatus,
    },
    {
      icon: <Wind size={15} aria-hidden="true" />,
      label: 'Respiratory rate',
      value: vitals.respiratoryRate != null ? String(vitals.respiratoryRate) : '—',
      unit: '/min',
      status: rangeStatus(vitals.respiratoryRate, [12, 20], [10, 24]),
    },
    {
      icon: <Droplets size={15} aria-hidden="true" />,
      label: 'SpO₂',
      value: vitals.oxygenSaturation != null ? String(vitals.oxygenSaturation) : '—',
      unit: '%',
      status: vitals.oxygenSaturation == null ? 'missing' : vitals.oxygenSaturation >= 95 ? 'ok' : vitals.oxygenSaturation >= 90 ? 'warn' : 'alert',
    },
  ];

  return (
    <table className="w-full border-separate border-spacing-0 text-sm">
      <tbody>
        {rows.map((row, index) => {
          const style = vitalStatusStyles[row.status];
          return (
            <tr key={row.label}>
              <td className={`flex items-center gap-2.5 py-2.5 pr-2 ${index > 0 ? 'border-t border-slate-100' : ''}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                  {row.icon}
                </span>
                <span className="font-medium text-slate-700">{row.label}</span>
              </td>
              <td className={`py-2.5 pr-2 text-right ${index > 0 ? 'border-t border-slate-100' : ''}`}>
                <span className={`font-semibold ${row.status === 'missing' ? 'text-slate-400' : 'text-slate-950'}`}>{row.value}</span>
                <span className="ml-1 text-xs text-slate-400">{row.unit}</span>
              </td>
              <td className={`w-24 py-2.5 text-right ${index > 0 ? 'border-t border-slate-100' : ''}`}>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${style.badge}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
                  {style.label}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DistressMeter({ level }: { level: number }) {
  const tone = level >= 7 ? 'bg-rose-500' : level >= 4 ? 'bg-amber-500' : 'bg-emerald-500';
  const toneText = level >= 7 ? 'text-rose-700' : level >= 4 ? 'text-amber-700' : 'text-emerald-700';
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Clinical distress</p>
        <p className={`text-xs font-bold ${toneText}`}>{level}/10</p>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${tone} transition-all duration-500`} style={{ width: `${Math.min(100, level * 10)}%` }} />
      </div>
    </div>
  );
}

function ScheduleVisitModal({
  patientDisplayId,
  appointmentTime,
  appointmentNote,
  isSaving,
  onTimeChange,
  onNoteChange,
  onSave,
  onClose,
}: {
  patientDisplayId: string;
  appointmentTime: string;
  appointmentNote: string;
  isSaving: boolean;
  onTimeChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="animate-message-in w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <CalendarPlus size={17} aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-slate-950">Schedule next visit</h3>
              <p className="text-xs text-slate-500">Follow-up for {patientDisplayId}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
            aria-label="Close scheduling"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Visit date & time
          <input
            type="datetime-local"
            value={appointmentTime}
            onChange={(event) => onTimeChange(event.target.value)}
            className="input-field"
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Visit note
          <input
            value={appointmentNote}
            onChange={(event) => onNoteChange(event.target.value)}
            className="input-field"
            placeholder="e.g. Wound check, review labs"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!appointmentTime || isSaving}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <CalendarDays size={15} aria-hidden="true" />}
            Save visit
          </button>
        </div>
      </div>
    </div>
  );
}

function downloadPdf(title: string, body: string, fileName: string) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('CareFlow AI', margin, 52);
  doc.setFontSize(12);
  doc.text(title, margin, 74);
  doc.setDrawColor(180);
  doc.line(margin, 84, pageWidth - margin, 84);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  let y = 106;
  for (const rawLine of body.split('\n')) {
    const heading = rawLine.startsWith('#');
    const text = heading ? rawLine.replace(/^#+\s*/, '') : rawLine;
    doc.setFont('helvetica', heading ? 'bold' : 'normal');
    const wrapped: string[] = doc.splitTextToSize(text || ' ', usableWidth);
    for (const line of wrapped) {
      if (y > pageHeight - 56) {
        doc.addPage();
        y = 56;
      }
      doc.text(line, margin, y);
      y += 15;
    }
  }
  doc.save(fileName);
}

function DocumentModal({
  title,
  badge,
  isGenerating,
  generatingLabel,
  generatingHint,
  body,
  fileName,
  editable = false,
  onBodyChange,
  onClose,
}: {
  title: string;
  badge: string;
  isGenerating: boolean;
  generatingLabel: string;
  generatingHint: string;
  body: string;
  fileName: string;
  editable?: boolean;
  onBodyChange?: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur"
      role="dialog"
      aria-modal="true"
      onClick={isGenerating ? undefined : onClose}
    >
      <div
        className="animate-message-in flex max-h-[90vh] w-full max-w-2xl flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 rounded-t-xl border border-b-0 border-slate-200 bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileText size={16} className="shrink-0 text-emerald-700" aria-hidden="true" />
            <p className="truncate text-sm font-semibold text-slate-950">{title}</p>
            <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
              {badge}
            </span>
          </div>
          {!isGenerating ? (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
              aria-label="Close document"
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {/* The "PDF page" */}
        <div className="relative min-h-0 flex-1 overflow-y-auto border border-slate-200 bg-slate-100 p-4 sm:p-6">
          <div className={`mx-auto min-h-[28rem] w-full max-w-xl rounded-sm bg-white p-8 shadow-xl ring-1 ring-slate-200 ${isGenerating ? 'select-none blur-[3px]' : ''}`}>
            {isGenerating ? (
              <div className="animate-pulse space-y-3">
                <div className="h-5 w-1/3 rounded bg-slate-200" />
                <div className="h-3 w-2/3 rounded bg-slate-100" />
                <div className="mt-6 h-3 w-full rounded bg-slate-100" />
                <div className="h-3 w-full rounded bg-slate-100" />
                <div className="h-3 w-5/6 rounded bg-slate-100" />
                <div className="mt-5 h-4 w-1/4 rounded bg-slate-200" />
                <div className="h-3 w-full rounded bg-slate-100" />
                <div className="h-3 w-4/5 rounded bg-slate-100" />
                <div className="h-3 w-full rounded bg-slate-100" />
                <div className="mt-5 h-4 w-1/3 rounded bg-slate-200" />
                <div className="h-3 w-3/4 rounded bg-slate-100" />
                <div className="h-3 w-full rounded bg-slate-100" />
              </div>
            ) : editable ? (
              <textarea
                value={body}
                onChange={(event) => onBodyChange?.(event.target.value)}
                className="h-96 w-full resize-y bg-transparent font-mono text-sm leading-6 text-slate-800 outline-none"
                aria-label="Document body"
              />
            ) : (
              <div className="space-y-2 text-sm leading-6 text-slate-800">
                {body.split('\n').filter(Boolean).map((line, index) => {
                  const heading = line.startsWith('#') ? line.replace(/^#+\s*/, '') : null;
                  return heading ? (
                    <p key={`${line}-${index}`} className="pt-2 text-base font-bold text-slate-950">{heading}</p>
                  ) : (
                    <p key={`${line}-${index}`} className="whitespace-pre-wrap break-words">{line}</p>
                  );
                })}
              </div>
            )}
          </div>

          {isGenerating ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-lg ring-1 ring-slate-200">
                <span className="absolute h-2 w-2 rounded-full bg-emerald-600 animate-orbit" />
                <FileText size={22} className="text-emerald-700" aria-hidden="true" />
              </span>
              <div className="rounded-full bg-white/95 px-4 py-2 text-center shadow-lg ring-1 ring-slate-200">
                <p className="text-sm font-semibold text-slate-950">{generatingLabel}</p>
                <p className="text-xs text-slate-500">{generatingHint}</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 rounded-b-xl border border-t-0 border-slate-200 bg-white px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => downloadPdf(title, body, fileName)}
            disabled={isGenerating || !body.trim()}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={15} aria-hidden="true" />
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkflowButton({
  children,
  disabled = false,
  icon,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-sky-200 bg-white px-3 text-sm font-medium text-slate-800 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {icon}
      {children}
    </button>
  );
}

