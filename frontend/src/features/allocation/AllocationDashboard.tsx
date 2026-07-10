import { AlertCircle, BedDouble, Grid2X2, HeartPulse, ListChecks, RefreshCw, Sparkles, Stethoscope } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getHospitalAllocation } from '../../api/client';
import { Avatar } from '../../components/Avatar';
import { PatientDetailDialog } from '../../components/PatientDetailDialog';
import type { BedAllocation, DoctorAllocation, HospitalAllocation, StaffUser } from '../../types/careflow';

type AllocationView = 'beds' | 'doctors' | 'departments';

function formatEnumLabel(value?: string | null) {
  if (!value) {
    return 'Vacant';
  }
  return value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

function formatWait(minutes: number) {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function AllocationDashboard({ activeStaff = null }: { activeStaff?: StaffUser | null }) {
  const [allocation, setAllocation] = useState<HospitalAllocation | null>(null);
  const [activeView, setActiveView] = useState<AllocationView>('beds');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBed, setSelectedBed] = useState<BedAllocation | null>(null);

  const loadAllocation = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setAllocation(await getHospitalAllocation());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load allocation.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAllocation();
  }, [loadAllocation]);

  const departmentRows = useMemo(() => {
    const rows = new Map<string, { department: string; beds: BedAllocation[]; doctors: DoctorAllocation[] }>();
    allocation?.beds.forEach((bed) => {
      rows.set(bed.department, rows.get(bed.department) ?? { department: bed.department, beds: [], doctors: [] });
      rows.get(bed.department)?.beds.push(bed);
    });
    allocation?.doctors.forEach((doctor) => {
      const department = doctor.department ?? 'Unassigned';
      rows.set(department, rows.get(department) ?? { department, beds: [], doctors: [] });
      rows.get(department)?.doctors.push(doctor);
    });
    return Array.from(rows.values());
  }, [allocation]);

  return (
    <section aria-labelledby="allocation-title" className="py-6">
      <div className="flex flex-col gap-4 border-b border-sky-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sky-700">Hospital allocation</p>
          <h2 id="allocation-title" className="mt-1 text-2xl font-semibold text-slate-950">
            Beds and doctors
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void loadAllocation()}
          disabled={isLoading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-sky-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-sky-50 disabled:opacity-60"
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

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <MetricTile icon={BedDouble} label="Filled beds" value={allocation?.summary.filledBeds ?? 0} tone="bg-rose-50 text-rose-800" />
        <MetricTile icon={BedDouble} label="Vacant beds" value={allocation?.summary.vacantBeds ?? 0} tone="bg-emerald-50 text-emerald-800" />
        <MetricTile icon={Stethoscope} label="Assigned doctors" value={allocation?.summary.filledDoctors ?? 0} tone="bg-indigo-50 text-indigo-800" />
        <MetricTile icon={Stethoscope} label="Vacant doctors" value={allocation?.summary.vacantDoctors ?? 0} tone="bg-amber-50 text-amber-800" />
      </div>

      <div className="mt-5 inline-flex rounded-md border border-sky-200 bg-white p-1 shadow-sm">
        {[
          { value: 'beds', label: 'Beds', icon: Grid2X2 },
          { value: 'doctors', label: 'Doctors', icon: Stethoscope },
          { value: 'departments', label: 'Departments', icon: ListChecks },
        ].map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setActiveView(value as AllocationView)}
            className={`inline-flex h-9 items-center gap-2 rounded px-3 text-sm font-medium transition ${
              activeView === value ? 'bg-slate-950 text-white' : 'text-slate-700 hover:bg-sky-50'
            }`}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {isLoading ? (
          <div className="h-96 animate-pulse rounded-lg border border-sky-100 bg-white" />
        ) : activeView === 'beds' ? (
          <BedGrid beds={allocation?.beds ?? []} onOpenBed={setSelectedBed} />
        ) : activeView === 'doctors' ? (
          <DoctorGrid doctors={allocation?.doctors ?? []} />
        ) : (
          <DepartmentView rows={departmentRows} />
        )}
      </div>

      {selectedBed && selectedBed.intakeId ? (
        <PatientDetailDialog
          intakeId={selectedBed.intakeId}
          patientDisplayId={selectedBed.patientDisplayId ?? undefined}
          activeStaff={activeStaff}
          onChanged={() => void loadAllocation()}
          onClose={() => setSelectedBed(null)}
        />
      ) : null}
    </section>
  );
}

function MetricTile({ icon: Icon, label, value, tone }: { icon: typeof BedDouble; label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-lg border border-sky-100 bg-white p-4 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-md ${tone}`}>
          <Icon size={18} aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

const bedUrgencyTone: Record<string, { headboard: string; blanket: string; text: string }> = {
  CRITICAL: { headboard: 'bg-rose-600', blanket: 'bg-rose-400', text: 'text-rose-700' },
  HIGH: { headboard: 'bg-amber-500', blanket: 'bg-amber-400', text: 'text-amber-700' },
  MEDIUM: { headboard: 'bg-sky-500', blanket: 'bg-sky-400', text: 'text-sky-700' },
  LOW: { headboard: 'bg-emerald-500', blanket: 'bg-emerald-400', text: 'text-emerald-700' },
};

function BedGrid({ beds, onOpenBed }: { beds: BedAllocation[]; onOpenBed: (bed: BedAllocation) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {beds.map((bed) => {
        const tone = bed.filled ? bedUrgencyTone[bed.urgencyCategory ?? 'MEDIUM'] ?? bedUrgencyTone.MEDIUM : null;
        const clickable = bed.filled && !!bed.intakeId;
        return (
          <article
            key={bed.id}
            onClick={clickable ? () => onOpenBed(bed) : undefined}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={clickable ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpenBed(bed);
              }
            } : undefined}
            className={`relative overflow-hidden rounded-2xl border shadow-sm transition ${
              bed.filled ? 'border-slate-200' : 'border-dashed border-emerald-200'
            } ${clickable ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400' : ''}`}
          >
            {/* headboard */}
            <div className={`h-2.5 w-full ${tone ? tone.headboard : 'bg-slate-200'}`} />

            <div className="relative bg-white p-3 pt-5">
              {/* pillow, overlapping the headboard like the head of a hospital bed */}
              <span className="absolute -top-2 left-3 h-5 w-12 rounded-lg border border-slate-200 bg-white shadow-sm" aria-hidden="true" />

              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-950">{bed.label}</p>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    bed.filled ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'
                  }`}
                >
                  {bed.filled ? <HeartPulse size={11} aria-hidden="true" /> : <Sparkles size={11} aria-hidden="true" />}
                  {bed.filled ? 'Occupied' : 'Fresh sheets'}
                </span>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-500">{bed.department}</p>

              {/* mattress body */}
              <div className="mt-3 flex min-h-20 items-start gap-2.5 rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-100">
                {bed.filled && bed.patientDisplayId ? <Avatar name={bed.patientDisplayId} kind="patient" size="sm" /> : null}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{bed.patientDisplayId ?? 'Ready for next patient'}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{bed.chiefComplaint ?? 'No patient assigned'}</p>
                  {bed.filled ? (
                    <p className={`mt-2 text-xs font-semibold ${tone?.text}`}>
                      {formatEnumLabel(bed.urgencyCategory)} - {formatWait(bed.waitingMinutes)}
                    </p>
                  ) : null}
                </div>
              </div>

              {clickable ? (
                <p className="mt-2 text-center text-[11px] font-medium text-sky-600">Tap for vitals & diagnosis</p>
              ) : (
                /* blanket stripe */
                <div className={`mt-3 h-1.5 w-full rounded-full ${tone ? tone.blanket : 'bg-slate-100'}`} />
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function DoctorGrid({ doctors }: { doctors: DoctorAllocation[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {doctors.map((doctor) => (
        <article key={doctor.doctorId} className="rounded-lg border border-sky-100 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">{doctor.displayName}</p>
              <p className="mt-1 text-xs text-slate-500">{doctor.specialty ?? doctor.department ?? doctor.staffCode}</p>
            </div>
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${doctor.filled ? 'bg-indigo-50 text-indigo-800' : 'bg-emerald-50 text-emerald-800'}`}>
              {doctor.filled ? 'Assigned' : 'Vacant'}
            </span>
          </div>
          <div className="mt-4 rounded-md bg-sky-50 p-3">
            <p className="text-sm font-semibold text-slate-900">{doctor.patientDisplayId ?? 'No patient assigned'}</p>
            <p className="mt-1 text-xs text-slate-500">
              {doctor.patientStatus ? `${formatEnumLabel(doctor.patientStatus)} - ${formatEnumLabel(doctor.urgencyCategory)}` : 'Available for matching'}
            </p>
            {doctor.assignmentReason ? <p className="mt-2 text-xs leading-5 text-slate-600">{doctor.assignmentReason}</p> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function DepartmentView({ rows }: { rows: Array<{ department: string; beds: BedAllocation[]; doctors: DoctorAllocation[] }> }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const filledBeds = row.beds.filter((bed) => bed.filled).length;
        const filledDoctors = row.doctors.filter((doctor) => doctor.filled).length;
        const bedPercent = row.beds.length === 0 ? 0 : Math.round((filledBeds / row.beds.length) * 100);
        const doctorPercent = row.doctors.length === 0 ? 0 : Math.round((filledDoctors / row.doctors.length) * 100);
        return (
          <article key={row.department} className="rounded-lg border border-sky-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-950">{row.department}</h3>
              <span className="text-xs font-semibold text-slate-500">
                {filledBeds}/{row.beds.length} beds - {filledDoctors}/{row.doctors.length} doctors
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <UsageBar label="Bed occupancy" value={bedPercent} color="bg-rose-500" />
              <UsageBar label="Doctor allocation" value={doctorPercent} color="bg-indigo-500" />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function UsageBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
