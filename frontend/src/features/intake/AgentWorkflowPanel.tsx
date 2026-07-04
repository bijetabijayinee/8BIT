import {
  BellRing,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ClipboardPlus,
  Globe,
  ListOrdered,
  Loader2,
  NotebookPen,
  Sparkles,
  Stethoscope,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { FormattedMessage } from '../../components/FormattedMessage';
import type { WorkflowEvent } from '../../types/careflow';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

interface WorkflowStep {
  stage: string;
  label: string;
  agent: string;
  chip: string;
  done: string;
  icon: ReactNode;
}

const chipStyles = {
  intake: 'bg-slate-100 text-slate-700 ring-slate-200',
  llm: 'bg-violet-100 text-violet-800 ring-violet-200',
  research: 'bg-amber-100 text-amber-800 ring-amber-200',
  priority: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  assignment: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  notification: 'bg-sky-100 text-sky-800 ring-sky-200',
  complete: 'bg-slate-950 text-white ring-slate-950',
};

// Order matches the real backend pipeline: research runs before sorting/assignment
// so its findings feed those stages. Internal persistence stages are not shown.
const workflowSteps: WorkflowStep[] = [
  { stage: 'INTAKE_RECEIVED', label: 'Intake received', agent: 'Intake', chip: chipStyles.intake, done: 'bg-slate-700 border-slate-700', icon: <ClipboardPlus size={15} aria-hidden="true" /> },
  { stage: 'LLM_REQUESTED', label: 'Savi triage called', agent: 'Savi LLM', chip: chipStyles.llm, done: 'bg-violet-600 border-violet-600', icon: <BrainCircuit size={15} aria-hidden="true" /> },
  { stage: 'LLM_RESPONDED', label: 'Triage decided', agent: 'Savi LLM', chip: chipStyles.llm, done: 'bg-violet-600 border-violet-600', icon: <Sparkles size={15} aria-hidden="true" /> },
  { stage: 'RESEARCH_STARTED', label: 'Researching condition online', agent: 'Research Agent', chip: chipStyles.research, done: 'bg-amber-500 border-amber-500', icon: <Globe size={15} aria-hidden="true" /> },
  { stage: 'RESEARCH_SAVED', label: 'Research briefed & cited', agent: 'Research Agent', chip: chipStyles.research, done: 'bg-amber-500 border-amber-500', icon: <NotebookPen size={15} aria-hidden="true" /> },
  { stage: 'QUEUE_SORTED', label: 'Sorted into queue', agent: 'Priority Agent', chip: chipStyles.priority, done: 'bg-indigo-600 border-indigo-600', icon: <ListOrdered size={15} aria-hidden="true" /> },
  { stage: 'DOCTOR_ASSIGNED', label: 'Doctor assigned', agent: 'Assignment Agent', chip: chipStyles.assignment, done: 'bg-emerald-600 border-emerald-600', icon: <Stethoscope size={15} aria-hidden="true" /> },
  { stage: 'DOCTOR_NOTIFIED', label: 'Care team notified', agent: 'Notification Agent', chip: chipStyles.notification, done: 'bg-sky-600 border-sky-600', icon: <BellRing size={15} aria-hidden="true" /> },
  { stage: 'WORKFLOW_COMPLETE', label: 'Workflow complete', agent: 'All agents', chip: chipStyles.complete, done: 'bg-slate-950 border-slate-950', icon: <CheckCircle2 size={15} aria-hidden="true" /> },
];

const stageIndex = new Map(workflowSteps.map((step, index) => [step.stage, index]));
// Auxiliary stages that enrich an existing step instead of adding a new one.
const stageAliases: Record<string, string> = { RESEARCH_SOURCES: 'RESEARCH_STARTED' };
// Internal persistence stages the backend emits but intake staff don't need to see.
const hiddenStages = new Set(['INTAKE_SAVED', 'CONTEXT_INDEXED']);

interface AgentWorkflowPanelProps {
  patientDisplayId: string;
  isSubmitting: boolean;
  onDismiss: () => void;
}

export function AgentWorkflowPanel({ patientDisplayId, isSubmitting, onDismiss }: AgentWorkflowPanelProps) {
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());

  const toggleStage = (stage: string) => {
    setExpandedStages((current) => {
      const next = new Set(current);
      if (next.has(stage)) {
        next.delete(stage);
      } else {
        next.add(stage);
      }
      return next;
    });
  };

  useEffect(() => {
    setEvents([]);
    setExpandedStages(new Set());
    const source = new EventSource(`${API_BASE_URL}/api/agent/workflow/stream`);
    const handleWorkflow = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as WorkflowEvent;
        if (parsed.patientDisplayId === patientDisplayId) {
          setEvents((current) => [...current, parsed]);
        }
      } catch {
        // Ignore malformed stream payloads.
      }
    };
    source.addEventListener('workflow', handleWorkflow);
    return () => {
      source.removeEventListener('workflow', handleWorkflow);
      source.close();
    };
  }, [patientDisplayId]);

  const { reachedIndex, detailByStage, isComplete } = useMemo(() => {
    let highest = -1;
    const details = new Map<string, WorkflowEvent>();
    events.forEach((event) => {
      if (hiddenStages.has(event.stage)) {
        return;
      }
      const stage = stageAliases[event.stage] ?? event.stage;
      details.set(stage, event);
      const index = stageIndex.get(stage);
      if (index !== undefined && index > highest) {
        highest = index;
      }
    });
    return {
      reachedIndex: highest,
      detailByStage: details,
      isComplete: details.has('WORKFLOW_COMPLETE'),
    };
  }, [events]);

  return (
    <div className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto rounded-lg bg-white/85 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-lg border border-emerald-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 items-center justify-center rounded-md bg-emerald-700 text-white ${isComplete ? '' : 'animate-soft-pulse'}`}>
              <Bot size={19} aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-slate-950">
                {isComplete ? `Agent workflow finished for ${patientDisplayId}` : `Savi agents working on ${patientDisplayId}`}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Live events streamed from the backend as each agent actually runs - nothing is simulated.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            disabled={isSubmitting}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Close workflow view"
            title={isSubmitting ? 'Available once the intake is saved' : 'Close workflow view'}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <ol className="mt-5 space-y-0">
          {workflowSteps.map((step, index) => {
            const detail = detailByStage.get(step.stage);
            const isDone = index <= reachedIndex;
            const isActive = index === reachedIndex + 1 && !isComplete;
            const isLast = index === workflowSteps.length - 1;
            const isTravelling = index === reachedIndex && !isComplete && !isLast;
            return (
              <li key={step.stage} className="relative flex gap-3 pb-1">
                {!isLast ? (
                  <span
                    className={`absolute left-[15px] top-8 h-[calc(100%-24px)] w-0.5 overflow-visible ${
                      index < reachedIndex ? 'bg-emerald-500' : 'bg-slate-200'
                    }`}
                    aria-hidden="true"
                  >
                    {isTravelling ? (
                      <span className="animate-flow-dot absolute -left-[3px] top-0 h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_2px_rgba(16,185,129,0.5)]" />
                    ) : null}
                  </span>
                ) : null}
                <span
                  className={`relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                    isDone
                      ? `${step.done} text-white`
                      : isActive
                        ? 'animate-flow-pulse border-emerald-400 bg-white text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-400'
                  }`}
                >
                  {isActive ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : step.icon}
                </span>
                <div className={`min-w-0 flex-1 pb-3 transition-opacity duration-300 ${isDone || isActive ? '' : 'opacity-40'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p className="text-sm font-semibold text-slate-950">{step.label}</p>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${step.chip}`}>
                      {step.agent}
                    </span>
                  </div>
                  {detail ? (
                    <p className="mt-0.5 break-words text-xs leading-5 text-slate-600 animate-message-in">{detail.detail}</p>
                  ) : isActive ? (
                    <p className="mt-0.5 text-xs italic text-slate-400">Working...</p>
                  ) : null}

                  {detail?.reasoning ? (
                    <div className="mt-1.5">
                      <button
                        type="button"
                        onClick={() => toggleStage(step.stage)}
                        className="inline-flex items-center gap-1 rounded text-[11px] font-semibold text-emerald-700 transition hover:text-emerald-900"
                        aria-expanded={expandedStages.has(step.stage)}
                      >
                        <ChevronDown
                          size={13}
                          aria-hidden="true"
                          className={`transition-transform ${expandedStages.has(step.stage) ? 'rotate-180' : ''}`}
                        />
                        {expandedStages.has(step.stage) ? 'Hide reasoning' : 'How this was decided'}
                      </button>
                      {expandedStages.has(step.stage) ? (
                        <div className="animate-message-in mt-1.5 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                          <FormattedMessage text={detail.reasoning} />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>

        {events.length === 0 ? (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-slate-50 p-3 text-xs text-slate-500">
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            Waiting for the first workflow event from the backend...
          </div>
        ) : null}

        {isComplete ? (
          <button
            type="button"
            onClick={onDismiss}
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-medium text-white transition hover:bg-emerald-800"
          >
            <CheckCircle2 size={16} aria-hidden="true" />
            Done - close workflow view
          </button>
        ) : null}
      </div>
    </div>
  );
}
