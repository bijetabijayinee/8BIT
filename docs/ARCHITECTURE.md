# CareFlow AI — System Architecture

CareFlow AI is an agentic hospital triage and patient-flow platform. It takes a raw patient
intake (chief complaint, symptoms, vitals, risk flags), runs it through a pipeline of
cooperating AI agents, and produces a fully triaged, prioritised, doctor-assigned queue entry —
with every agent decision explained, streamed live to the UI, and persisted for audit.

This document describes the implemented architecture: the tech stack, the services, the
codebase layout, the agent pipeline, the data model, and how everything wires together.

---

## 1. High-Level Topology

The system is composed of three deployable units plus PostgreSQL:

```text
┌──────────────────────┐        /api (REST + SSE)        ┌─────────────────────────────┐
│  Frontend            │ ──────────────────────────────► │  Backend                    │
│  React 18 + TS       │ ◄────────────────────────────── │  Spring Boot 3.5 (Java 17)  │
│  Vite + Tailwind     │      JSON + event-stream        │  Spring AI 1.1 (OpenAI SDK) │
│  Recharts            │                                 │  modular monolith           │
└──────────────────────┘                                 └──────────┬──────────────────┘
                                                                    │
                                             ┌──────────────────────┼──────────────────────┐
                                             ▼                      ▼                      ▼
                                   ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
                                   │ PostgreSQL       │   │ OpenAI API       │   │ Wikipedia REST   │
                                   │ (Flyway V1–V15)  │   │ (Responses +     │   │ API (research    │
                                   │ schema + vectors │   │  embeddings)     │   │ agent tool)      │
                                   └──────────────────┘   └──────────────────┘   └──────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│  ai-service (optional sidecar) — FastAPI + OpenAI SDK                        │
│  AMQP patient ingestion → local JSON vector store → /chat, /patients/search  │
│  Used when AI_SERVICE_URL is set on the backend; otherwise the backend's     │
│  built-in Spring AI path handles chat and semantic search itself.            │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Frontend** (`frontend/`): the staff workspace. Talks only to the backend via `/api`
  (proxied by Vite in development). Renders the live queue, intake form, agent workflow
  stream, dashboards, and the Savi chat copilot.
- **Backend** (`backend/`): a Spring Boot modular monolith. Owns the domain model, the agent
  orchestration pipeline, queue ordering rules, persistence, and all OpenAI calls (via
  Spring AI's OpenAI SDK starter, with a raw Responses-API client as fallback).
- **ai-service** (`ai-service/`): an optional Python FastAPI sidecar for conversational AI
  and patient vector search fed over AMQP. The backend routes chat to it only when
  `AI_SERVICE_URL` is configured; the system is fully functional without it.
- **PostgreSQL**: single source of truth. Schema is owned exclusively by Flyway migrations —
  Hibernate runs with `ddl-auto: none` and never mutates schema.

---

## 2. Tech Stack

| Layer | Technology | Notes |
| --- | --- | --- |
| Backend runtime | Java 17, Spring Boot 3.5.7 | Modular monolith, constructor injection throughout |
| AI framework | Spring AI 1.1.8 (`spring-ai-starter-model-openai-sdk`, `spring-ai-vector-store`) | Chat, tool calling, embeddings |
| LLM | OpenAI (default `gpt-5-mini`, configurable via `OPENAI_MODEL`) | Responses API; raw `OpenAiResponsesClient` fallback path |
| Embeddings | OpenAI `text-embedding-3-small` | Powers semantic patient/knowledge search |
| Persistence | PostgreSQL + Spring Data JPA (Hibernate) | `open-in-view: false`, no schema generation |
| Migrations | Flyway (V1–V15) | The only mechanism for schema change |
| API docs | springdoc-openapi 2.8 | Swagger UI at `/swagger-ui.html` |
| Documents | Apache PDFBox 3.0.3 | Extracts text from uploaded knowledge PDFs |
| Ops | Spring Boot Actuator | Health/liveness/readiness probes |
| Frontend | React 18, TypeScript 5.7, Vite 6, Tailwind CSS 3.4 | Feature-folder structure, hash routing |
| Charts / icons | Recharts 3.9, lucide-react | Dashboard analytics |
| Sidecar | Python, FastAPI 0.115, OpenAI SDK 1.59, pika (AMQP), NumPy | Optional; JSON-file vector store |

---

## 3. Backend — Modular Monolith

All backend code lives in `backend/src/main/java/com/careflowai`, one package per domain.
Every module follows the same shape: `*Controller` (REST), `*Service` (business logic),
`*Repository` (Spring Data JPA), entities, and a `dto/` package with request/response records.

| Package | Responsibility |
| --- | --- |
| `intake` | The intake pipeline entry point. `IntakeService.create(...)` orchestrates the entire agent workflow for a new patient. Also generates patient display IDs (`CF-YYYYMMDD-NNNN`) and staff-facing patient reports. |
| `ai` | All LLM plumbing. `SpringAiChatService` (primary chat path), `OpenAiResponsesClient` (raw Responses API fallback), `AiAssessmentService` (triage agent), `AiDoctorAssignmentService` (assignment agent), `AiChatService` + `SaviAgentTools` (Savi copilot with tool calling), `AiServiceClient` (optional Python sidecar proxy). |
| `agent` | Agent coordination and observability. `PatientAgentService` (post-triage orchestration: assignment, timeline, flashcards, notifications), `MedicalResearchAgent` (research agent with its Wikipedia tool), `SystemAgentService` (per-agent on/off registry), `WorkflowStreamService` (SSE live agent feed), `AgentPerformanceService` (per-agent stats), plus flashcards, timeline events, and care-team assignments. |
| `assessment` | `UrgencyAssessment` persistence: final category/score, score factors, and the full advisory output of the triage LLM (diagnosis, red flags, confidence, staff explanation). |
| `queue` | `QueueService` owns queue ordering (the single authority — the frontend only displays the ordered response), status transitions, doctor assignment endpoints, priority overrides with reasons, and placement updates. |
| `allocation` | Hospital-wide doctor and bed allocation views. |
| `metrics` | Queue analytics: size, urgency distribution, average/longest waits, override counts. |
| `patient` | Patient identity, the patient directory, and the narrative "patient story" view. |
| `staff` | Staff users, roles (`INTAKE_STAFF`, `TRIAGE_NURSE`, `CHARGE_NURSE`, `DOCTOR`, …), staff codes, and role-aware permission checks. |
| `thread` | Per-patient discussion threads with comments and attachments — also where the research agent files its briefings. |
| `chat` | Hospital-wide staff chat room; messages mentioning `@savi` are answered by the Savi agent inline. |
| `notification` | Targeted staff notifications (e.g. "you have been assigned patient CF-…"). |
| `vector` | Semantic memory. `SimpleIntakeVectorStore` embeds and indexes every queue entry; `KnowledgeDocument` holds uploaded PDF knowledge (extracted with PDFBox) for retrieval. `IntakeVectorBackfillRunner` reindexes existing intakes on startup. |
| `common` | Shared enums: `UrgencyCategory`, `QueueStatus`, `StaffRole`, `AgeBand`, `ArrivalMode`, `ConfidenceLevel`, `OverrideReason`; department lookup. |
| `config` | OpenAPI/Swagger configuration. |

### Configuration

`backend/src/main/resources/application.yml` reads everything from the environment (a root
`.env` file is auto-imported via `spring.config.import`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL`, `DATABASE_USER`, `DATABASE_PASSWORD` | PostgreSQL connection |
| `PORT` | HTTP port |
| `OPENAI_ENABLED`, `OPENAI_API_KEY` | Enable/authenticate OpenAI |
| `OPENAI_MODEL` (default `gpt-5-mini`) | Chat/triage model |
| `OPENAI_EMBEDDING_MODEL` (default `text-embedding-3-small`) | Embedding model |
| `AI_SERVICE_URL` (optional) | Route chat to the Python sidecar when set |
| `CORS_ALLOWED_ORIGINS` (optional) | Comma-separated origins allowed cross-origin; empty = CORS disabled (`config/CorsConfig`) |

---

## 4. The Agent System

CareFlow's intelligence is delivered by **three LLM-powered agents** that run in sequence on
every intake, coordinated with a set of **deterministic system agents** that handle queue
mechanics and communications. All of them are registered in the `system_agent` table and can
be toggled on/off at runtime from the System Agents panel — the pipeline checks
`SystemAgentService.isActive(code)` before each stage and degrades gracefully when an agent
is switched off.

### 4.1 The three core AI agents

**1. Savi Triage Agent** (`ai/AiAssessmentService`)
The clinical front door. It receives the structured intake payload — age band, arrival mode,
chief complaint, symptom notes, structured symptoms, clinical distress score, vitals, risk
flags, department — and returns strict JSON containing:

- a suggested diagnosis (differential label, never a final diagnosis),
- an urgency category (`CRITICAL` / `HIGH` / `MEDIUM` / `LOW`),
- a 0–100 severity score consistent with that category,
- red-flag indicators, missing/ambiguous details, a structured symptom summary,
- a medical-attention note, a staff-facing explanation, and a confidence level.

This output is **authoritative for queue placement**: the score is clamped to 0–100 and
persisted as the `UrgencyAssessment` final category/score. If the LLM cannot produce a usable
category and score the intake fails loudly (`502`) rather than silently guessing. The agent
is guard-railed to never prescribe medication or treatment.

**2. Medical Research Agent** (`agent/MedicalResearchAgent`)
A tool-using research agent that runs *inside* the intake workflow, after triage but before
queue sorting and doctor assignment, so its findings feed the later stages:

1. builds candidate search queries from the triage agent's suggested diagnosis, the chief
   complaint, and the structured symptoms (stripping qualifiers like "possible", "r/o"),
2. calls its online tool — the Wikipedia REST API — trying each query until articles are found,
3. asks the LLM to reason over the article excerpts against the patient's actual presentation,
4. writes a 3–5 line educational briefing (time-critical lines prefixed `WARNING:`) plus
   citation links to the patient's thread and timeline,
5. returns the briefing so the Assignment Agent can use it when choosing a doctor.

It is deliberately fail-open: any error is reported to the workflow stream and the intake
continues without a briefing.

**3. Assignment Agent** (`ai/AiDoctorAssignmentService`, invoked from
`agent/PatientAgentService`)
Matches the patient to the most relevant doctor. It weighs symptoms, risk flags, vitals,
department, urgency, doctor specialty and availability — plus the research agent's briefing —
and returns both a doctor and a human-readable assignment reason. The decision is persisted
as a `CareTeamAssignment` and surfaced in the timeline and workflow stream with full
reasoning. If the agent is toggled off, the intake actor is retained with an explanatory note.

### 4.2 Deterministic system agents

| Agent | Code | What it does |
| --- | --- | --- |
| Priority Agent | `PRIORITY_AGENT` | Applies the queue ordering rule after every assessment: urgency category first (Critical > High > Medium > Low), then staff escalations, then wait-time pressure (patients approaching 30 minutes and past 40 minutes are pushed up), then severity score. Implemented in `QueueService`; re-ranks continuously as waits grow. |
| Notification Agent | `NOTIFICATION_AGENT` | Publishes timeline events, care-team flashcards, and targeted staff notifications (assigned doctor, intake desk, triage nurses) whenever assignment or status changes. |
| Discovery Brief Agent | `DISCOVERY_BRIEF_AGENT` | Produces a short natural-language patient brief (complaint, symptoms, risk flags, vitals, urgency, next action) for the agent dashboard. |

### 4.3 Savi, the workspace copilot

Savi is also the staff-facing conversational agent (`ai/AiChatService` + `ai/SaviAgentTools`).
It is a genuine tool-calling agent, not a canned chatbot: on each chat turn Spring AI exposes
tools that hit the same services and permission checks as the UI —

- `getLiveQueue`, queue metrics, and hospital allocation lookups,
- semantic patient search over the intake vector store,
- **actions**: update a patient's status, override a priority (with reason), assign a doctor.

A fresh `SaviAgentTools` instance is created per request so every action is attributed to the
requesting staff member and passes the same role checks as the queue UI. Savi also answers
when mentioned as `@savi` in the hospital chat room, and is scoped to operational support —
it refuses clinical diagnosis/treatment requests.

### 4.4 How an intake flows through the agents

`IntakeService.create(...)` is the orchestrator. Every step publishes a named event to the
SSE workflow stream so staff watch the agents work in real time:

```text
POST /api/intakes
  │
  ├─ INTAKE_RECEIVED   Intake workspace   arrival registered
  ├─ INTAKE_SAVED      Patient + Intake rows persisted (Postgres)
  │
  ├─ LLM_REQUESTED     Savi Triage Agent  intake sent to the LLM
  ├─ LLM_RESPONDED     urgency category + 0–100 score + diagnosis + red flags
  │                    → persisted as UrgencyAssessment (authoritative)
  │
  ├─ RESEARCH_*        Medical Research Agent  Wikipedia tool → LLM briefing
  │                    → saved to patient thread + timeline, passed downstream
  │
  ├─ QUEUE_SORTED      Priority Agent  places patient in the live queue
  │                    (category > escalation > wait thresholds > score)
  │
  ├─ DOCTOR_ASSIGNED   Assignment Agent  picks doctor using triage output
  │                    + research briefing → CareTeamAssignment + reason
  ├─ FLASHCARDS_CREATED  care-team flashcards for doctor + intake team
  ├─ DOCTOR_NOTIFIED   Notification Agent  notifies doctor, intake desk, triage
  │
  ├─ CONTEXT_INDEXED   intake + triage + research embedded into Savi's
  │                    semantic memory (intake vector store)
  └─ WORKFLOW_COMPLETE all agents finished
```

Design principles baked into this pipeline:

- **Explainability everywhere.** Every agent step carries a human-readable reasoning payload
  (why this urgency, why this queue position, why this doctor) that is streamed live and kept
  in the timeline for audit.
- **Fail loudly for safety-critical steps, fail open for enrichment.** Triage failure aborts
  the intake; research failure never does.
- **Humans stay in charge.** Staff can override priority (with a recorded reason), reassign
  doctors, and toggle any agent off at runtime; overrides are audited in `priority_override`.

---

## 5. Real-Time Layer

`agent/WorkflowStreamService` + `WorkflowStreamController` expose a Server-Sent Events
endpoint. Each pipeline stage publishes `(patientDisplayId, eventType, actor, title, detail,
reasoning)` tuples, which the frontend renders as a live agent activity feed — the "glass
box" view of the agent system. Timeline events and flashcards persist the same story for
later review.

---

## 6. Semantic Memory (Vector Layer)

- `vector/SimpleIntakeVectorStore` embeds a summary of every queue entry (intake, triage
  outcome, doctor assignment) with the OpenAI embedding model and stores vectors in the
  `intake_vector_document` table. Savi's patient search tool queries this store, which is
  how it resolves references like "the longest-waiting critical chest-pain patient".
- `vector/KnowledgeDocument*` stores staff-uploaded reference PDFs: PDFBox extracts the text,
  it is embedded, and becomes retrievable knowledge.
- `vector/IntakeVectorBackfillRunner` reindexes historical intakes at startup so memory
  survives redeploys.
- The Python sidecar keeps its own lightweight JSON-file vector store fed by AMQP, used only
  when chat is routed there.

---

## 7. Data Model & Migrations

PostgreSQL schema is owned by Flyway (`backend/src/main/resources/db/migration`). Highlights:

| Migration | Adds |
| --- | --- |
| V1 | Core schema: `patient`, `intake` (vitals, risk flags, symptoms), `urgency_assessment`, `queue_entry`, `priority_override`, `staff_user` |
| V2–V4 | Demo queue/staff seeds, staff codes |
| V5–V6 | Agent coordination: `system_agent`, `care_team_assignment`, `patient_flashcard`, `patient_timeline_event`; staff directory + flashcard resolution |
| V8 | Patient threads, agent seeds (Assignment, Priority, Notification, Discovery Brief), board |
| V9 | Demo doctor seeds |
| V10, V12 | `intake_vector_document`, `knowledge_document` (semantic memory) |
| V11, V13 | LLM triage diagnosis/notes columns, widened urgency list columns |
| V14 | Medical Research Agent seed |
| V15 | `staff_notification` |

Key relationships: `patient 1—n intake`, `intake 1—n urgency_assessment`,
`patient 1—1 queue_entry` (live queue), `patient 1—n care_team_assignment / flashcard /
timeline_event / thread_comment`, `system_agent` as the runtime agent registry.

---

## 8. Frontend Structure

`frontend/src`, feature-folder architecture with hash routing (`#/queue`, `#/intake`, …):

| Path | Responsibility |
| --- | --- |
| `app/` | Shell: draggable side navigation, routing, staff login (staff code lookup), global composition |
| `api/` | Typed HTTP client helpers for every backend endpoint |
| `components/` | Shared UI components |
| `features/queue/` | Live queue table: filters, sorting, status actions, overrides, doctor assignment |
| `features/intake/` | Intake form: departments, structured symptoms, vitals, risk flags, distress score |
| `features/agent/`, `features/agents/` | Live agent workflow stream, agent dashboard (flashcards + timeline), System Agents admin panel |
| `features/ai-chat/` | Savi copilot chat (floating), suggested workspace actions |
| `features/board/` | Hospital chat room with `@savi` mentions |
| `features/allocation/` | Doctor/bed allocation views |
| `features/metrics/` | Recharts analytics dashboard |
| `features/knowledge/` | Knowledge PDF upload and browsing |
| `features/notifications/` | Staff notification center |
| `features/patient-detail/`, `features/people/`, `features/calendar/`, `features/override/` | Patient story/threads, staff directory, calendar, override workflow |
| `types/` | Shared TypeScript types mirroring backend DTOs |
| `styles/` | Tailwind global styles |

In development Vite serves on `:5173` and proxies `/api` to `http://127.0.0.1:8080`.

---

## 9. API Surface

REST under `/api` (full interactive docs at `/swagger-ui.html`):

- `POST /api/intakes` — run the full agent pipeline for a new patient; `GET /api/intakes/{id}`,
  re-assessment, next display ID, patient report.
- `GET /api/queue` — the ordered live queue (backend ordering is authoritative); status
  updates, priority overrides, doctor assignment, placement changes, removal.
- `GET /api/agents` + toggle/create/update — System Agents registry; agent dashboard,
  flashcards, timeline, performance stats; SSE workflow stream.
- `POST /api/ai/chat` — Savi copilot (tool-calling); hospital chat endpoints.
- Metrics, allocation, departments, staff, patients, threads, knowledge, notifications.

Health: Actuator `/actuator/health` with liveness/readiness probes.

---

## 10. Cross-Cutting Concerns

- **Safety guardrails**: every prompt forbids prescriptions and definitive diagnoses; the
  triage output is explicitly advisory language ("suggested", "differential"), staff override
  paths are first-class, and the copilot redirects clinical questions to clinicians.
- **Auditability**: assessments, overrides (with reasons), assignments (with reasons),
  timeline events, and thread entries are all persisted; nothing an agent does is invisible.
- **Resilience**: dual LLM path (Spring AI primary, raw Responses client fallback); research
  agent fail-open; sidecar optional; per-agent kill switches.
- **Schema discipline**: Flyway-only migrations; `ddl-auto: none`; `open-in-view: false`.
- **Security posture**: no credentials in the repo — everything via environment variables /
  `.env` (git-ignored); staff actions attributed and role-checked server-side.
