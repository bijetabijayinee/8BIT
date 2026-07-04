import {
  AlertCircle,
  BookOpenText,
  Bot,
  BrainCircuit,
  FileUp,
  FolderOpen,
  Globe,
  Loader2,
  Paperclip,
  RefreshCw,
  Search,
  Stethoscope,
  UsersRound,
  X,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { getKnowledgeDocuments, getPatientDirectory, getPatientStory, uploadKnowledgeDocument } from '../../api/client';
import { Avatar } from '../../components/Avatar';
import { FormattedMessage } from '../../components/FormattedMessage';
import type { KnowledgeDocument, PatientDirectoryEntry, PatientStory, QueueStatus, UrgencyCategory } from '../../types/careflow';

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

function formatEnumLabel(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

export function KnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patients, setPatients] = useState<PatientDirectoryEntry[]>([]);
  const [isDirectoryLoading, setIsDirectoryLoading] = useState(true);
  const [patientSearch, setPatientSearch] = useState('');
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

  const loadDocuments = useCallback(async () => {
    setIsLoading(true);
    try {
      setDocuments(await getKnowledgeDocuments());
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load knowledge documents.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadDirectory = useCallback(async () => {
    setIsDirectoryLoading(true);
    try {
      setPatients(await getPatientDirectory());
    } catch {
      setPatients([]);
    } finally {
      setIsDirectoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
    void loadDirectory();
  }, [loadDocuments, loadDirectory]);

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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      return;
    }
    setIsUploading(true);
    try {
      await uploadKnowledgeDocument(file, title);
      setTitle('');
      setFile(null);
      await loadDocuments();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to upload document.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <section className="py-6">
      <div className="flex flex-col gap-4 border-b border-sky-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sky-700">Savi knowledge</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">Update hospital knowledge</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            void loadDocuments();
            void loadDirectory();
          }}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-sky-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-sky-50"
        >
          <RefreshCw size={16} className={isLoading || isDirectoryLoading ? 'animate-spin' : ''} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mt-5 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={submit} className="rounded-lg border border-sky-100 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-950">Upload PDF or text</h3>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Knowledge title
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="input-field" placeholder="ER escalation policy" />
          </label>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            File
            <input
              type="file"
              accept=".pdf,.txt,.md"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="input-field h-auto py-2"
            />
          </label>
          <button
            type="submit"
            disabled={!file || isUploading}
            className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isUploading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <FileUp size={16} aria-hidden="true" />}
            {isUploading ? 'Embedding' : 'Upload and embed'}
          </button>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Uploaded documents are embedded into Savi's context immediately - ask Savi about them from any chat.
          </p>
        </form>

        <div className="rounded-lg border border-sky-100 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-950">Embedded documents</h3>
          <div className="scrollbar-hide mt-4 max-h-72 space-y-3 overflow-y-auto">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-md bg-sky-100" />)
            ) : documents.length === 0 ? (
              <p className="rounded-md bg-sky-50 p-4 text-sm text-slate-500">No hospital knowledge uploaded yet.</p>
            ) : (
              documents.map((document) => (
                <article key={document.id} className="rounded-md border border-sky-100 bg-sky-50 p-3">
                  <p className="text-sm font-semibold text-slate-950">{document.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {document.fileName} - {document.contentLength.toLocaleString()} chars - {new Date(document.updatedAt).toLocaleString()}
                  </p>
                </article>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-lg border border-sky-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-950 text-white">
              <UsersRound size={17} aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Patient directory</h3>
              <p className="text-xs text-slate-500">
                Every patient who came in, was treated, or discharged - with their details and attached files.
              </p>
            </div>
          </div>
          <label className="flex h-10 w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 sm:w-72">
            <Search size={15} className="shrink-0 text-emerald-700" aria-hidden="true" />
            <input
              value={patientSearch}
              onChange={(event) => setPatientSearch(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
              placeholder="Search patient, complaint, doctor, status"
            />
          </label>
        </div>

        <div className="mt-4">
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
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visiblePatients.map((patient) => (
                <article key={patient.patientId} className="flex min-w-0 flex-col rounded-md border border-slate-200 bg-slate-50 p-3">
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
                      onClick={() => void openStory(patient.patientId)}
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
                            className="flex min-w-0 items-center gap-1.5 rounded bg-white px-2 py-1 text-xs text-sky-800 ring-1 ring-inset ring-sky-100 transition hover:bg-sky-50"
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
          )}
        </div>
      </div>

      {storyPatientId ? (
        <PatientStoryModal
          story={story}
          isLoading={isStoryLoading}
          error={storyError}
          onClose={closeStory}
        />
      ) : null}
    </section>
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
