import {
  BellRing,
  BrainCircuit,
  ClipboardPlus,
  Globe,
  ListOrdered,
  Sparkles,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface FlowStage {
  key: string;
  label: string;
  agent: string;
  kind: 'AI' | 'SYSTEM';
  icon: LucideIcon;
  headline: string;
  detail: string;
}

const stages: FlowStage[] = [
  {
    key: 'intake',
    label: 'Intake',
    agent: 'Intake workspace',
    kind: 'SYSTEM',
    icon: ClipboardPlus,
    headline: 'A patient arrives',
    detail: 'Chief complaint, structured symptoms, vitals, risk flags, and distress score are captured in seconds.',
  },
  {
    key: 'triage',
    label: 'Triage',
    agent: 'Savi Triage Agent',
    kind: 'AI',
    icon: BrainCircuit,
    headline: 'AI reads the whole clinical picture',
    detail: 'The LLM weighs symptoms, vitals, and risk flags, then returns an urgency category, a 0-100 severity score, a suggested differential, and red flags.',
  },
  {
    key: 'research',
    label: 'Research',
    agent: 'Medical Research Agent',
    kind: 'AI',
    icon: Globe,
    headline: 'Live medical sources are consulted',
    detail: 'The agent queries PubMed and Europe PMC for peer-reviewed literature on the suspected condition, then briefs the care team with citations.',
  },
  {
    key: 'sort',
    label: 'Priority',
    agent: 'Priority Agent',
    kind: 'SYSTEM',
    icon: ListOrdered,
    headline: 'The queue re-sorts instantly',
    detail: 'Urgency first, then staff escalations, then wait-time pressure - patients near 30 minutes rise, past 40 minutes rise further.',
  },
  {
    key: 'assign',
    label: 'Assignment',
    agent: 'Assignment Agent',
    kind: 'AI',
    icon: Stethoscope,
    headline: 'The right doctor is matched',
    detail: 'Using the triage output and the research briefing, the agent picks the most relevant doctor by specialty, department, and urgency - with a written reason.',
  },
  {
    key: 'notify',
    label: 'Notify',
    agent: 'Notification Agent',
    kind: 'SYSTEM',
    icon: BellRing,
    headline: 'The care team knows immediately',
    detail: 'Doctor, intake desk, and triage nurses get flashcards and alerts. Everything is logged to the patient timeline for audit.',
  },
];

const STAGE_INTERVAL_MS = 2600;

export function AgentFlowShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % stages.length);
    }, STAGE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const active = stages[activeIndex];
  const progressPercent = stages.length > 1 ? (activeIndex / (stages.length - 1)) * 100 : 0;

  return (
    <section
      aria-label="How the multi-agent workflow runs"
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            <Sparkles size={13} aria-hidden="true" />
            Multi-agent workflow
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">
            Three AI agents, one triage pipeline
          </h3>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">
          Runs automatically on every intake
        </span>
      </div>

      <div className="mt-6 overflow-x-auto pb-1">
        <div className="relative min-w-[36rem]">
          {/* Connector track + animated fill */}
          <div className="absolute left-8 right-8 top-6 h-0.5 rounded bg-slate-200" aria-hidden="true" />
          <div
            className="absolute left-8 top-6 h-0.5 rounded bg-gradient-to-r from-emerald-500 to-sky-500 transition-all duration-700 ease-out"
            style={{ width: `calc(${progressPercent} * (100% - 4rem) / 100)` }}
            aria-hidden="true"
          />
          {/* Traveling pulse dot */}
          <div
            className="absolute top-6 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-emerald-500 shadow-[0_0_10px_2px_rgba(16,185,129,0.55)] transition-all duration-700 ease-out"
            style={{ left: `calc(2rem + ${progressPercent} * (100% - 4rem) / 100 - 0.3rem)` }}
            aria-hidden="true"
          />

          <ol className="relative flex items-start justify-between">
            {stages.map((stage, index) => {
              const Icon = stage.icon;
              const isActive = index === activeIndex;
              const isDone = index < activeIndex;
              return (
                <li key={stage.key} className="flex w-24 flex-col items-center text-center">
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all duration-500 ${
                      isActive
                        ? 'scale-110 border-emerald-500 bg-emerald-50 text-emerald-700 shadow-[0_0_0_6px_rgba(16,185,129,0.15)]'
                        : isDone
                          ? 'border-emerald-300 bg-white text-emerald-600'
                          : 'border-slate-200 bg-white text-slate-400'
                    }`}
                  >
                    <Icon size={20} aria-hidden="true" className={isActive ? 'animate-soft-pulse' : undefined} />
                  </span>
                  <p className={`mt-2 text-xs font-semibold ${isActive ? 'text-slate-950' : 'text-slate-500'}`}>
                    {stage.label}
                  </p>
                  <span
                    className={`mt-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide ${
                      stage.kind === 'AI'
                        ? isActive
                          ? 'bg-emerald-600 text-white'
                          : 'bg-emerald-100 text-emerald-700'
                        : isActive
                          ? 'bg-slate-700 text-white'
                          : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {stage.kind === 'AI' ? 'AI AGENT' : 'SYSTEM'}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <div
        key={active.key}
        className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 motion-safe:animate-[fadeSlideIn_0.45s_ease-out]"
      >
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
          <active.icon size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{active.agent}</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-950">{active.headline}</p>
          <p className="mt-1 text-sm leading-5 text-slate-600">{active.detail}</p>
        </div>
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}
