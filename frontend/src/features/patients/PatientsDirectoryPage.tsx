import {
  BookOpenText,
  Bot,
  BrainCircuit,
  ChevronRight,
  FolderOpen,
  Globe,
  LayoutGrid,
  ListTree,
  Network,
  Paperclip,
  RefreshCw,
  Search,
  Stethoscope,
  UsersRound,
  X,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { getPatientDirectory, getPatientStory } from '../../api/client';
import { Avatar } from '../../components/Avatar';
import { FormattedMessage } from '../../components/FormattedMessage';
import type { PatientDirectoryEntry, PatientStory, QueueStatus, UrgencyCategory } from '../../types/careflow';

const urgencyBadge: Record<UrgencyCategory, string> = {
  CRITICAL: 'bg-red-100 text-red-800 ring-red-200',
  HIGH: 'bg-amber-100 text-amber-800 ring-amber-200',
  MEDIUM: 'bg-sky-100 text-sky-800 ring-sky-200',
  LOW: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
};

const statusBadge: Record<QueueStatus, string> = {
  WAITING: 'bg-amber-50 text-amber-800 ring-amber-200',
  IN_TRIAGE: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
  IN_TREATMENT: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  DISCHARGED: 'bg-slate-100 text-slate-700 ring-slate-200',
  LEFT_WITHOUT_BEING_SEEN: 'bg-rose-50 text-rose-800 ring-rose-200',
};

const urgencyDot: Record<UrgencyCategory, string> = {
  CRITICAL: 'bg-rose-500',
  HIGH: 'bg-amber-500',
  MEDIUM: 'bg-sky-500',
  LOW: 'bg-emerald-500',
};

const urgencyFill: Record<UrgencyCategory, string> = {
  CRITICAL: 'fill-rose-500',
  HIGH: 'fill-amber-500',
  MEDIUM: 'fill-sky-500',
  LOW: 'fill-emerald-500',
};

type PatientView = 'cards' | 'tree' | 'graph';

const UNASSIGNED = 'Unassigned';

// Module-level cache so re-entering the Patients route paints instantly and the network
// fetch runs in the background (stale-while-revalidate) instead of a blocking spinner.
let directoryCache: PatientDirectoryEntry[] | null = null;

function formatEnumLabel(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

function doctorKey(patient: PatientDirectoryEntry) {
  return patient.assignedDoctor?.trim() || UNASSIGNED;
}

function groupByDoctor(patients: PatientDirectoryEntry[]) {
  const map = new Map<string, PatientDirectoryEntry[]>();
  patients.forEach((patient) => {
    const key = doctorKey(patient);
    const bucket = map.get(key) ?? [];
    bucket.push(patient);
    map.set(key, bucket);
  });
  return Array.from(map.entries())
    .map(([doctor, entries]) => ({ doctor, entries }))
    .sort((first, second) => {
      // Real doctors first, Unassigned last, then by size.
      if (first.doctor === UNASSIGNED) return 1;
      if (second.doctor === UNASSIGNED) return -1;
      return second.entries.length - first.entries.length || first.doctor.localeCompare(second.doctor);
    });
}

export function PatientsDirectoryPage() {
  const [patients, setPatients] = useState<PatientDirectoryEntry[]>(() => directoryCache ?? []);
  const [isDirectoryLoading, setIsDirectoryLoading] = useState(directoryCache === null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [view, setView] = useState<PatientView>('cards');
  const [storyPatientId, setStoryPatientId] = useState<string | null>(null);
  const [story, setStory] = useState<PatientStory | null>(null);
  const [isStoryLoading, setIsStoryLoading] = useState(false);
  const [storyError, setStoryError] = useState<string | null>(null);

  const openStory = useCallback(async (patientId: string) => {
    setStoryPatientId(patientId);
    setStory(null);
    setStoryError(null);
    setIsStoryLoading(true);
    try {
      setStory(await getPatientStory(patientId));
    } catch (caughtError) {
      setStoryError(caughtError instanceof Error ? caughtError.message : 'Unable to load the patient story.');
    } finally {
      setIsStoryLoading(false);
    }
  }, []);

  const closeStory = useCallback(() => {
    setStoryPatientId(null);
    setStory(null);
    setStoryError(null);
  }, []);

  const loadDirectory = useCallback(async (silent = false) => {
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsDirectoryLoading(true);
    }
    try {
      const data = await getPatientDirectory();
      directoryCache = data;
      setPatients(data);
    } catch {
      if (directoryCache === null) {
        setPatients([]);
      }
    } finally {
      setIsDirectoryLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Revalidate silently when we already have a cached snapshot to show.
    void loadDirectory(directoryCache !== null);
  }, [loadDirectory]);

  const visiblePatients = useMemo(() => {
    const query = patientSearch.trim().toLowerCase();
    if (!query) {
      return patients;
    }
    return patients.filter((patient) =>
      [
        patient.patientDisplayId,
        patient.chiefComplaint ?? '',
        patient.department ?? '',
        patient.suggestedDiagnosis ?? '',
        patient.assignedDoctor ?? '',
        patient.currentStatus ?? '',
      ].some((value) => value.toLowerCase().includes(query)),
    );
  }, [patientSearch, patients]);

  const viewOptions: Array<{ value: PatientView; label: string; icon: typeof LayoutGrid }> = [
    { value: 'cards', label: 'Cards', icon: LayoutGrid },
    { value: 'tree', label: 'Tree', icon: ListTree },
    { value: 'graph', label: 'Graph', icon: Network },
  ];

  return (
    <section className="py-6">
      <div className="flex flex-col gap-4 border-b border-sky-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-950 text-white">
            <UsersRound size={19} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium text-sky-700">Patients</p>
            <h2 className="mt-0.5 text-2xl font-semibold text-slate-950">Patient directory</h2>
            <p className="text-xs text-slate-500">
              Every patient who came in, was treated, or discharged - with their details and attached files.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-md border border-slate-200 bg-white p-0.5 shadow-sm">
            {viewOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setView(option.value)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded px-2.5 text-sm font-medium transition ${
                    view === option.value ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                  aria-pressed={view === option.value}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span className="hidden sm:inline">{option.label}</span>
                </button>
              );
            })}
          </div>
          <label className="flex h-10 w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-3 shadow-sm sm:w-64">
            <Search size={15} className="shrink-0 text-emerald-700" aria-hidden="true" />
            <input
              value={patientSearch}
              onChange={(event) => setPatientSearch(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
              placeholder="Search patient, complaint, doctor, status"
            />
          </label>
          <button
            type="button"
            onClick={() => void loadDirectory(true)}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-sky-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-sky-50"
          >
            <RefreshCw size={16} className={isDirectoryLoading || isRefreshing ? 'animate-spin' : ''} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-5">
        {isDirectoryLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-40 animate-pulse rounded-md bg-sky-100" />
            ))}
          </div>
        ) : visiblePatients.length === 0 ? (
          <p className="rounded-md bg-sky-50 p-4 text-sm text-slate-500">
            {patients.length === 0 ? 'No patients recorded yet.' : 'No patients match this search.'}
          </p>
        ) : view === 'cards' ? (
          <PatientCardsView patients={visiblePatients} onOpenStory={openStory} />
        ) : view === 'tree' ? (
          <PatientTreeView patients={visiblePatients} onOpenStory={openStory} />
        ) : (
          <PatientGraphView patients={visiblePatients} onOpenStory={openStory} />
        )}
      </div>

      {storyPatientId ? (
        <PatientStoryModal story={story} isLoading={isStoryLoading} error={storyError} onClose={closeStory} />
      ) : null}
    </section>
  );
}

interface PatientViewProps {
  patients: PatientDirectoryEntry[];
  onOpenStory: (patientId: string) => void;
}

function PatientCardsView({ patients, onOpenStory }: PatientViewProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {patients.map((patient) => (
        <article key={patient.patientId} className="flex min-w-0 flex-col rounded-md border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Avatar name={patient.patientDisplayId} kind="patient" size="sm" />
              <p className="truncate text-sm font-semibold text-slate-950">{patient.patientDisplayId}</p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              {patient.urgencyCategory ? (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${urgencyBadge[patient.urgencyCategory]}`}>
                  {formatEnumLabel(patient.urgencyCategory)}{patient.urgencyScore != null ? ` ${patient.urgencyScore}` : ''}
                </span>
              ) : null}
              {patient.currentStatus ? (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${statusBadge[patient.currentStatus]}`}>
                  {formatEnumLabel(patient.currentStatus)}
                </span>
              ) : null}
            </div>
          </div>

          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">
            {patient.chiefComplaint ?? 'No intake recorded.'}
          </p>

          <div className="mt-2 grid gap-1 text-xs text-slate-500">
            <span>
              {formatEnumLabel(patient.ageBand)} - {patient.department ?? 'No department'}
              {patient.arrivedAt ? ` - ${new Date(patient.arrivedAt).toLocaleString()}` : ''}
            </span>
            {patient.assignedDoctor ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-800">
                <Stethoscope size={12} aria-hidden="true" />
                {patient.assignedDoctor}
              </span>
            ) : null}
            {patient.suggestedDiagnosis ? (
              <span className="line-clamp-2 text-slate-600">Dx: {patient.suggestedDiagnosis}</span>
            ) : null}
          </div>

          <div className="mt-auto pt-3">
            <button
              type="button"
              onClick={() => onOpenStory(patient.patientId)}
              className="mb-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-slate-950 px-2.5 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              <BookOpenText size={13} aria-hidden="true" />
              View diagnosis & agent story
            </button>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-normal text-slate-500">
              <FolderOpen size={12} aria-hidden="true" />
              Files ({patient.files.length})
            </p>
            {patient.files.length === 0 ? (
              <p className="mt-1 text-xs text-slate-400">No files attached.</p>
            ) : (
              <div className="scrollbar-hide mt-1 max-h-20 space-y-1 overflow-y-auto">
                {patient.files.map((patientFile, index) => (
                  <a
                    key={`${patientFile.url}-${index}`}
                    href={patientFile.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-1.5 rounded bg-slate-50 px-2 py-1 text-xs text-sky-800 ring-1 ring-inset ring-sky-100 transition hover:bg-sky-50"
                  >
                    <Paperclip size={11} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">{patientFile.fileName}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-slate-400">{patientFile.uploadedBy}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function PatientTreeView({ patients, onOpenStory }: PatientViewProps) {
  const groups = useMemo(() => groupByDoctor(patients), [patients]);

  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <DoctorTreeGroup key={group.doctor} doctor={group.doctor} entries={group.entries} onOpenStory={onOpenStory} />
      ))}
    </div>
  );
}

function DoctorTreeGroup({
  doctor,
  entries,
  onOpenStory,
}: {
  doctor: string;
  entries: PatientDirectoryEntry[];
  onOpenStory: (patientId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const isUnassigned = doctor === UNASSIGNED;

  return (
    <div className="rounded-md border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
        aria-expanded={isOpen}
      >
        <ChevronRight size={16} aria-hidden="true" className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${isUnassigned ? 'bg-slate-100 text-slate-500' : 'bg-emerald-600 text-white'}`}>
          <Stethoscope size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-950">{doctor}</p>
          <p className="text-[11px] text-slate-500">{entries.length} patient{entries.length === 1 ? '' : 's'}</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{entries.length}</span>
      </button>

      {isOpen ? (
        <div className="space-y-1.5 border-t border-slate-100 px-3 pb-3 pt-2">
          {entries.map((patient) => (
            <button
              key={patient.patientId}
              type="button"
              onClick={() => onOpenStory(patient.patientId)}
              className="ml-2 flex w-[calc(100%-0.5rem)] items-center gap-2.5 border-l-2 border-slate-200 py-1.5 pl-3 text-left transition hover:border-emerald-400"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${patient.urgencyCategory ? urgencyDot[patient.urgencyCategory] : 'bg-slate-300'}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-900">{patient.patientDisplayId}</span>
                <span className="block truncate text-xs text-slate-500">{patient.chiefComplaint ?? 'No intake recorded.'}</span>
              </span>
              {patient.currentStatus ? (
                <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset sm:inline ${statusBadge[patient.currentStatus]}`}>
                  {formatEnumLabel(patient.currentStatus)}
                </span>
              ) : null}
              <ChevronRight size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PatientGraphView({ patients, onOpenStory }: PatientViewProps) {
  const groups = useMemo(() => groupByDoctor(patients), [patients]);

  return (
    <>
      <p className="mb-3 text-xs text-slate-500">
        Each hub is a doctor (or unassigned pool); the orbiting nodes are their patients. Click any node to open its story.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <DoctorCluster key={group.doctor} doctor={group.doctor} entries={group.entries} onOpenStory={onOpenStory} />
        ))}
      </div>
    </>
  );
}

function DoctorCluster({
  doctor,
  entries,
  onOpenStory,
}: {
  doctor: string;
  entries: PatientDirectoryEntry[];
  onOpenStory: (patientId: string) => void;
}) {
  const size = 260;
  const center = size / 2;
  const radius = entries.length <= 1 ? 0 : Math.min(96, 52 + entries.length * 6);
  const isUnassigned = doctor === UNASSIGNED;

  const nodes = entries.map((patient, index) => {
    const angle = (index / entries.length) * Math.PI * 2 - Math.PI / 2;
    return {
      patient,
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
    };
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-md ${isUnassigned ? 'bg-slate-100 text-slate-500' : 'bg-emerald-600 text-white'}`}>
          <Stethoscope size={14} aria-hidden="true" />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-950">{doctor}</p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{entries.length}</span>
      </div>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full" role="img" aria-label={`Patient cluster for ${doctor}`}>
        {nodes.map((node) => (
          <line
            key={`edge-${node.patient.patientId}`}
            x1={center}
            y1={center}
            x2={node.x}
            y2={node.y}
            className="stroke-slate-200"
            strokeWidth={1.5}
          />
        ))}

        {/* hub */}
        <circle cx={center} cy={center} r={22} className={isUnassigned ? 'fill-slate-200' : 'fill-emerald-500'} />
        <text x={center} y={center + 4} textAnchor="middle" className="fill-white text-[10px] font-bold">
          {isUnassigned ? '—' : doctor.replace(/^Dr\.?\s+/i, '').slice(0, 2).toUpperCase()}
        </text>

        {nodes.map((node) => (
          <g
            key={node.patient.patientId}
            className="cursor-pointer"
            onClick={() => onOpenStory(node.patient.patientId)}
          >
            <title>{`${node.patient.patientDisplayId} - ${node.patient.chiefComplaint ?? 'No intake'}`}</title>
            <circle
              cx={node.x}
              cy={node.y}
              r={14}
              className={node.patient.urgencyCategory ? urgencyFill[node.patient.urgencyCategory] : 'fill-slate-300'}
              stroke="white"
              strokeWidth={2}
            />
            <text x={node.x} y={node.y + 3} textAnchor="middle" className="pointer-events-none fill-white text-[8px] font-bold">
              {node.patient.patientDisplayId.replace(/[^0-9]/g, '').slice(-3) || node.patient.patientDisplayId.slice(-3)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function PatientStoryModal({
  story,
  isLoading,
  error,
  onClose,
}: {
  story: PatientStory | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const agentEvents = story?.timeline.filter((event) => event.source === 'AGENT') ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="animate-message-in w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={story?.patientDisplayId ?? 'Patient'} kind="patient" />
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-950">
                {story?.patientDisplayId ?? 'Loading patient story'}
              </h3>
              <p className="text-xs text-slate-500">
                {story
                  ? `${story.chiefComplaint ?? 'No complaint recorded'} - ${story.department ?? 'No department'} - arrived ${new Date(story.arrivedAt).toLocaleString()}`
                  : 'Diagnosis, agent decisions, and research citations'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
            aria-label="Close patient story"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="scrollbar-hide max-h-[70vh] space-y-5 overflow-y-auto p-5">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : error ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>
          ) : story ? (
            <>
              <StorySection icon={<BrainCircuit size={15} aria-hidden="true" />} tint="bg-violet-100 text-violet-800" title="Triage decision - Savi LLM">
                {story.assessment ? (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      <Chip className="bg-slate-950 text-white ring-slate-950">
                        {story.assessment.finalCategory} - {story.assessment.finalScore}/100
                      </Chip>
                      <Chip className="bg-slate-100 text-slate-700 ring-slate-200">
                        Confidence {story.assessment.confidenceLevel}
                      </Chip>
                      {story.assessment.redFlagIndicators.map((flag) => (
                        <Chip key={flag} className="bg-rose-100 text-rose-900 ring-rose-200">{flag}</Chip>
                      ))}
                    </div>
                    {story.assessment.suggestedDiagnosis ? (
                      <p className="mt-3 text-sm leading-6 text-slate-700">
                        <span className="font-semibold text-slate-900">Suggested concern:</span> {story.assessment.suggestedDiagnosis}
                      </p>
                    ) : null}
                    {story.assessment.medicalAttentionNote ? (
                      <p className="mt-1 text-sm leading-6 text-slate-700">
                        <span className="font-semibold text-slate-900">Attention:</span> {story.assessment.medicalAttentionNote}
                      </p>
                    ) : null}
                    {story.assessment.scoreFactors.length > 0 ? (
                      <div className="mt-3 rounded-md bg-slate-50 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">How the score was set</p>
                        <ul className="mt-1.5 space-y-1 text-xs leading-5 text-slate-600">
                          {story.assessment.scoreFactors.map((factor, index) => (
                            <li key={index} className="flex gap-2">
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" aria-hidden="true" />
                              <span className="min-w-0">{factor}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-slate-500">No triage assessment recorded for this patient.</p>
                )}
              </StorySection>

              <StorySection icon={<Bot size={15} aria-hidden="true" />} tint="bg-emerald-100 text-emerald-800" title="Agent decisions">
                {story.assignment ? (
                  <div className="flex items-start gap-3 rounded-md bg-emerald-50 p-3 ring-1 ring-inset ring-emerald-100">
                    <Avatar name={story.assignment.doctorName} kind="doctor" size="sm" />
                    <div className="min-w-0 text-sm leading-6 text-slate-700">
                      <p className="font-semibold text-slate-900">
                        {story.assignment.doctorName}
                        {story.assignment.doctorSpecialty ? ` - ${story.assignment.doctorSpecialty}` : ''}
                      </p>
                      <p className="text-xs leading-5 text-slate-600">{story.assignment.reason}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No active doctor assignment.</p>
                )}
                {agentEvents.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {agentEvents.map((event) => (
                      <li key={event.id} className="rounded-md bg-slate-50 p-2.5 text-xs leading-5 text-slate-600">
                        <p className="font-semibold text-slate-900">
                          {event.title}
                          <span className="ml-2 font-normal text-slate-400">
                            {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </p>
                        <p className="mt-0.5 break-words">{event.description}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </StorySection>

              <StorySection icon={<Globe size={15} aria-hidden="true" />} tint="bg-amber-100 text-amber-800" title="Online research & citations">
                {story.research ? (
                  <>
                    <div className="rounded-md bg-amber-50/60 p-3 text-xs leading-5 text-slate-700 ring-1 ring-inset ring-amber-100">
                      <FormattedMessage text={story.research.briefing} />
                    </div>
                    {story.research.citations.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {story.research.citations.map((citation) => (
                          <a
                            key={citation.url}
                            href={citation.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-64 items-center gap-1.5 truncate rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-800 ring-1 ring-inset ring-sky-200 transition hover:bg-sky-200"
                          >
                            <Paperclip size={11} className="shrink-0" aria-hidden="true" />
                            <span className="truncate">{citation.title}</span>
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    The Medical Research Agent has not saved research for this patient (it may have been inactive or offline during intake).
                  </p>
                )}
              </StorySection>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StorySection({ icon, tint, title, children }: { icon: ReactNode; tint: string; title: string; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-md ${tint}`}>{icon}</span>
        <h4 className="text-sm font-semibold text-slate-950">{title}</h4>
      </div>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Chip({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${className}`}>
      {children}
    </span>
  );
}
