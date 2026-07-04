import { Activity, AlertCircle, BarChart3, RefreshCw, ShieldAlert, Timer, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getQueueMetrics } from '../../api/client';
import type { QueueMetrics, UrgencyCategory } from '../../types/careflow';
import { AgentPerformanceSection } from '../agent/AgentPerformanceSection';

const urgencyLabels: Record<UrgencyCategory, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

const urgencyOrder: UrgencyCategory[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export function MetricsDashboard({ refreshSignal = 0 }: { refreshSignal?: number }) {
  const [metrics, setMetrics] = useState<QueueMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setMetrics(await getQueueMetrics());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load dashboard.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics, refreshSignal]);

  const chartData = useMemo(() => {
    if (!metrics) {
      return [];
    }

    return urgencyOrder.map((category) => ({
      urgency: urgencyLabels[category],
      patients: metrics.patientsByUrgency[category] ?? 0,
      averageWait: metrics.averageWaitMinutesByUrgency[category] ?? 0,
      longestWait: metrics.longestWaitMinutesByUrgency[category] ?? 0,
    }));
  }, [metrics]);

  return (
    <section aria-labelledby="dashboard-title" className="py-6">
      <div className="flex flex-col gap-4 border-b border-sky-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sky-700">Dashboard</p>
          <h2 id="dashboard-title" className="mt-1 text-2xl font-semibold text-slate-950">
            Treatment analytics
          </h2>
        </div>

        <button
          type="button"
          onClick={() => void loadMetrics()}
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

      <div className="mt-5 grid gap-4 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => <MetricSkeleton key={index} />)
        ) : metrics ? (
          <>
            <MetricTile icon={Activity} label="Queue load" value={metrics.currentQueueSize} />
            <MetricTile icon={ShieldAlert} label="Critical/high" value={metrics.criticalAndHighWaiting} />
            <MetricTile icon={Timer} label="Longest high wait" value={`${metrics.longestWaitMinutesByUrgency.HIGH ?? 0}m`} />
            <MetricTile icon={BarChart3} label="Overrides" value={metrics.overrideCount} />
          </>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <ChartPanel title="Urgency distribution radar" isLoading={isLoading}>
          <ResponsiveContainer width="100%" height={310}>
            <RadarChart data={chartData}>
              <PolarGrid stroke="#bae6fd" />
              <PolarAngleAxis dataKey="urgency" tick={{ fill: '#334155', fontSize: 12 }} />
              <PolarRadiusAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Radar name="Patients" dataKey="patients" stroke="#0284c7" fill="#38bdf8" fillOpacity={0.35} />
              <Radar name="Longest wait" dataKey="longestWait" stroke="#0f172a" fill="#0f172a" fillOpacity={0.12} />
              <Legend />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Wait-time graph" isLoading={isLoading}>
          <ResponsiveContainer width="100%" height={310}>
            <LineChart data={chartData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0f2fe" />
              <XAxis dataKey="urgency" tick={{ fill: '#334155', fontSize: 12 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="averageWait" name="Average wait" stroke="#0284c7" strokeWidth={3} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="longestWait" name="Longest wait" stroke="#0f172a" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      <AgentPerformanceSection refreshSignal={refreshSignal} />
    </section>
  );
}

interface MetricTileProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
}

function MetricTile({ icon: Icon, label, value }: MetricTileProps) {
  return (
    <article className="rounded-lg border border-sky-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <Icon size={18} className="text-sky-700" aria-hidden />
      </div>
      <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
    </article>
  );
}

function MetricSkeleton() {
  return (
    <article className="rounded-lg border border-sky-100 bg-white p-4 shadow-sm">
      <div className="h-4 w-24 animate-pulse rounded bg-sky-100" />
      <div className="mt-4 h-8 w-16 animate-pulse rounded bg-sky-100" />
    </article>
  );
}

function ChartPanel({ title, isLoading, children }: { title: string; isLoading: boolean; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-sky-100 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      <div className="mt-4 h-[310px]">
        {isLoading ? <div className="h-full animate-pulse rounded bg-sky-100" /> : children}
      </div>
    </div>
  );
}
