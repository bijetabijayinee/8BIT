import {
  Activity,
  AlertCircle,
  ClipboardList,
  ClipboardPlus,
  HeartPulse,
  Loader2,
  RotateCcw,
  Save,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  UserRound,
} from 'lucide-react';
import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { createIntake, draftSymptomNotes, getNextPatientDisplayId } from '../../api/client';
import { AgentWorkflowPanel } from './AgentWorkflowPanel';
import type {
  AgeBand,
  ArrivalMode,
  CreateIntakeRequest,
  IntakeResponse,
  QueueStatus,
  RiskFlags,
  StaffUser,
  Vitals,
} from '../../types/careflow';

const ageBands: Array<{ value: AgeBand; label: string }> = [
  { value: 'ADULT', label: 'Adult' },
  { value: 'CHILD', label: 'Child' },
  { value: 'OLDER_ADULT', label: 'Senior citizen' },
];

const arrivalModes: Array<{ value: ArrivalMode; label: string }> = [
  { value: 'WALK_IN', label: 'Walk-in' },
  { value: 'AMBULANCE', label: 'Ambulance' },
  { value: 'TRANSFER', label: 'Transfer' },
  { value: 'REFERRAL', label: 'Referral' },
];

const intakeStatuses: Array<{ value: QueueStatus; label: string }> = [
  { value: 'WAITING', label: 'Waiting' },
  { value: 'IN_TRIAGE', label: 'In triage' },
];

const distressLevels = [
  { value: 0, label: 'None observed' },
  { value: 3, label: 'Mild distress' },
  { value: 6, label: 'Moderate distress' },
  { value: 9, label: 'Severe distress' },
];

const riskFlagOptions: Array<{ key: keyof RiskFlags; label: string }> = [
  { key: 'chestPain', label: 'Chest pain or cardiac symptoms' },
  { key: 'breathingDifficulty', label: 'Breathing difficulty or low oxygen signs' },
  { key: 'alteredMentalState', label: 'Confusion, fainting, seizure, or stroke signs' },
  { key: 'severeBleeding', label: 'Severe bleeding, burns, wound, or infection signs' },
  { key: 'pregnancy', label: 'Pregnancy or obstetric concern' },
  { key: 'pediatricRisk', label: 'Child, infant, or age-specific concern' },
  { key: 'fallOrTrauma', label: 'Fall, trauma, fracture, or head injury' },
  { key: 'immunocompromised', label: 'Fever, dehydration, immune risk, or chronic illness' },
];

const symptomChips = [
  'fever',
  'vomiting',
  'abdominal pain',
  'headache',
  'dizziness',
  'weakness',
  'rash',
  'seizure',
  'dehydration',
  'swelling',
  'back pain',
  'urinary symptoms',
];

const emptyRiskFlags: RiskFlags = {
  chestPain: false,
  breathingDifficulty: false,
  alteredMentalState: false,
  severeBleeding: false,
  pregnancy: false,
  pediatricRisk: false,
  fallOrTrauma: false,
  immunocompromised: false,
};

const defaultVitals: Vitals = {};

const genderOptions = [
  { value: '', label: 'Not disclosed' },
  { value: 'Female', label: 'Female' },
  { value: 'Male', label: 'Male' },
  { value: 'Other', label: 'Other' },
];

interface IntakeFormState {
  patientName: string;
  gender: string;
  contactPhone: string;
  ageBand: AgeBand;
  arrivalTimestamp: string;
  arrivalMode: ArrivalMode;
  chiefComplaint: string;
  symptomNotes: string;
  structuredSymptoms: string;
  distressScore: number;
  vitals: Vitals;
  riskFlags: RiskFlags;
  department: string;
  currentStatus: QueueStatus;
}

interface IntakeFormProps {
  departments: string[];
  activeStaff: StaffUser | null;
  onCreated?: () => void;
}

function toDateTimeLocalValue(date: Date) {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function createInitialState(departments: string[]): IntakeFormState {
  return {
    patientName: '',
    gender: '',
    contactPhone: '',
    ageBand: 'ADULT',
    arrivalTimestamp: toDateTimeLocalValue(new Date()),
    arrivalMode: 'WALK_IN',
    chiefComplaint: '',
    symptomNotes: '',
    structuredSymptoms: '',
    distressScore: 0,
    vitals: { ...defaultVitals },
    riskFlags: { ...emptyRiskFlags },
    department: departments[0] ?? 'Emergency',
    currentStatus: 'WAITING',
  };
}

function parseNumberInput(value: string) {
  if (value === '') {
    return undefined;
  }

  return Number(value);
}

function normalizeOptionalText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function formatEnumLabel(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

export function IntakeForm({ departments, activeStaff, onCreated }: IntakeFormProps) {
  const [form, setForm] = useState<IntakeFormState>(() => createInitialState(departments));
  const [patientDisplayId, setPatientDisplayId] = useState('Generating...');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdIntake, setCreatedIntake] = useState<IntakeResponse | null>(null);
  const [workflowPatientId, setWorkflowPatientId] = useState<string | null>(null);
  const [isDraftingNotes, setIsDraftingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  const structuredSymptoms = useMemo(
    () =>
      form.structuredSymptoms
        .split(',')
        .map((symptom) => symptom.trim())
        .filter(Boolean),
    [form.structuredSymptoms],
  );

  useEffect(() => {
    setForm((current) => {
      if (current.department || departments.length === 0) {
        return current;
      }

      return { ...current, department: departments[0] };
    });
  }, [departments]);

  const refreshPatientDisplayId = async () => {
    try {
      setPatientDisplayId(await getNextPatientDisplayId());
    } catch {
      setPatientDisplayId(`CF-${Date.now().toString().slice(-8)}`);
    }
  };

  useEffect(() => {
    void refreshPatientDisplayId();
  }, []);

  const updateField = <TKey extends keyof IntakeFormState>(key: TKey, value: IntakeFormState[TKey]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateVitals = (key: keyof Vitals, value: string) => {
    setForm((current) => ({
      ...current,
      vitals: {
        ...current.vitals,
        [key]: parseNumberInput(value),
      },
    }));
  };

  const updateRiskFlag = (key: keyof RiskFlags, checked: boolean) => {
    setForm((current) => ({
      ...current,
      riskFlags: {
        ...current.riskFlags,
        [key]: checked,
      },
    }));
  };

  const resetForm = () => {
    setForm(createInitialState(departments));
    void refreshPatientDisplayId();
    setError(null);
    setSuccessMessage(null);
    setCreatedIntake(null);
    setWorkflowPatientId(null);
  };

  const buildRequest = (): CreateIntakeRequest => ({
    patientDisplayId: patientDisplayId.startsWith('Generating') ? undefined : patientDisplayId,
    patientName: form.patientName.trim(),
    gender: normalizeOptionalText(form.gender),
    contactPhone: form.contactPhone.trim(),
    ageBand: form.ageBand,
    arrivalTimestamp: new Date(form.arrivalTimestamp).toISOString(),
    arrivalMode: form.arrivalMode,
    chiefComplaint: form.chiefComplaint.trim(),
    symptomNotes: normalizeOptionalText(form.symptomNotes),
    structuredSymptoms,
    painLevel: form.distressScore,
    vitals: form.vitals,
    riskFlags: form.riskFlags,
    department: form.department,
    currentStatus: form.currentStatus,
    staffName: activeStaff?.staffCode ?? activeStaff?.displayName,
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    setWorkflowPatientId(patientDisplayId.startsWith('Generating') ? null : patientDisplayId);

    try {
      const created = await createIntake(buildRequest());
      setCreatedIntake(created);
      setWorkflowPatientId(created.patientDisplayId);
      setSuccessMessage(
        `${created.patientDisplayId} added to the queue with LLM urgency ${created.assessment?.finalCategory ?? 'pending'}.`,
      );
      setForm(createInitialState(departments));
      await refreshPatientDisplayId();
      onCreated?.();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to create intake.');
      setWorkflowPatientId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTextChange =
    (key: keyof IntakeFormState) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      updateField(key, event.target.value as never);
    };

  const generateSymptomNotes = async () => {
    setIsDraftingNotes(true);
    setNotesError(null);
    try {
      const notes = await draftSymptomNotes({
        chiefComplaint: form.chiefComplaint.trim(),
        structuredSymptoms,
        clinicalDistressScore: form.distressScore,
        vitals: form.vitals,
        riskFlags: form.riskFlags,
        ageBand: form.ageBand,
        arrivalMode: form.arrivalMode,
        department: form.department,
      });
      updateField('symptomNotes', notes);
    } catch (caughtError) {
      setNotesError(caughtError instanceof Error ? caughtError.message : 'Could not draft notes right now.');
    } finally {
      setIsDraftingNotes(false);
    }
  };

  const toggleSymptom = (symptom: string) => {
    const nextSymptoms = new Set(structuredSymptoms);
    if (nextSymptoms.has(symptom)) {
      nextSymptoms.delete(symptom);
    } else {
      nextSymptoms.add(symptom);
    }
    updateField('structuredSymptoms', Array.from(nextSymptoms).join(', '));
  };

  return (
    <section aria-labelledby="intake-title" className="py-6">
      <form onSubmit={handleSubmit} className="relative border-b border-sky-100 pb-6">
        {workflowPatientId ? (
          <AgentWorkflowPanel
            patientDisplayId={workflowPatientId}
            isSubmitting={isSubmitting}
            onDismiss={() => setWorkflowPatientId(null)}
          />
        ) : null}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-sky-700">Patient intake</p>
            <h2 id="intake-title" className="mt-1 text-2xl font-semibold text-slate-950">
              Register arrival
            </h2>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-sky-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-sky-50"
            >
              <RotateCcw size={16} aria-hidden="true" />
              Reset
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={16} aria-hidden="true" />
              {isSubmitting ? 'Saving' : 'Save intake'}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-5 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : null}

        {successMessage ? (
          <div className="mt-5 flex items-start gap-3 rounded-md border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
            <ClipboardPlus size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>{successMessage}</p>
          </div>
        ) : null}

        {createdIntake?.assessment ? (
          <div className="mt-5 min-w-0 rounded-lg border border-emerald-200 bg-white p-4 shadow-sm animate-message-in">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-700 text-white animate-soft-pulse">
                <Stethoscope size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">LLM intake assessment</p>
                <p className="mt-1 break-words text-sm leading-6 text-slate-600">
                  {createdIntake.assessment.suggestedDiagnosis ?? 'No suggested diagnosis returned.'}
                </p>
              </div>
            </div>
            <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-3">
              <AssessmentTile
                icon={<Activity size={16} aria-hidden="true" />}
                label="Urgency"
                value={`${formatEnumLabel(createdIntake.assessment.finalCategory)} - ${createdIntake.assessment.finalScore}`}
              />
              <AssessmentTile
                icon={<ClipboardPlus size={16} aria-hidden="true" />}
                label="Attention"
                value={createdIntake.assessment.medicalAttentionNote ?? 'Not recorded'}
              />
              <AssessmentTile
                icon={<AlertCircle size={16} aria-hidden="true" />}
                label="Confidence"
                value={formatEnumLabel(createdIntake.assessment.confidenceLevel)}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <FormBlock title="Patient & arrival" icon={<UserRound size={15} aria-hidden="true" />} tint="bg-sky-100 text-sky-700">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-sky-200 bg-gradient-to-br from-sky-50 to-emerald-50 px-3 py-2 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-normal text-sky-700">Patient ID</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{patientDisplayId}</p>
              </div>

              <TextInput label="Full name" value={form.patientName} onChange={handleTextChange('patientName')} placeholder="Patient full name" required />
              <SelectInput label="Gender" value={form.gender} onChange={(value) => updateField('gender', value)} options={genderOptions} />
              <TextInput label="Contact phone" value={form.contactPhone} onChange={handleTextChange('contactPhone')} placeholder="+91 98765 43210" required />

              <label className="text-sm font-medium text-slate-700">
                Department
                <select
                  required
                  value={form.department}
                  onChange={(event) => updateField('department', event.target.value)}
                  className="input-field"
                >
                  {departments.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </label>

              <SelectInput label="Age band" value={form.ageBand} onChange={(value) => updateField('ageBand', value as AgeBand)} options={ageBands} />
              <SelectInput label="Arrival mode" value={form.arrivalMode} onChange={(value) => updateField('arrivalMode', value as ArrivalMode)} options={arrivalModes} />

              <label className="text-sm font-medium text-slate-700">
                Arrival time
                <input required type="datetime-local" value={form.arrivalTimestamp} onChange={handleTextChange('arrivalTimestamp')} className="input-field" />
              </label>

              <SelectInput label="Initial status" value={form.currentStatus} onChange={(value) => updateField('currentStatus', value as QueueStatus)} options={intakeStatuses} />
            </div>
          </FormBlock>

          <FormBlock title="Presentation" icon={<ClipboardList size={15} aria-hidden="true" />} tint="bg-violet-100 text-violet-700">
            <div className="grid gap-3">
              <TextInput label="Chief complaint" value={form.chiefComplaint} onChange={handleTextChange('chiefComplaint')} required placeholder="Chest pressure and nausea" />
              <TextInput label="Structured symptoms" value={form.structuredSymptoms} onChange={handleTextChange('structuredSymptoms')} placeholder="shortness of breath, nausea" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Common symptom quick add</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {symptomChips.map((symptom) => {
                    const active = structuredSymptoms.includes(symptom);
                    return (
                      <button
                        key={symptom}
                        type="button"
                        onClick={() => toggleSymptom(symptom)}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition ${
                          active
                            ? 'bg-slate-950 text-white ring-slate-950'
                            : 'bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {symptom}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="text-sm font-medium text-slate-700">
                <div className="flex items-center justify-between gap-2">
                  <span>Intake notes</span>
                  <button
                    type="button"
                    onClick={() => void generateSymptomNotes()}
                    disabled={isDraftingNotes || !form.chiefComplaint.trim()}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full bg-violet-100 px-2.5 text-[11px] font-semibold text-violet-800 ring-1 ring-inset ring-violet-200 transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
                    title={form.chiefComplaint.trim() ? 'Draft notes with Savi from the fields already filled' : 'Fill the chief complaint first'}
                  >
                    {isDraftingNotes ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Sparkles size={12} aria-hidden="true" />}
                    {isDraftingNotes ? 'Drafting...' : 'Generate with Savi'}
                  </button>
                </div>
                <textarea
                  value={form.symptomNotes}
                  onChange={handleTextChange('symptomNotes')}
                  rows={3}
                  className="input-field h-auto resize-y py-2"
                  placeholder="Objective observations - or generate from the fields already filled"
                />
                {notesError ? <p className="mt-1 text-xs font-normal text-rose-700">{notesError}</p> : null}
              </div>

              <label className="text-sm font-medium text-slate-700">
                Clinical distress
                <select
                  value={form.distressScore}
                  onChange={(event) => updateField('distressScore', Number(event.target.value))}
                  className="input-field"
                >
                  {distressLevels.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </FormBlock>
        </div>

        <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <FormBlock
            title="Vitals"
            icon={<HeartPulse size={15} aria-hidden="true" />}
            tint="bg-rose-100 text-rose-700"
            action={
              <button
                type="button"
                onClick={() => updateField('vitals', { ...defaultVitals })}
                className="inline-flex h-7 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 text-[11px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-200"
                title="Clear vitals"
              >
                <RotateCcw size={11} aria-hidden="true" />
                Clear
              </button>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <VitalInput label="Age" value={form.vitals.age} onChange={(value) => updateVitals('age', value)} />
              <VitalInput label="Height cm" value={form.vitals.heightCm} onChange={(value) => updateVitals('heightCm', value)} step="0.1" />
              <VitalInput label="Weight kg" value={form.vitals.weightKg} onChange={(value) => updateVitals('weightKg', value)} step="0.1" />
              <VitalInput label="Temp C" value={form.vitals.temperatureC} onChange={(value) => updateVitals('temperatureC', value)} step="0.1" />
              <VitalInput label="Heart rate" value={form.vitals.heartRate} onChange={(value) => updateVitals('heartRate', value)} />
              <VitalInput label="Systolic" value={form.vitals.systolicPressure} onChange={(value) => updateVitals('systolicPressure', value)} />
              <VitalInput label="Diastolic" value={form.vitals.diastolicPressure} onChange={(value) => updateVitals('diastolicPressure', value)} />
              <VitalInput label="Resp rate" value={form.vitals.respiratoryRate} onChange={(value) => updateVitals('respiratoryRate', value)} />
              <VitalInput label="SpO2" value={form.vitals.oxygenSaturation} onChange={(value) => updateVitals('oxygenSaturation', value)} />
            </div>
          </FormBlock>

          <FormBlock title="Risk flags" icon={<ShieldAlert size={15} aria-hidden="true" />} tint="bg-amber-100 text-amber-700">
            <div className="grid gap-2 sm:grid-cols-2">
              {riskFlagOptions.map((option) => (
                <label
                  key={option.key}
                  className="flex min-h-10 items-center gap-2 rounded-md border border-sky-100 bg-sky-50 px-3 text-sm font-medium text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={form.riskFlags[option.key]}
                    onChange={(event) => updateRiskFlag(option.key, event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-sky-600"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </FormBlock>
        </div>
      </form>
    </section>
  );
}

interface FormBlockProps {
  title: string;
  icon?: ReactNode;
  tint?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

function FormBlock({ title, icon, tint = 'bg-slate-100 text-slate-700', action, className = '', children }: FormBlockProps) {
  return (
    <fieldset className={`min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon ? <span className={`flex h-7 w-7 items-center justify-center rounded-md ${tint}`}>{icon}</span> : null}
          <legend className="text-sm font-semibold text-slate-900">{title}</legend>
        </div>
        {action ?? null}
      </div>
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}

function AssessmentTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-slate-50 p-3">
      <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-slate-500">
        {icon}
        {label}
      </dt>
      <dd className="mt-2 break-words text-sm leading-6 text-slate-800">{value}</dd>
    </div>
  );
}

interface TextInputProps {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
}

function TextInput({ label, value, onChange, placeholder, required }: TextInputProps) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input required={required} value={value} onChange={onChange} placeholder={placeholder} className="input-field" />
    </label>
  );
}

interface SelectInputProps {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

function SelectInput({ label, value, options, onChange }: SelectInputProps) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="input-field">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface VitalInputProps {
  label: string;
  value?: number;
  onChange: (value: string) => void;
  step?: string;
}

function VitalInput({ label, value, onChange, step = '1' }: VitalInputProps) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input type="number" value={value ?? ''} onChange={(event) => onChange(event.target.value)} step={step} className="input-field" />
    </label>
  );
}

