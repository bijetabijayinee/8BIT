import {
  BellRing,
  BookOpenCheck,
  BrainCircuit,
  ClipboardPlus,
  Globe,
  ListOrdered,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Timer,
  UserCheck,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface PipelineStage {
  key: string;
  label: string;
  agent: string;
  kind: 'AI' | 'SYSTEM';
  icon: LucideIcon;
  detail: string;
}

const pipelineStages: PipelineStage[] = [
  {
    key: 'intake',
    label: 'Intake',
    agent: 'Intake workspace',
    kind: 'SYSTEM',
    icon: ClipboardPlus,
    detail: 'A patient arrives. Complaint, symptoms, vitals, and risk flags are captured in seconds.',
  },
  {
    key: 'triage',
    label: 'Triage',
    agent: 'Savi Triage Agent',
    kind: 'AI',
    icon: BrainCircuit,
    detail: 'The LLM weighs the whole clinical picture and returns urgency, a 0-100 severity score, a differential, and red flags.',
  },
  {
    key: 'research',
    label: 'Research',
    agent: 'Medical Research Agent',
    kind: 'AI',
    icon: Globe,
    detail: 'Live PubMed and Europe PMC literature on the suspected condition is summarized into a cited briefing.',
  },
  {
    key: 'sort',
    label: 'Priority',
    agent: 'Priority Agent',
    kind: 'SYSTEM',
    icon: ListOrdered,
    detail: 'The queue re-sorts by urgency, escalations, and wait-time pressure - never by arrival order.',
  },
  {
    key: 'assign',
    label: 'Assign',
    agent: 'Assignment Agent',
    kind: 'AI',
    icon: Stethoscope,
    detail: 'The best-matched doctor is chosen from triage output and research evidence, with a written reason.',
  },
  {
    key: 'notify',
    label: 'Notify',
    agent: 'Notification Agent',
    kind: 'SYSTEM',
    icon: BellRing,
    detail: 'Doctor, intake desk, and triage nurses are alerted instantly. Every decision is logged for audit.',
  },
];

const highlights: Array<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: Timer,
    title: 'Triage in seconds',
    text: 'AI urgency scoring starts the moment intake is submitted - before a form would even be read.',
  },
  {
    icon: BookOpenCheck,
    title: 'Evidence, live',
    text: 'Real citations from PubMed and Europe PMC attached to every patient record.',
  },
  {
    icon: ShieldCheck,
    title: 'Explainable & safe',
    text: 'Every agent decision ships with its reasoning. No prescriptions, no final diagnoses.',
  },
  {
    icon: UserCheck,
    title: 'Humans in charge',
    text: 'Staff can override any priority, reassign any doctor, and switch any agent off.',
  },
];

const techStack = ['OpenAI', 'Spring Boot', 'Spring AI', 'React', 'PostgreSQL', 'Flyway', 'FastAPI'];

const STAGE_INTERVAL_MS = 2400;

/**
 * The left panel of the login screen: tells the project story with an animated
 * multi-agent pipeline so first-time visitors (and hackathon judges) understand
 * what CareFlow AI does before they even sign in.
 */
export function LoginShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % pipelineStages.length);
    }, STAGE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const active = pipelineStages[activeIndex];
  const progressPercent = (activeIndex / (pipelineStages.length - 1)) * 100;

  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden p-8 text-white lg:p-10">
      {/* Ambient background */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-28 -right-16 h-80 w-80 rounded-full bg-sky-500/15 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" aria-hidden="true" />

      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-emerald-200 ring-1 ring-inset ring-white/15">
          <Sparkles size={13} aria-hidden="true" />
          Built for the OpenAI Agentic AI Hackathon
        </span>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
          CareFlow AI
        </h1>
        <p className="mt-2 max-w-xl text-base font-medium text-emerald-200">
          Agentic hospital triage that thinks in seconds, not minutes.
        </p>
        <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">
          Emergency rooms lose critical minutes to manual triage: complaints are read one by one,
          urgency is guessed, and the queue runs on arrival order. CareFlow AI hands that
          bottleneck to a team of cooperating agents - three of them LLM-powered - that triage
          every arrival, research the condition in live medical literature, sort the queue by
          real urgency, and match the right doctor. Every decision is explained, streamed live,
          and kept for audit.
        </p>
      </div>

      {/* Animated pipeline */}
      <div className="relative mt-8">
        <div className="overflow-x-auto pb-1">
          <div className="relative min-w-[30rem]">
            <div className="absolute left-6 right-6 top-5 h-0.5 rounded bg-white/15" aria-hidden="true" />
            <div
              className="absolute left-6 top-5 h-0.5 rounded bg-gradient-to-r from-emerald-400 to-sky-400 transition-all duration-700 ease-out"
              style={{ width: `calc(${progressPercent} * (100% - 3rem) / 100)` }}
              aria-hidden="true"
            />
            <div
              className="absolute top-5 h-2 w-2 -translate-y-1/2 rounded-full bg-emerald-300 shadow-[0_0_10px_2px_rgba(52,211,153,0.7)] transition-all duration-700 ease-out"
              style={{ left: `calc(1.5rem + ${progressPercent} * (100% - 3rem) / 100 - 0.25rem)` }}
              aria-hidden="true"
            />
            <ol className="relative flex items-start justify-between">
              {pipelineStages.map((stage, index) => {
                const Icon = stage.icon;
                const isActive = index === activeIndex;
                const isDone = index < activeIndex;
                return (
                  <li key={stage.key} className="flex w-16 flex-col items-center text-center">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-500 ${
                        isActive
                          ? 'scale-110 border-emerald-300 bg-emerald-400/20 text-emerald-200 shadow-[0_0_0_5px_rgba(52,211,153,0.12)]'
                          : isDone
                            ? 'border-emerald-400/40 bg-white/5 text-emerald-300/80'
                            : 'border-white/15 bg-white/5 text-slate-400'
                      }`}
                    >
                      <Icon size={17} aria-hidden="true" className={isActive ? 'animate-soft-pulse' : undefined} />
                    </span>
                    <p className={`mt-1.5 text-[11px] font-semibold ${isActive ? 'text-white' : 'text-slate-400'}`}>
                      {stage.label}
                    </p>
                    <span
                      className={`mt-0.5 rounded-full px-1.5 py-px text-[8px] font-bold tracking-wide ${
                        stage.kind === 'AI'
                          ? 'bg-emerald-400/20 text-emerald-200'
                          : 'bg-white/10 text-slate-300'
                      }`}
                    >
                      {stage.kind === 'AI' ? 'AI' : 'SYS'}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <div
          key={active.key}
          className="mt-4 flex items-start gap-3 rounded-xl bg-white/5 p-4 ring-1 ring-inset ring-white/10 backdrop-blur motion-safe:animate-[loginFadeIn_0.45s_ease-out]"
        >
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/90 text-white">
            <active.icon size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">{active.agent}</p>
            <p className="mt-0.5 text-sm leading-5 text-slate-200">{active.detail}</p>
          </div>
        </div>
      </div>

      {/* Highlights */}
      <div className="relative mt-8 grid gap-3 sm:grid-cols-2">
        {highlights.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-xl bg-white/5 p-3.5 ring-1 ring-inset ring-white/10">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <Icon size={15} className="text-emerald-300" aria-hidden="true" />
              {title}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-300">{text}</p>
          </div>
        ))}
      </div>

      <div className="relative mt-8 flex flex-wrap items-center gap-2">
        <Zap size={13} className="text-emerald-300" aria-hidden="true" />
        {techStack.map((tech) => (
          <span key={tech} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-200 ring-1 ring-inset ring-white/10">
            {tech}
          </span>
        ))}
        <span className="ml-auto text-[11px] text-slate-400">Made with ❤️ by Team 8Bit</span>
      </div>

      <style>{`
        @keyframes loginFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
