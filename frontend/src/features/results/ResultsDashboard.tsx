import { Activity, AlertCircle, BrainCircuit, CheckCircle2, Clock, Globe, RefreshCw, Stethoscope, TimerReset, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getResultsAnalytics } from '../../api/client';
import type { ResultsAnalytics } from '../../types/careflow';

const urgencyColor: Record<string, string> = {
  CRITICAL: '#e11d48',
  HIGH: '#f59e0b',
  MEDIUM: '#0ea5e9',
  LOW: '#10b981',
};
const departmentColor = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

export function ResultsDashboard() {
  const [data, setData] = useState<ResultsAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await getResultsAnalytics());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load results.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const throughput = useMemo(() => data?.dailyThroughput ?? [], [data]);
  const peakDay = useMemo(
    () => throughput.reduce((max, point) => (point.count > max ? point.count : max), 0),
    [throughput],
  );
  const maxDoctorLoad = useMemo(
    () => (data ? data.doctorLoad.reduce((max, doctor) => Math.max(max, doctor.patients), 0) : 0),
    [data],
  );

  return (
    <section aria-labelledby="results-title" className="py-6">
      <div className="flex flex-col gap-4 border-b border-sky-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sky-700">Results & impact</p>
          <h2 id="results-title" className="mt-1 text-2xl font-semibold text-slate-950">
            Last 30 days of agentic triage
          </h2>
          <p className="mt-1 text-sm text-slate-500">Real throughput, load balance, and time reclaimed versus manual triage.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-sky-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-sky-50 disabled:opacity-60"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mt-5 flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : null}

      {isLoading || !data ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {/* Time-saved hero */}
          <TimeSavedHero data={data} />

          {/* Stat tiles */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile icon={Users} label="Patients processed" value={data.patientsProcessed} accent="text-sky-700" />
            <StatTile icon={CheckCircle2} label="Treated & discharged" value={data.patientsDischarged} accent="text-emerald-700" />
            <StatTile icon={Activity} label="Agent actions" value={data.agentActions} accent="text-indigo-700" />
            <StatTile icon={Globe} label="Research coverage" value={`${data.researchCoveragePercent}%`} accent="text-violet-700" />
          </div>

          {/* Daily throughput */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-950">Daily patient throughput</h3>
              <span className="text-xs font-medium text-slate-500">Peak {peakDay} / day</span>
            </div>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={throughput} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="throughputFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} interval={4} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Area type="monotone" dataKey="count" name="Patients" stroke="#0284c7" strokeWidth={2.5} fill="url(#throughputFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Urgency mix */}
            <MixChart title="Urgency distribution" data={data.urgencyMix} colorFor={(label) => urgencyColor[label] ?? '#94a3b8'} />
            {/* Department mix */}
            <MixChart title="Patients by department" data={data.departmentMix} colorFor={(_, index) => departmentColor[index % departmentColor.length]} />
          </div>

          {/* Doctor load balance */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-white">
                <Stethoscope size={17} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Load balance across doctors</h3>
                <p className="text-xs text-slate-500">Patients handled per doctor — spread evenly, not funnelled to one.</p>
              </div>
            </div>
            <div className="mt-4 space-y-2.5">
              {data.doctorLoad.map((doctor) => (
                <div key={doctor.name} className="flex items-center gap-3">
                  <div className="w-40 shrink-0 truncate text-sm font-medium text-slate-800" title={doctor.name}>
                    {doctor.name}
                    <span className="ml-1 text-[11px] text-slate-400">{doctor.specialty}</span>
                  </div>
                  <div className="h-6 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="flex h-full items-center justify-end rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 px-2 text-[11px] font-bold text-white transition-all"
                      style={{ width: `${maxDoctorLoad ? Math.max(12, (doctor.patients / maxDoctorLoad) * 100) : 0}%` }}
                    >
                      {doctor.patients}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function TimeSavedHero({ data }: { data: ResultsAnalytics }) {
  const { timeSaved } = data;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-lg sm:p-7">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-emerald-200 ring-1 ring-inset ring-white/15">
            <TimerReset size={13} aria-hidden="true" />
            Clinician time reclaimed
          </p>
          <p className="mt-4 text-5xl font-semibold tracking-tight">
            {timeSaved.hoursSaved}
            <span className="ml-2 text-2xl font-medium text-emerald-200">hours saved</span>
          </p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
            Across {timeSaved.patients} patients this month, versus a manual triage baseline of{' '}
            {timeSaved.manualMinutesPerPatient} min each.
          </p>
        </div>

        {/* Transparent formula */}
        <div className="w-full max-w-sm rounded-xl bg-white/5 p-4 ring-1 ring-inset ring-white/10 backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">How it's calculated</p>
          <dl className="mt-2.5 space-y-1.5 text-xs">
            <FormulaRow icon={BrainCircuit} label="Manual triage" value={`${timeSaved.manualTriageMin} min`} />
            <FormulaRow icon={Globe} label="Manual research" value={`${timeSaved.manualResearchMin} min`} />
            <FormulaRow icon={Stethoscope} label="Manual doctor match" value={`${timeSaved.manualAssignMin} min`} />
            <div className="my-1.5 h-px bg-white/10" />
            <FormulaRow label="Manual total" value={`${timeSaved.manualMinutesTotal.toLocaleString()} min`} strong />
            <FormulaRow icon={Clock} label={`CareFlow (~${timeSaved.aiSecondsPerPatient}s/patient)`} value={`${timeSaved.aiMinutesTotal} min`} />
            <FormulaRow label="Net saved" value={`${timeSaved.minutesSaved.toLocaleString()} min`} strong accent />
          </dl>
        </div>
      </div>
    </div>
  );
}

function FormulaRow({
  icon: Icon,
  label,
  value,
  strong = false,
  accent = false,
}: {
  icon?: typeof Clock;
  label: string;
  value: string;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={`inline-flex items-center gap-1.5 ${strong ? 'font-semibold text-white' : 'text-slate-300'}`}>
        {Icon ? <Icon size={12} className="text-slate-400" aria-hidden="true" /> : <span className="w-3" />}
        {label}
      </dt>
      <dd className={`font-mono tabular-nums ${accent ? 'font-bold text-emerald-300' : strong ? 'font-semibold text-white' : 'text-slate-200'}`}>
        {value}
      </dd>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, accent }: { icon: typeof Activity; label: string; value: number | string; accent: string }) {
  return (
    <article className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
      </div>
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 ${accent} ring-1 ring-inset ring-slate-100`}>
        <Icon size={20} aria-hidden="true" />
      </span>
    </article>
  );
}

function MixChart({
  title,
  data,
  colorFor,
}: {
  title: string;
  data: Array<{ label: string; count: number }>;
  colorFor: (label: string, index: number) => string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#334155', fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
            <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
            <Bar dataKey="count" name="Patients" radius={[6, 6, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={entry.label} fill={colorFor(entry.label, index)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
