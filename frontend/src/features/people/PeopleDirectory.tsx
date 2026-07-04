import { AlertCircle, Pencil, Plus, RefreshCw, Save, Trash2, UsersRound, X } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createStaffUser, deactivateStaffUser, getStaffUsers, updateStaffUser } from '../../api/client';
import type { SaveStaffUserRequest, StaffRole, StaffUser } from '../../types/careflow';

const roleOptions: Array<{ value: StaffRole; label: string }> = [
  { value: 'DOCTOR', label: 'Doctor' },
  { value: 'TRIAGE_NURSE', label: 'Triage nurse' },
  { value: 'CHARGE_NURSE', label: 'Charge nurse' },
  { value: 'INTAKE_STAFF', label: 'Intake staff' },
  { value: 'ADMIN', label: 'Admin' },
];

const directoryTabs: Array<{ label: string; roles: StaffRole[] }> = [
  { label: 'Doctors', roles: ['DOCTOR'] },
  { label: 'Nurses', roles: ['TRIAGE_NURSE', 'CHARGE_NURSE'] },
  { label: 'Staff', roles: ['INTAKE_STAFF', 'ADMIN'] },
];

const emptyForm: SaveStaffUserRequest = {
  displayName: '',
  staffCode: '',
  role: 'DOCTOR',
  department: 'Emergency',
  specialty: 'Emergency Medicine',
  active: true,
};

function formatRole(role: StaffRole) {
  return role
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

function cleanOptional(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function PeopleDirectory({ departments }: { departments: string[] }) {
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [activeTab, setActiveTab] = useState(directoryTabs[0].label);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [form, setForm] = useState<SaveStaffUserRequest>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStaff = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setStaffUsers(await getStaffUsers());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load people.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  const activeRoles = directoryTabs.find((tab) => tab.label === activeTab)?.roles ?? [];
  const visibleStaff = useMemo(
    () => staffUsers.filter((staffUser) => activeRoles.includes(staffUser.role)),
    [activeRoles, staffUsers],
  );

  const startCreate = () => {
    setEditingUser(null);
    setForm({ ...emptyForm, department: departments[0] ?? 'Emergency' });
  };

  const startEdit = (staffUser: StaffUser) => {
    setEditingUser(staffUser);
    setForm({
      displayName: staffUser.displayName,
      staffCode: staffUser.staffCode,
      role: staffUser.role,
      department: staffUser.department ?? departments[0] ?? 'Emergency',
      specialty: staffUser.specialty ?? '',
      active: staffUser.active,
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    const request = {
      displayName: form.displayName.trim(),
      staffCode: cleanOptional(form.staffCode),
      role: form.role,
      department: cleanOptional(form.department),
      specialty: cleanOptional(form.specialty),
      active: form.active ?? true,
    };

    try {
      if (editingUser) {
        await updateStaffUser(editingUser.id, {
          ...request,
          staffCode: request.staffCode ?? editingUser.staffCode,
          active: request.active,
        });
      } else {
        await createStaffUser(request);
      }
      setEditingUser(null);
      setForm({ ...emptyForm, department: departments[0] ?? 'Emergency' });
      await loadStaff();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to save person.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeactivate = async (staffUser: StaffUser) => {
    setError(null);
    try {
      await deactivateStaffUser(staffUser.id);
      await loadStaff();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to deactivate person.');
    }
  };

  return (
    <section aria-labelledby="people-title" className="py-6">
      <div className="flex flex-col gap-4 border-b border-sky-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sky-700">Directory</p>
          <h2 id="people-title" className="mt-1 text-2xl font-semibold text-slate-950">
            Doctors, nurses, and staff
          </h2>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadStaff()}
            disabled={isLoading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-sky-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-sky-50 disabled:opacity-60"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} aria-hidden="true" />
            Refresh
          </button>
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
          >
            <Plus size={16} aria-hidden="true" />
            New
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-5 flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-lg border border-sky-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {directoryTabs.map((tab) => (
              <button
                key={tab.label}
                type="button"
                onClick={() => setActiveTab(tab.label)}
                className={`h-9 rounded-md px-3 text-sm font-medium ${
                  activeTab === tab.label ? 'bg-slate-950 text-white' : 'border border-sky-200 bg-white text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-4 divide-y divide-sky-100">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, index) => <PersonSkeleton key={index} />)
            ) : visibleStaff.length === 0 ? (
              <p className="rounded-md bg-sky-50 p-4 text-sm text-slate-500">No people in this section.</p>
            ) : (
              visibleStaff.map((staffUser) => (
                <article key={staffUser.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{staffUser.displayName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {staffUser.staffCode} - {formatRole(staffUser.role)}
                      {staffUser.specialty ? ` - ${staffUser.specialty}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {staffUser.department ?? 'Any department'} - {staffUser.active ? 'Active' : 'Inactive'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(staffUser)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-sky-200 bg-white text-slate-800 transition hover:bg-sky-50"
                      aria-label={`Edit ${staffUser.displayName}`}
                    >
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeactivate(staffUser)}
                      disabled={!staffUser.active}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Deactivate ${staffUser.displayName}`}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-sky-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UsersRound size={18} className="text-sky-700" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-950">{editingUser ? 'Edit person' : 'New person'}</h3>
            </div>
            {editingUser ? (
              <button
                type="button"
                onClick={startCreate}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sky-200 bg-white text-slate-800 transition hover:bg-sky-50"
                aria-label="Cancel edit"
              >
                <X size={15} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <TextInput label="Name" value={form.displayName} onChange={(value) => setForm((current) => ({ ...current, displayName: value }))} required />
            <TextInput label="Staff code" value={form.staffCode ?? ''} onChange={(value) => setForm((current) => ({ ...current, staffCode: value }))} placeholder="DOCTOR-CARDIO" />

            <label className="text-sm font-medium text-slate-700">
              Role
              <select
                value={form.role}
                onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as StaffRole }))}
                className="input-field"
              >
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-slate-700">
              Department
              <select
                value={form.department ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))}
                className="input-field"
              >
                {departments.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </label>

            <TextInput label="Specialty" value={form.specialty ?? ''} onChange={(value) => setForm((current) => ({ ...current, specialty: value }))} placeholder="Cardiology" />

            <label className="flex items-end gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.active ?? true}
                onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                className="mb-3 h-4 w-4 rounded border-slate-300 accent-sky-600"
              />
              <span className="mb-2">Active</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={16} aria-hidden="true" />
            {isSaving ? 'Saving' : 'Save'}
          </button>
        </form>
      </div>
    </section>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="input-field"
      />
    </label>
  );
}

function PersonSkeleton() {
  return (
    <div className="py-3">
      <div className="h-4 w-40 animate-pulse rounded bg-sky-100" />
      <div className="mt-2 h-3 w-64 animate-pulse rounded bg-sky-100" />
    </div>
  );
}
