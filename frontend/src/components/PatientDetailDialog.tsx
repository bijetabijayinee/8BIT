import {
  Activity,
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Droplets,
  Gauge,
  HeartPulse,
  Loader2,
  MapPin,
  PlayCircle,
  ShieldAlert,
  Stethoscope,
  Thermometer,
  Wind,
  X,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { ApiError, getIntake, updateQueueStatus } from '../api/client';
import { showToast } from './toast';
import { Avatar } from './Avatar';
import type { IntakeResponse, StaffUser, UrgencyCategory } from '../types/careflow';

interface PatientDetailDialogProps {
  intakeId: string;
  patientDisplayId?: string;
  activeStaff: StaffUser | null;
  onClose: () => void;
  onChanged?: () => void;
}

const urgencyChip: Record<UrgencyCategory, string> = {
  CRITICAL: 'bg-rose-100 text-rose-700 ring-rose-200',
  HIGH: 'bg-amber-100 text-amber-700 ring-amber-200',
  MEDIUM: 'bg-sky-100 text-sky-700 ring-sky-200',
  LOW: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
};

function formatEnum(value?: string | null) {
  if (!value) return '-';
  return value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

/**
 * A compact patient chart popover: live vitals and a well-articulated triage diagnosis,
 * with one-tap "Start treatment". Shared by the waiting-room beds and the top ticker so
 * a patient can be reviewed and actioned from anywhere without leaving the current page.
 */
export function PatientDetailDialog({ intakeId, patientDisplayId, activeStaff, onClose, onChanged }: PatientDetailDialogProps) {
  const [intake, setIntake] = useState<IntakeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setIntake(await getIntake(intakeId));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load patient.');
    } finally {
      setIsLoading(false);
    }
  }, [intakeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const startTreatment = async () => {
    if (!intake) return;
    setIsStarting(true);
    try {
      await updateQueueStatus(intake.patientId, {
        status: 'IN_TREATMENT',
        actorName: activeStaff?.staffCode ?? activeStaff?.displayName ?? 'Care team',
        actorRole: activeStaff?.role ?? 'TRIAGE_NURSE',
      });
      showToast('success', `${intake.patientDisplayId} moved to treatment`);
      onChanged?.();
      onClose();
    } catch (caughtError) {
      if (caughtError instanceof ApiError && caughtError.status === 403) {
        showToast('error', 'Action not allowed', caughtError.message);
      } else {
        showToast('error', 'Unable to start treatment', caughtError instanceof Error ? caughtError.message : undefined);
      }
    } finally {
      setIsStarting(false);
    }
  };

  const assessment = intake?.assessment ?? null;
  const inTreatment = intake?.currentStatus === 'IN_TREATMENT';
  const isClosed = intake?.currentStatus === 'DISCHARGED' || intake?.currentStatus === 'LEFT_WITHOUT_BEING_SEEN';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="animate-message-in mt-8 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl sm:mt-0"
        onClick={(event) => event.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={intake?.patientDisplayId ?? patientDisplayId ?? 'Patient'} kind="patient" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-950">{intake?.patientDisplayId ?? patientDisplayId ?? 'Patient'}</h2>
                {assessment ? (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ring-1 ring-inset ${urgencyChip[assessment.finalCategory]}`}>
                    {assessment.finalCategory} {assessment.finalScore}
                  </span>
                ) : null}
                {intake ? (
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
                    {formatEnum(intake.currentStatus)}
                  </span>
                ) : null}
              </div>
              {intake ? (
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1"><MapPin size={11} aria-hidden="true" />{intake.department}</span>
                  <span className="inline-flex items-center gap-1"><Activity size={11} aria-hidden="true" />{formatEnum(intake.ageBand)}</span>
                  <span className="inline-flex items-center gap-1"><Clock3 size={11} aria-hidden="true" />Distress {intake.painLevel}/10</span>
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-white hover:text-slate-700"
            aria-label="Close patient details"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {isLoading ? (
            <div className="space-y-3">
              <div className="h-20 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
            </div>
          ) : error ? (
            <div className="flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p>{error}</p>
            </div>
          ) : intake ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-950">{intake.chiefComplaint}</p>
                {intake.structuredSymptoms.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {intake.structuredSymptoms.map((symptom) => (
                      <span key={symptom} className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-medium text-sky-800 ring-1 ring-inset ring-sky-100">
                        {symptom}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Vitals grid */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Vitals</p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Vital icon={<HeartPulse size={14} aria-hidden="true" />} label="Heart rate" value={intake.vitals.heartRate} unit="bpm" alert={valueAbove(intake.vitals.heartRate, 110)} />
                  <Vital icon={<Gauge size={14} aria-hidden="true" />} label="Blood pressure" value={bp(intake.vitals.systolicPressure, intake.vitals.diastolicPressure)} />
                  <Vital icon={<Wind size={14} aria-hidden="true" />} label="Resp. rate" value={intake.vitals.respiratoryRate} unit="/min" alert={valueAbove(intake.vitals.respiratoryRate, 24)} />
                  <Vital icon={<Droplets size={14} aria-hidden="true" />} label="SpO2" value={intake.vitals.oxygenSaturation} unit="%" alert={valueBelow(intake.vitals.oxygenSaturation, 94)} />
                  <Vital icon={<Thermometer size={14} aria-hidden="true" />} label="Temp" value={intake.vitals.temperatureC} unit="°C" alert={valueAbove(intake.vitals.temperatureC, 38)} />
                  <Vital icon={<Activity size={14} aria-hidden="true" />} label="Age" value={intake.vitals.age} unit="yr" />
                  <Vital icon={<Activity size={14} aria-hidden="true" />} label="Height" value={intake.vitals.heightCm} unit="cm" />
                  <Vital icon={<Activity size={14} aria-hidden="true" />} label="Weight" value={intake.vitals.weightKg} unit="kg" />
                </div>
              </div>

              {/* Diagnosis */}
              {assessment ? (
                <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-violet-700">
                    <BrainCircuit size={13} aria-hidden="true" />
                    Savi triage diagnosis
                  </p>
                  {assessment.suggestedDiagnosis ? (
                    <p className="mt-1.5 text-sm font-semibold text-slate-900">{assessment.suggestedDiagnosis}</p>
                  ) : null}
                  {assessment.medicalAttentionNote ? (
                    <p className="mt-1 text-xs leading-5 text-slate-700">{assessment.medicalAttentionNote}</p>
                  ) : null}
                  {assessment.staffFacingExplanation ? (
                    <p className="mt-2 text-xs leading-5 text-slate-600">{assessment.staffFacingExplanation}</p>
                  ) : null}
                  {assessment.redFlagIndicators.length > 0 ? (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {assessment.redFlagIndicators.map((flag) => (
                        <span key={flag} className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800 ring-1 ring-inset ring-rose-200">
                          <ShieldAlert size={11} aria-hidden="true" />
                          {flag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-violet-700">
                    <Stethoscope size={12} aria-hidden="true" />
                    Confidence {formatEnum(assessment.confidenceLevel)}
                  </p>
                </div>
              ) : (
                <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-500">No triage assessment recorded yet.</p>
              )}
            </div>
          ) : null}
        </div>

        {/* actions */}
        {intake && !isClosed ? (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-slate-600 transition hover:bg-white"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => void startTreatment()}
              disabled={inTreatment || isStarting}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isStarting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : inTreatment ? <CheckCircle2 size={14} aria-hidden="true" /> : <PlayCircle size={14} aria-hidden="true" />}
              {inTreatment ? 'In treatment' : 'Start treatment'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function valueAbove(value: number | undefined, threshold: number) {
  return typeof value === 'number' && value > threshold;
}
function valueBelow(value: number | undefined, threshold: number) {
  return typeof value === 'number' && value < threshold;
}
function bp(systolic?: number, diastolic?: number) {
  if (systolic == null && diastolic == null) return undefined;
  return `${systolic ?? '-'}/${diastolic ?? '-'}`;
}

function Vital({ icon, label, value, unit, alert = false }: { icon: ReactNode; label: string; value: number | string | undefined; unit?: string; alert?: boolean }) {
  const shown = value === undefined || value === null || value === '' ? '-' : value;
  return (
    <div className={`rounded-lg border p-2.5 ${alert ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'}`}>
      <p className={`inline-flex items-center gap-1 text-[10px] font-medium ${alert ? 'text-rose-600' : 'text-slate-400'}`}>
        {icon}
        {label}
      </p>
      <p className={`mt-0.5 text-sm font-bold tabular-nums ${alert ? 'text-rose-700' : 'text-slate-900'}`}>
        {shown}
        {shown !== '-' && unit ? <span className="ml-0.5 text-[10px] font-medium text-slate-400">{unit}</span> : null}
      </p>
    </div>
  );
}
