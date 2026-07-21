import {
  Activity,
  BellRing,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  ClipboardPlus,
  Cpu,
  Database,
  Gamepad2,
  Globe,
  KeyRound,
  ListOrdered,
  Server,
  Sparkles,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react';
import { type KeyboardEvent, type WheelEvent, useEffect, useRef, useState } from 'react';

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

const heroHighlights = [
  { icon: Activity, label: 'Triage in seconds' },
  { icon: Globe, label: 'Live literature' },
  { icon: KeyRound, label: 'Explainable agents' },
  { icon: Stethoscope, label: 'Humans stay in charge' },
];

interface ArchNode {
  label: string;
  detail: string;
  icon: LucideIcon;
}

const archTrunk: ArchNode[] = [
  { label: 'React frontend', detail: 'Vite + TypeScript + Tailwind - this workspace', icon: Cpu },
  { label: 'Spring Boot backend', detail: 'JWT-secured REST API that orchestrates every agent', icon: Server },
];

const archBranches: ArchNode[] = [
  { label: 'Spring AI + OpenAI', detail: 'Savi chat, triage scoring, doctor assignment', icon: BrainCircuit },
  { label: 'FastAPI ai-service', detail: 'Python microservice for specialized AI workloads', icon: Sparkles },
];

const archBase: ArchNode = { label: 'PostgreSQL', detail: 'Flyway-migrated schema, full audit trail', icon: Database };

const techGroups: Array<{ group: string; items: string[] }> = [
  { group: 'Frontend', items: ['React', 'Vite', 'TypeScript', 'Tailwind CSS', 'Recharts'] },
  { group: 'Backend', items: ['Spring Boot', 'Spring Security (JWT)', 'Flyway'] },
  { group: 'AI layer', items: ['Spring AI', 'OpenAI', 'FastAPI (Python)'] },
  { group: 'Data', items: ['PostgreSQL'] },
];

const slideMeta = [
  { key: 'story', label: 'The problem' },
  { key: 'pipeline', label: 'How it works' },
  { key: 'architecture', label: 'Architecture' },
  { key: 'stack', label: 'Tech stack' },
  { key: 'team', label: 'Team 8Bit' },
];

const SLIDE_COUNT = slideMeta.length;
const AUTOPLAY_MS = 7000;

/**
 * The left panel of the login screen: a self-navigating "story mode" that tells
 * hackathon judges (and any first-time visitor) what CareFlow AI does, how its
 * agents cooperate, the architecture behind it, the stack, and who built it -
 * before they ever sign in. Navigable three ways: mouse wheel, the progress rail
 * at the bottom, or the up/down arrow buttons - each restarts the autoplay timer.
 */
export function LoginShowcase() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [autoplayKey, setAutoplayKey] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const wheelLockRef = useRef(false);

  const goTo = (index: number) => {
    const next = ((index % SLIDE_COUNT) + SLIDE_COUNT) % SLIDE_COUNT;
    setActiveSlide(next);
    setAutoplayKey((current) => current + 1);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (wheelLockRef.current || Math.abs(event.deltaY) < 8) {
      return;
    }
    wheelLockRef.current = true;
    goTo(activeSlide + (event.deltaY > 0 ? 1 : -1));
    window.setTimeout(() => {
      wheelLockRef.current = false;
    }, 650);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'PageDown') {
      event.preventDefault();
      goTo(activeSlide + 1);
    } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
      event.preventDefault();
      goTo(activeSlide - 1);
    }
  };

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden text-white outline-none"
      tabIndex={0}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      aria-label="CareFlow AI project story - scroll, use arrow keys, or the dots below to navigate"
    >
      {/* Ambient background, shared across all slides */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-28 -right-16 h-80 w-80 rounded-full bg-sky-500/15 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" aria-hidden="true" />

      {/* Up/down nudge buttons */}
      <div className="absolute right-4 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-2 lg:flex">
        <NudgeButton icon={ChevronUp} label="Previous slide" onClick={() => goTo(activeSlide - 1)} />
        <NudgeButton icon={ChevronDown} label="Next slide" onClick={() => goTo(activeSlide + 1)} />
      </div>

      {/* Slide viewport */}
      <div className="relative flex-1 overflow-hidden">
        <div className={`absolute inset-0 p-8 lg:p-10 ${activeSlide === 0 ? 'animate-story-slide-in' : 'hidden'}`}>
          <StorySlide onExplore={() => goTo(1)} />
        </div>
        <div className={`absolute inset-0 p-8 lg:p-10 ${activeSlide === 1 ? 'animate-story-slide-in' : 'hidden'}`}>
          <PipelineSlide active={activeSlide === 1} />
        </div>
        <div className={`absolute inset-0 overflow-y-auto p-8 lg:p-10 ${activeSlide === 2 ? 'animate-story-slide-in' : 'hidden'}`}>
          <ArchitectureSlide />
        </div>
        <div className={`absolute inset-0 overflow-y-auto p-8 lg:p-10 ${activeSlide === 3 ? 'animate-story-slide-in' : 'hidden'}`}>
          <StackSlide />
        </div>
        <div className={`absolute inset-0 p-8 lg:p-10 ${activeSlide === 4 ? 'animate-story-slide-in' : 'hidden'}`}>
          <TeamSlide />
        </div>
      </div>

      {/* Stories-style navigation rail */}
      <div className="relative z-10 flex items-center justify-center gap-1.5 border-t border-white/10 bg-black/10 px-6 py-3.5 backdrop-blur sm:gap-2.5">
        {slideMeta.map((meta, index) => (
          <button
            key={meta.key}
            type="button"
            onClick={() => goTo(index)}
            className="group flex flex-col items-center gap-1.5"
            aria-current={index === activeSlide}
          >
            <span className="relative h-1 w-8 overflow-hidden rounded-full bg-white/15 sm:w-11">
              {index < activeSlide ? <span className="absolute inset-0 rounded-full bg-emerald-400/80" /> : null}
              {index === activeSlide ? (
                <span
                  key={autoplayKey}
                  onAnimationEnd={() => goTo(activeSlide + 1)}
                  style={{ animationPlayState: isPaused ? 'paused' : 'running' }}
                  className="animate-story-fill absolute inset-y-0 left-0 rounded-full bg-emerald-400"
                />
              ) : null}
            </span>
            <span
              className={`hidden text-[10px] font-semibold transition sm:block ${
                index === activeSlide ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
              }`}
            >
              {meta.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function NudgeButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-slate-300 ring-1 ring-inset ring-white/15 transition hover:bg-white/20 hover:text-white"
    >
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}

function StorySlide({ onExplore }: { onExplore: () => void }) {
  return (
    <div className="flex h-full flex-col justify-center">
      <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-emerald-200 ring-1 ring-inset ring-white/15">
        <Sparkles size={13} aria-hidden="true" />
        Built for the OpenAI Agentic AI Hackathon
      </span>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">CareFlow AI</h1>
      <p className="mt-2 max-w-xl text-base font-medium text-emerald-200">
        Agentic hospital triage that thinks in seconds, not minutes.
      </p>
      <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">
        Emergency rooms lose critical minutes to manual triage: complaints are read one by one,
        urgency is guessed, and the queue runs on arrival order. CareFlow AI hands that bottleneck
        to a team of cooperating agents - three of them LLM-powered - that triage every arrival,
        research the condition in live medical literature, sort the queue by real urgency, and
        match the right doctor. Every decision is explained, streamed live, and kept for audit.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {heroHighlights.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-inset ring-white/10">
            <Icon size={15} className="shrink-0 text-emerald-300" aria-hidden="true" />
            <span className="text-xs font-medium text-slate-200">{label}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onExplore}
        className="mt-8 inline-flex w-fit items-center gap-2 text-xs font-semibold text-emerald-200 transition hover:text-emerald-100"
      >
        Scroll, or use the rail below, to see how it works
        <ChevronDown size={14} className="animate-bounce" aria-hidden="true" />
      </button>
    </div>
  );
}

function PipelineSlide({ active }: { active: boolean }) {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = window.setInterval(() => {
      setStageIndex((current) => (current + 1) % pipelineStages.length);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [active]);

  const stage = pipelineStages[stageIndex];
  const progressPercent = (stageIndex / (pipelineStages.length - 1)) * 100;

  return (
    <div className="flex h-full flex-col justify-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">How it works</p>
      <h2 className="mt-1.5 text-2xl font-semibold tracking-tight">Six agents, one seamless pipeline</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
        Every arrival runs through the same cooperating pipeline - three system steps, three AI agents -
        so triage happens the same rigorous way every time.
      </p>

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
              {pipelineStages.map((item, index) => {
                const Icon = item.icon;
                const isActive = index === stageIndex;
                const isDone = index < stageIndex;
                return (
                  <li key={item.key} className="flex w-16 flex-col items-center text-center">
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
                    <p className={`mt-1.5 text-[11px] font-semibold ${isActive ? 'text-white' : 'text-slate-400'}`}>{item.label}</p>
                    <span
                      className={`mt-0.5 rounded-full px-1.5 py-px text-[8px] font-bold tracking-wide ${
                        item.kind === 'AI' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/10 text-slate-300'
                      }`}
                    >
                      {item.kind === 'AI' ? 'AI' : 'SYS'}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <div
          key={stage.key}
          className="animate-story-slide-in mt-4 flex items-start gap-3 rounded-xl bg-white/5 p-4 ring-1 ring-inset ring-white/10 backdrop-blur"
        >
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/90 text-white">
            <stage.icon size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">{stage.agent}</p>
            <p className="mt-0.5 text-sm leading-5 text-slate-200">{stage.detail}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ArchitectureSlide() {
  return (
    <div className="flex h-full flex-col justify-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Architecture</p>
      <h2 className="mt-1.5 text-2xl font-semibold tracking-tight">One backend, two AI layers</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
        The backend orchestrates everything: it calls Spring AI directly for conversational agents,
        hands specialized workloads to a Python microservice, and persists every decision.
      </p>

      <div className="mt-6 flex flex-col items-center">
        {archTrunk.map((node, index) => (
          <div key={node.label} className="w-full max-w-sm">
            <ArchBox node={node} emphasize={index === 1} />
            <Connector />
          </div>
        ))}

        <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          {archBranches.map((node) => (
            <div key={node.label} className="flex flex-col items-center">
              <ArchBox node={node} compact />
              <Connector short />
            </div>
          ))}
        </div>

        <ArchBox node={archBase} emphasize />
      </div>
    </div>
  );
}

function ArchBox({ node, emphasize = false, compact = false }: { node: ArchNode; emphasize?: boolean; compact?: boolean }) {
  const Icon = node.icon;
  return (
    <div
      className={`flex w-full items-center gap-3 rounded-xl p-3.5 ring-1 ring-inset ${
        emphasize
          ? 'animate-flow-pulse bg-emerald-500/10 ring-emerald-300/30'
          : 'bg-white/5 ring-white/10'
      } ${compact ? 'text-sm' : ''}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-emerald-300">
        <Icon size={17} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{node.label}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-300">{node.detail}</p>
      </div>
    </div>
  );
}

function Connector({ short = false }: { short?: boolean }) {
  return (
    <div className={`relative mx-auto w-px bg-white/20 ${short ? 'h-4' : 'h-6'}`} aria-hidden="true">
      <span className="animate-flow-dot absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-emerald-400" />
    </div>
  );
}

function StackSlide() {
  return (
    <div className="flex h-full flex-col justify-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Tech stack</p>
      <h2 className="mt-1.5 text-2xl font-semibold tracking-tight">Built with a proven, boring-on-purpose stack</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
        No exotic dependencies - just tools that scale under hackathon deadlines and beyond.
      </p>

      <div className="mt-6 space-y-4">
        {techGroups.map((group, groupIndex) => (
          <div key={group.group}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{group.group}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {group.items.map((item, itemIndex) => (
                <span
                  key={item}
                  style={{ animationDelay: `${(groupIndex * 4 + itemIndex) * 60}ms` }}
                  className="animate-story-slide-in rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-100 ring-1 ring-inset ring-white/10"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamSlide() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-sky-600 shadow-[0_0_0_6px_rgba(16,185,129,0.12)]">
        <Gamepad2 size={34} aria-hidden="true" />
      </div>
      <h2 className="mt-5 font-mono text-2xl font-bold tracking-widest text-white [text-shadow:2px_2px_0_rgba(16,185,129,0.6)]">
        TEAM 8BIT
      </h2>
      <p className="mt-3 max-w-sm text-sm leading-6 text-slate-300">
        The team behind CareFlow AI - designed and built end to end for the OpenAI Agentic AI Hackathon.
      </p>
      <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-emerald-200 ring-1 ring-inset ring-white/15">
        <Sparkles size={13} aria-hidden="true" />
        Made with care, agents, and too much coffee
      </span>
      <p className="mt-6 animate-pulse font-mono text-[11px] tracking-widest text-emerald-300">
        PRESS LOGIN TO START ▸
      </p>
    </div>
  );
}
