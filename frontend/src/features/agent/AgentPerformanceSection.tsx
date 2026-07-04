import { Activity, BellRing, Bot, Globe, ListOrdered, Loader2, Stethoscope, Zap, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import { getAgentPerformance } from '../../api/client';
import type { AgentPerformance, AgentPerformanceResponse } from '../../types/careflow';

const agentIcon: Record<string, LucideIcon> = {
  PRIORITY_AGENT: ListOrdered,
  ASSIGNMENT_AGENT: Stethoscope,
  NOTIFICATION_AGENT: BellRing,
  RESEARCH_AGENT: Globe,
};

const agentAccent: Record<string, { chart: string; chip: string; ring: string }> = {
  PRIORITY_AGENT: { chart: '#6366f1', chip: 'bg-indigo-50 text-indigo-800 ring-indigo-200', ring: 'text-indigo-600' },
  ASSIGNMENT_AGENT: { chart: '#059669', chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200', ring: 'text-emerald-600' },
  NOTIFICATION_AGENT: { chart: '#0284c7', chip: 'bg-sky-50 text-sky-800 ring-sky-200', ring: 'text-sky-600' },
  RESEARCH_AGENT: { chart: '#d97706', chip: 'bg-amber-50 text-amber-800 ring-amber-200', ring: 'text-amber-600' },
};

function relativeTime(value: string | null) {
  if (!value) {
    return 'No activity yet';
  }
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) {
    return 'Active just now';
  }
  if (minutes < 60) {
    return `Active ${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `Active ${hours}h ${minutes % 60}m ago`;
}

export function AgentPerformanceSection({ refreshSignal = 0 }: { refreshSignal?: number }) {
  const [data, setData] = useState<AgentPerformanceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await getAgentPerformance());
    } catch {
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    void load();
  }, [load, refreshSignal]);

  useEffect(() => {
    const intervalId = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(intervalId);
  }, [load]);

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
            <Bot size={19} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Agent performance</h3>
            <p className="text-sm text-slate-500">How the autonomous agents performed helping triage under time pressure</p>
          </div>
        </div>
        {data ? (
          <div className="hidden gap-2 sm:flex">
            <HeaderStat icon={Activity} label="Patients processed" value={data.patientsProcessed} />
            <HeaderStat icon={Zap} label="Agent actions" value={data.agentActionsTotal} />
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-56 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : !data || data.agents.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No agent activity recorded yet. Create an intake to see the agents work.
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {data.agents.map((agent) => (
            <AgentCard key={agent.code} agent={agent} />
          ))}
        </div>
      )}
    </section>
  );
}

function HeaderStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <Icon size={16} className="text-slate-500" aria-hidden="true" />
      <div>
        <p className="text-lg font-semibold leading-none text-slate-950">{value}</p>
        <p className="mt-0.5 text-[11px] font-medium text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentPerformance }) {
  const Icon = agentIcon[agent.code] ?? Bot;
  const accent = agentAccent[agent.code] ?? agentAccent.PRIORITY_AGENT;
  const chartData = agent.trend.map((point) => ({ label: point.label, count: point.count }));
  const gradientId = `agent-grad-${agent.code}`;

  return (
    <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className={`flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 ${accent.ring}`}>
          <Icon size={19} aria-hidden="true" />
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
            agent.active ? accent.chip : 'bg-slate-100 text-slate-500 ring-slate-200'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${agent.active ? 'bg-current' : 'bg-slate-400'}`} />
          {agent.active ? 'Active' : 'Off'}
        </span>
      </div>

      <h4 className="mt-3 text-sm font-semibold text-slate-950">{agent.name}</h4>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{agent.description}</p>

      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-2xl font-semibold text-slate-950">{agent.totalActions}</p>
          <p className="text-[11px] font-medium text-slate-500">total actions</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-emerald-700">+{agent.actionsLast24h}</p>
          <p className="text-[11px] font-medium text-slate-500">last 24h</p>
        </div>
      </div>

      <div className="mt-2 h-14">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent.chart} stopOpacity={0.35} />
                <stop offset="100%" stopColor={accent.chart} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip
              cursor={{ stroke: accent.chart, strokeWidth: 1 }}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Area type="monotone" dataKey="count" stroke={accent.chart} strokeWidth={2} fill={`url(#${gradientId})`} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] font-medium text-slate-400">
        {relativeTime(agent.lastActiveAt)}
      </p>
    </article>
  );
}

export function AgentPerformanceLoading() {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <Loader2 size={15} className="animate-spin" aria-hidden="true" />
      Loading agent performance...
    </div>
  );
}
