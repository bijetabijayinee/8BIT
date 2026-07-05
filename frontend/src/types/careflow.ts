export type AgeBand = 'CHILD' | 'ADULT' | 'OLDER_ADULT';
export type ArrivalMode = 'WALK_IN' | 'AMBULANCE' | 'TRANSFER' | 'REFERRAL';
export type QueueStatus = 'WAITING' | 'IN_TRIAGE' | 'IN_TREATMENT' | 'DISCHARGED' | 'LEFT_WITHOUT_BEING_SEEN';
export type UrgencyCategory = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type StaffRole = 'INTAKE_STAFF' | 'DOCTOR' | 'TRIAGE_NURSE' | 'CHARGE_NURSE' | 'ADMIN';
export type QueueSortKey = 'backend' | 'urgencyScore' | 'waitingMinutes' | 'patientDisplayId' | 'department' | 'status';
export type SortDirection = 'asc' | 'desc';

export interface QueueFilters {
  category?: UrgencyCategory;
  department?: string;
  status?: QueueStatus;
}

export interface Vitals {
  temperatureC?: number;
  heartRate?: number;
  systolicPressure?: number;
  diastolicPressure?: number;
  respiratoryRate?: number;
  oxygenSaturation?: number;
}

export interface RiskFlags {
  chestPain: boolean;
  breathingDifficulty: boolean;
  alteredMentalState: boolean;
  severeBleeding: boolean;
  pregnancy: boolean;
  pediatricRisk: boolean;
  fallOrTrauma: boolean;
  immunocompromised: boolean;
}

export interface QueueEntry {
  patientId: string;
  intakeId: string;
  patientDisplayId: string;
  urgencyCategory: UrgencyCategory;
  urgencyScore: number;
  chiefComplaint: string;
  waitingMinutes: number;
  waitPriorityLevel: 'ON_TRACK' | 'NEAR_TARGET' | 'OVER_TARGET';
  waitThresholdExceeded: boolean;
  department: string;
  status: QueueStatus;
  staffEscalated: boolean;
  waitingSince: string;
  assignedDoctor: AssignedDoctor | null;
}

export interface AssignedDoctor {
  id: string;
  staffCode: string;
  displayName: string;
  department?: string;
  specialty?: string;
  assignmentReason: string;
  assignedAt: string;
}

export interface UrgencyAssessment {
  id: string;
  finalCategory: UrgencyCategory;
  finalScore: number;
  scoreFactors: string[];
  suggestedCategory: UrgencyCategory | null;
  suggestedScore: number | null;
  redFlagIndicators: string[];
  missingOrAmbiguousDetails: string[];
  structuredSymptomSummary: string | null;
  suggestedDiagnosis: string | null;
  medicalAttentionNote: string | null;
  staffFacingExplanation: string | null;
  confidenceLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  assessedAt: string;
}

export interface IntakeResponse {
  intakeId: string;
  patientId: string;
  patientDisplayId: string;
  ageBand: AgeBand;
  arrivalTimestamp: string;
  arrivalMode: ArrivalMode;
  chiefComplaint: string;
  symptomNotes?: string;
  structuredSymptoms: string[];
  painLevel: number;
  vitals: Vitals;
  riskFlags: RiskFlags;
  department: string;
  currentStatus: QueueStatus;
  staffNotes?: string;
  assessment: UrgencyAssessment | null;
  createdAt: string;
}

export interface CreateIntakeRequest {
  patientDisplayId?: string;
  patientName?: string;
  gender?: string;
  contactPhone?: string;
  ageBand: AgeBand;
  arrivalTimestamp?: string;
  arrivalMode: ArrivalMode;
  chiefComplaint: string;
  symptomNotes?: string;
  structuredSymptoms: string[];
  painLevel: number;
  vitals: Vitals;
  riskFlags: RiskFlags;
  department: string;
  currentStatus?: QueueStatus;
  staffNotes?: string;
  staffName?: string;
}

export interface UpdateQueueStatusRequest {
  status: QueueStatus;
  actorName?: string;
  actorRole: StaffRole;
}

export interface StaffUser {
  id: string;
  staffCode: string;
  displayName: string;
  role: StaffRole;
  department?: string;
  specialty?: string;
  active: boolean;
}

export interface SaveStaffUserRequest {
  displayName: string;
  staffCode?: string;
  role: StaffRole;
  department?: string;
  specialty?: string;
  active?: boolean;
}

export interface SystemAgent {
  id: string;
  code: string;
  name: string;
  taskType: string;
  description: string;
  instructions?: string;
  active: boolean;
  updatedAt: string;
}

export interface SaveSystemAgentRequest {
  code: string;
  name: string;
  taskType: string;
  description: string;
  instructions?: string;
  active: boolean;
}

export interface ThreadAttachment {
  id: string;
  fileName: string;
  fileType?: string;
  url: string;
}

export interface ThreadComment {
  id: string;
  patientId: string;
  intakeId: string;
  patientDisplayId: string;
  authorName: string;
  body: string;
  attachments: ThreadAttachment[];
  createdAt: string;
}

export interface CreateThreadCommentRequest {
  authorName: string;
  body: string;
  attachments: Array<{
    fileName: string;
    fileType?: string;
    url: string;
  }>;
}

export interface UpdatePlacementRequest {
  status: QueueStatus;
  department: string;
  actorName?: string;
  actorRole: StaffRole;
}

export interface AssignDoctorRequest {
  doctorLookup: string;
  actorName?: string;
  actorRole?: StaffRole;
  note?: string;
}

export interface RemoveQueueEntryRequest {
  actorName?: string;
  actorRole?: StaffRole;
  reason?: string;
}

export interface QueueMetrics {
  currentQueueSize: number;
  criticalAndHighWaiting: number;
  patientsByUrgency: Record<UrgencyCategory, number>;
  averageWaitMinutesByUrgency: Record<UrgencyCategory, number>;
  longestWaitMinutesByUrgency: Record<UrgencyCategory, number>;
  overrideCount: number;
}

export interface ChatTurn {
  role: 'staff' | 'assistant';
  text: string;
}

export interface AiChatRequest {
  message: string;
  actorName?: string;
  actorRole?: StaffRole;
  history?: ChatTurn[];
}

export interface AiChatResponse {
  message: string;
  suggestedActions: string[];
  aiBacked: boolean;
  createdAt: string;
}

export interface PatientReportResponse {
  patientDisplayId: string;
  report: string;
  aiBacked: boolean;
  createdAt: string;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  fileName: string;
  contentLength: number;
  updatedAt: string;
}

export interface PatientFile {
  fileName: string;
  fileType: string | null;
  url: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface PatientDirectoryEntry {
  patientId: string;
  patientDisplayId: string;
  ageBand: AgeBand;
  department: string | null;
  chiefComplaint: string | null;
  currentStatus: QueueStatus | null;
  urgencyCategory: UrgencyCategory | null;
  urgencyScore: number | null;
  suggestedDiagnosis: string | null;
  medicalAttentionNote: string | null;
  assignedDoctor: string | null;
  arrivedAt: string | null;
  files: PatientFile[];
}

export interface WorkflowEvent {
  patientDisplayId: string;
  stage: string;
  agent: string;
  title: string;
  detail: string;
  reasoning: string | null;
  timestamp: string;
}

export interface StaffNotification {
  id: string;
  recipientRole: StaffRole;
  patientDisplayId: string | null;
  agent: string;
  category: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface PatientStoryCitation {
  title: string;
  url: string;
}

export interface PatientStory {
  patientId: string;
  patientDisplayId: string;
  ageBand: AgeBand;
  department: string | null;
  chiefComplaint: string | null;
  structuredSymptoms: string[];
  currentStatus: QueueStatus | null;
  arrivedAt: string;
  assessment: {
    finalCategory: UrgencyCategory;
    finalScore: number;
    suggestedDiagnosis: string | null;
    medicalAttentionNote: string | null;
    structuredSymptomSummary: string | null;
    staffFacingExplanation: string | null;
    confidenceLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    scoreFactors: string[];
    redFlagIndicators: string[];
    missingOrAmbiguousDetails: string[];
  } | null;
  assignment: {
    doctorName: string;
    doctorSpecialty: string | null;
    reason: string;
    assignedAt: string;
  } | null;
  research: {
    briefing: string;
    citations: PatientStoryCitation[];
  } | null;
  timeline: PatientTimelineEvent[];
  files: PatientFile[];
}

export interface AgentTrendPoint {
  label: string;
  count: number;
}

export interface AgentPerformance {
  code: string;
  name: string;
  description: string;
  active: boolean;
  totalActions: number;
  actionsLast24h: number;
  lastActiveAt: string | null;
  trend: AgentTrendPoint[];
  recentActivity: string[];
}

export interface PipelineObservability {
  avgIntakeToAssignSeconds: number | null;
  avgIntakeToResearchSeconds: number | null;
  researchCoveragePercent: number;
  actionsPerPatient: number;
  hourlyActivity: AgentTrendPoint[];
  urgencyMix: AgentTrendPoint[];
  confidenceMix: AgentTrendPoint[];
}

export interface AgentPerformanceResponse {
  patientsProcessed: number;
  agentActionsTotal: number;
  agents: AgentPerformance[];
  pipeline: PipelineObservability;
}

export interface HospitalChatMessage {
  id: string;
  authorName: string;
  authorRole: StaffRole | null;
  body: string;
  savi: boolean;
  createdAt: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  intakeId: string;
  patientDisplayId: string;
  department: string;
  startsAt: string;
  note: string;
}

export interface PatientFlashcard {
  id: string;
  patientId: string;
  intakeId: string;
  patientDisplayId: string;
  assignedStaffName: string | null;
  audienceRole: StaffRole;
  department: string;
  title: string;
  summary: string;
  actionLabel: string;
  urgencyCategory: UrgencyCategory;
  urgencyScore: number;
  status: QueueStatus;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  updatedAt: string;
}

export interface PatientTimelineEvent {
  id: string;
  patientId: string;
  intakeId: string;
  patientDisplayId: string;
  actorName: string | null;
  department: string;
  eventType: string;
  title: string;
  description: string;
  source: 'AGENT' | 'STAFF';
  createdAt: string;
}

export interface AgentDashboard {
  flashcards: PatientFlashcard[];
  timeline: PatientTimelineEvent[];
}

export interface AllocationSummary {
  filledBeds: number;
  vacantBeds: number;
  filledDoctors: number;
  vacantDoctors: number;
}

export interface BedAllocation {
  id: string;
  department: string;
  label: string;
  filled: boolean;
  patientId: string | null;
  patientDisplayId: string | null;
  chiefComplaint: string | null;
  urgencyCategory: UrgencyCategory | null;
  status: QueueStatus | null;
  waitingMinutes: number;
}

export interface DoctorAllocation {
  doctorId: string;
  staffCode: string;
  displayName: string;
  department?: string;
  specialty?: string;
  filled: boolean;
  patientId: string | null;
  patientDisplayId: string | null;
  patientStatus: QueueStatus | null;
  urgencyCategory: UrgencyCategory | null;
  assignmentReason: string | null;
  assignedAt: string | null;
}

export interface HospitalAllocation {
  summary: AllocationSummary;
  beds: BedAllocation[];
  doctors: DoctorAllocation[];
}
