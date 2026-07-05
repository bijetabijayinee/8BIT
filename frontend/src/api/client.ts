import type {
  AgentDashboard,
  AgentPerformanceResponse,
  AssignDoctorRequest,
  AiChatRequest,
  AiChatResponse,
  CreateThreadCommentRequest,
  CreateIntakeRequest,
  IntakeResponse,
  HospitalAllocation,
  HospitalChatMessage,
  KnowledgeDocument,
  PatientDirectoryEntry,
  PatientReportResponse,
  PatientStory,
  QueueMetrics,
  QueueEntry,
  QueueFilters,
  SaveStaffUserRequest,
  RemoveQueueEntryRequest,
  SaveSystemAgentRequest,
  StaffNotification,
  StaffRole,
  StaffUser,
  SystemAgent,
  ThreadComment,
  UpdatePlacementRequest,
  UpdateQueueStatusRequest,
} from '../types/careflow';

import { getToken, handleSessionExpired } from './auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function friendlyErrorMessage(status: number, body: string) {
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    if (parsed.message && parsed.message.trim()) {
      return parsed.message.trim();
    }
    if (parsed.error && parsed.error.trim()) {
      return parsed.error.trim();
    }
  } catch {
    if (body.trim() && !body.trim().startsWith('{') && !body.trim().startsWith('<')) {
      return body.trim();
    }
  }
  if (status === 403) {
    return 'This action is not allowed for your current role.';
  }
  if (status === 404) {
    return 'The requested record was not found.';
  }
  if (status === 409) {
    return 'This conflicts with an existing record.';
  }
  return `Request failed with status ${status}.`;
}

export async function apiRequest<TResponse>(path: string, init?: ApiRequestOptions): Promise<TResponse> {
  const { timeoutMs, ...requestInit } = init ?? {};
  const controller = timeoutMs ? new AbortController() : null;
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...requestInit.headers,
      },
      ...requestInit,
      signal: controller?.signal ?? requestInit.signal,
    });

    if (response.status === 401 && getToken()) {
      handleSessionExpired();
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ApiError(response.status, friendlyErrorMessage(response.status, body));
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    return response.json() as Promise<TResponse>;
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  }
}

export function getQueueEntries(filters: QueueFilters = {}) {
  const params = new URLSearchParams();

  if (filters.category) {
    params.set('category', filters.category);
  }

  if (filters.department) {
    params.set('department', filters.department);
  }

  if (filters.status) {
    params.set('status', filters.status);
  }

  const query = params.toString();
  return apiRequest<QueueEntry[]>(`/api/queue${query ? `?${query}` : ''}`);
}

export function createIntake(request: CreateIntakeRequest) {
  return apiRequest<IntakeResponse>('/api/intakes', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getNextPatientDisplayId() {
  const response = await apiRequest<{ patientDisplayId: string }>('/api/intakes/next-patient-display-id');
  return response.patientDisplayId;
}

export function getIntake(intakeId: string) {
  return apiRequest<IntakeResponse>(`/api/intakes/${intakeId}`);
}

export function updateQueueStatus(patientId: string, request: UpdateQueueStatusRequest) {
  return apiRequest<QueueEntry>(`/api/queue/${patientId}/status`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export function updateQueuePlacement(patientId: string, request: UpdatePlacementRequest) {
  return apiRequest<QueueEntry>(`/api/queue/${patientId}/placement`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export function assignQueueDoctor(patientId: string, request: AssignDoctorRequest) {
  return apiRequest<QueueEntry>(`/api/queue/${patientId}/doctor`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export function removeQueueEntry(patientId: string, request: RemoveQueueEntryRequest) {
  return apiRequest<void>(`/api/queue/${patientId}`, {
    method: 'DELETE',
    body: JSON.stringify(request),
  });
}

export function getDepartments() {
  return apiRequest<string[]>('/api/departments');
}

export function getStaffUser(staffUserId: string) {
  return apiRequest<StaffUser>(`/api/staff/${staffUserId}`);
}

export function getStaffUsers(filters: { role?: StaffUser['role']; department?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.role) {
    params.set('role', filters.role);
  }
  if (filters.department) {
    params.set('department', filters.department);
  }
  const query = params.toString();
  return apiRequest<StaffUser[]>(`/api/staff${query ? `?${query}` : ''}`);
}

export function createStaffUser(request: SaveStaffUserRequest) {
  return apiRequest<StaffUser>('/api/staff', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export function updateStaffUser(staffUserId: string, request: SaveStaffUserRequest & { staffCode: string; active: boolean }) {
  return apiRequest<StaffUser>(`/api/staff/${staffUserId}`, {
    method: 'PUT',
    body: JSON.stringify(request),
  });
}

export function deactivateStaffUser(staffUserId: string) {
  return apiRequest<void>(`/api/staff/${staffUserId}`, {
    method: 'DELETE',
  });
}

export function getSystemAgents() {
  return apiRequest<SystemAgent[]>('/api/agents');
}

export function createSystemAgent(request: SaveSystemAgentRequest) {
  return apiRequest<SystemAgent>('/api/agents', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export function updateSystemAgent(agentId: string, request: SaveSystemAgentRequest) {
  return apiRequest<SystemAgent>(`/api/agents/${agentId}`, {
    method: 'PUT',
    body: JSON.stringify(request),
  });
}

export function toggleSystemAgent(agentId: string, active: boolean) {
  return apiRequest<SystemAgent>(`/api/agents/${agentId}/active`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  });
}

export function getQueueMetrics() {
  return apiRequest<QueueMetrics>('/api/metrics/queue');
}

export function getHospitalAllocation() {
  return apiRequest<HospitalAllocation>('/api/allocation');
}

export function getAgentDashboard(staffLookup?: string, department?: string) {
  const params = new URLSearchParams();

  if (staffLookup) {
    params.set('staffLookup', staffLookup);
  }

  if (department) {
    params.set('department', department);
  }

  const query = params.toString();
  return apiRequest<AgentDashboard>(`/api/agent/dashboard${query ? `?${query}` : ''}`);
}

export function resolveFlashcard(flashcardId: string, staffName?: string) {
  return apiRequest(`/api/agent/flashcards/${flashcardId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ staffName }),
  });
}

export function getPatientThread(patientId: string) {
  return apiRequest<ThreadComment[]>(`/api/patients/${patientId}/thread`);
}

export function createThreadComment(intakeId: string, request: CreateThreadCommentRequest) {
  return apiRequest<ThreadComment>(`/api/intakes/${intakeId}/thread`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export function sendAiChatMessage(request: AiChatRequest) {
  return apiRequest<AiChatResponse>('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify(request),
    timeoutMs: 45000,
  });
}

export function sendAiTestChatMessage(request: AiChatRequest) {
  return apiRequest<AiChatResponse>('/api/ai/test-chat', {
    method: 'POST',
    body: JSON.stringify(request),
    timeoutMs: 45000,
  });
}

export function generatePatientReport(intakeId: string) {
  return apiRequest<PatientReportResponse>(`/api/intakes/${intakeId}/report`, {
    method: 'POST',
    timeoutMs: 45000,
  });
}

export function getKnowledgeDocuments() {
  return apiRequest<KnowledgeDocument[]>('/api/knowledge');
}

export async function draftSymptomNotes(intakeFields: Record<string, unknown>) {
  const response = await apiRequest<{ notes: string }>('/api/ai/draft-symptom-notes', {
    method: 'POST',
    body: JSON.stringify(intakeFields),
    timeoutMs: 30000,
  });
  return response.notes;
}

export function getPatientStory(patientId: string) {
  return apiRequest<PatientStory>(`/api/patients/${patientId}/story`);
}

export function getAgentPerformance() {
  return apiRequest<AgentPerformanceResponse>('/api/agent/performance');
}

export function getNotifications(role?: StaffRole, staffLookup?: string) {
  const params = new URLSearchParams();
  if (role) {
    params.set('role', role);
  }
  if (staffLookup?.trim()) {
    params.set('staffLookup', staffLookup.trim());
  }
  const query = params.toString();
  return apiRequest<StaffNotification[]>(`/api/notifications${query ? `?${query}` : ''}`);
}

export function markNotificationRead(notificationId: string) {
  return apiRequest<void>(`/api/notifications/${notificationId}/read`, { method: 'POST' });
}

export function markAllNotificationsRead(role?: StaffRole, staffLookup?: string) {
  const params = new URLSearchParams();
  if (role) {
    params.set('role', role);
  }
  if (staffLookup?.trim()) {
    params.set('staffLookup', staffLookup.trim());
  }
  const query = params.toString();
  return apiRequest<void>(`/api/notifications/read-all${query ? `?${query}` : ''}`, { method: 'POST' });
}

export function getPatientDirectory(query?: string) {
  const params = new URLSearchParams();
  if (query?.trim()) {
    params.set('query', query.trim());
  }
  const queryString = params.toString();
  return apiRequest<PatientDirectoryEntry[]>(`/api/patients/directory${queryString ? `?${queryString}` : ''}`);
}

export async function uploadKnowledgeDocument(file: File, title?: string) {
  const formData = new FormData();
  formData.append('file', file);
  if (title?.trim()) {
    formData.append('title', title.trim());
  }

  const response = await fetch(`${API_BASE_URL}/api/knowledge`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });

  if (response.status === 401 && getToken()) {
    handleSessionExpired();
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<KnowledgeDocument>;
}

export function getHospitalChatMessages() {
  return apiRequest<HospitalChatMessage[]>('/api/hospital-chat');
}

export function sendHospitalChatMessage(request: { authorName: string; authorRole: StaffUser['role']; body: string }) {
  return apiRequest<HospitalChatMessage[]>('/api/hospital-chat', {
    method: 'POST',
    body: JSON.stringify(request),
    timeoutMs: 45000,
  });
}
