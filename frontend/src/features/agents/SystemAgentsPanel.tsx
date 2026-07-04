import { AlertCircle, Bot, Pencil, Plus, RefreshCw, Save, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { createSystemAgent, getSystemAgents, toggleSystemAgent, updateSystemAgent } from '../../api/client';
import type { SaveSystemAgentRequest, SystemAgent } from '../../types/careflow';

const emptyForm: SaveSystemAgentRequest = {
  code: '',
  name: '',
  taskType: 'ASSIGNMENT',
  description: '',
  instructions: '',
  active: true,
};

const taskTypes = ['ASSIGNMENT', 'PRIORITY', 'NOTIFICATION', 'BRIEFING'];

export function SystemAgentsPanel() {
  const [agents, setAgents] = useState<SystemAgent[]>([]);
  const [editingAgent, setEditingAgent] = useState<SystemAgent | null>(null);
  const [form, setForm] = useState<SaveSystemAgentRequest>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setAgents(await getSystemAgents());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load agents.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const startCreate = () => {
    setEditingAgent(null);
    setForm(emptyForm);
  };

  const startEdit = (agent: SystemAgent) => {
    setEditingAgent(agent);
    setForm({
      code: agent.code,
      name: agent.name,
      taskType: agent.taskType,
      description: agent.description,
      instructions: agent.instructions ?? '',
      active: agent.active,
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      if (editingAgent) {
        await updateSystemAgent(editingAgent.id, form);
      } else {
        await createSystemAgent(form);
      }
      startCreate();
      await loadAgents();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to save agent.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (agent: SystemAgent) => {
    setError(null);
    try {
      await toggleSystemAgent(agent.id, !agent.active);
      await loadAgents();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to update agent.');
    }
  };

  return (
    <section aria-labelledby="agents-title" className="py-6">
      <div className="flex flex-col gap-4 border-b border-sky-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sky-700">System agents</p>
          <h2 id="agents-title" className="mt-1 text-2xl font-semibold text-slate-950">
            Agent workforce
          </h2>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadAgents()}
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

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <div className="grid gap-3 md:grid-cols-2">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-40 animate-pulse rounded-lg bg-sky-100" />)
          ) : (
            agents.map((agent) => (
              <article key={agent.id} className="rounded-lg border border-sky-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{agent.taskType}</p>
                    <h3 className="mt-1 text-base font-semibold text-slate-950">{agent.name}</h3>
                    <p className="mt-1 text-xs text-slate-500">{agent.code}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggle(agent)}
                    className={`inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm font-medium ${
                      agent.active ? 'bg-indigo-50 text-indigo-800' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {agent.active ? <ToggleRight size={18} aria-hidden="true" /> : <ToggleLeft size={18} aria-hidden="true" />}
                    {agent.active ? 'On' : 'Off'}
                  </button>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{agent.description}</p>
                {agent.instructions ? <p className="mt-2 text-xs leading-5 text-slate-500">{agent.instructions}</p> : null}
                <button
                  type="button"
                  onClick={() => startEdit(agent)}
                  className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-sky-200 bg-white px-3 text-sm font-medium text-slate-800 transition hover:bg-sky-50"
                >
                  <Pencil size={15} aria-hidden="true" />
                  Edit
                </button>
              </article>
            ))
          )}
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-sky-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bot size={18} className="text-sky-700" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-950">{editingAgent ? 'Edit agent' : 'New agent'}</h3>
            </div>
            {editingAgent ? (
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

          <div className="mt-4 grid gap-3">
            <TextInput label="Code" value={form.code} onChange={(value) => setForm((current) => ({ ...current, code: value }))} required placeholder="ASSIGNMENT_AGENT" />
            <TextInput label="Name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} required />
            <label className="text-sm font-medium text-slate-700">
              Task
              <select
                value={form.taskType}
                onChange={(event) => setForm((current) => ({ ...current, taskType: event.target.value }))}
                className="input-field"
              >
                {taskTypes.map((taskType) => (
                  <option key={taskType} value={taskType}>
                    {taskType}
                  </option>
                ))}
              </select>
            </label>
            <TextInput label="Description" value={form.description} onChange={(value) => setForm((current) => ({ ...current, description: value }))} required />
            <label className="text-sm font-medium text-slate-700">
              Instructions
              <textarea
                value={form.instructions ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, instructions: event.target.value }))}
                className="input-field h-28 resize-y py-2"
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 accent-sky-600"
              />
              Active
            </label>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
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
