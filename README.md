# CareFlow AI 🏥

**An agentic hospital triage and patient-flow platform.** CareFlow AI turns a raw patient
intake — chief complaint, symptoms, vitals, risk flags — into a triaged, prioritised,
doctor-assigned queue entry in seconds, using a pipeline of cooperating AI agents whose every
decision is explained, streamed live to staff, and kept for audit.

> 🏆 Built for the **OpenAI Agentic AI Hackathon**.
>
> 👤 **Author:** Chandan Pandey

📐 Deep dive: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · API reference: [docs/API.md](docs/API.md)

---

## Why CareFlow AI?

Emergency departments lose critical minutes to manual triage: a nurse reads the complaint,
guesses urgency, finds an available doctor, and updates a whiteboard — while the queue is
ordered mostly by arrival time. CareFlow AI attacks exactly that bottleneck:

- **Triage in seconds, not minutes.** The moment intake is submitted, an AI agent reads the
  full clinical picture and produces an urgency category, a 0–100 severity score, a suggested
  differential, and red flags — before a nurse would have finished reading the form.
- **Sorting by urgency, not arrival order.** The queue is continuously ranked by urgency
  signs extracted from symptoms and vitals, then by wait-time pressure — so the silent
  chest-pain patient doesn't sit behind ten sprained ankles.
- **Minimised wait times.** Patients approaching 30 minutes of waiting are escalated in
  visibility and pushed up past 40 minutes, doctors are matched and notified automatically,
  and dashboards surface average/longest waits per urgency band so bottlenecks are visible.
- **Humans stay in charge.** Every AI output is advisory-labelled and explainable; staff can
  override any priority (with an audited reason), reassign doctors, and switch any agent off
  at runtime.

## The Three AI Agents

CareFlow's intelligence comes from **three LLM-powered agents** that run in sequence on every
intake, wired together so each one's output feeds the next:

### 1. 🩺 Savi Triage Agent — *diagnosis & urgency*
Reads the complete intake (age band, arrival mode, chief complaint, structured symptoms,
symptom notes, clinical distress score, vitals, risk flags, department) and returns a strict
JSON assessment: suggested diagnosis (differential, never final), urgency category
(**CRITICAL / HIGH / MEDIUM / LOW**), a 0–100 severity score, red-flag indicators, missing or
ambiguous details, a staff-facing explanation, and a confidence level. This assessment is
authoritative for queue placement — and if the model can't produce a usable answer, the
intake fails loudly instead of guessing.

### 2. 📚 Medical Research Agent — *evidence & context*
A tool-using agent that runs right after triage. It builds search queries from the suggested
diagnosis and symptoms, calls its online research tool (the Wikipedia REST API), has the LLM
reason over the retrieved articles *against this patient's actual presentation*, and files a
concise briefing — typical course, warning signs (time-critical lines flagged `WARNING:`),
assessment considerations — with citation links into the patient's thread and timeline. It is
fail-open: research problems never block an intake.

### 3. 👨‍⚕️ Assignment Agent — *the right doctor, with a reason*
Takes the triage assessment **and** the research briefing and matches the patient to the most
relevant doctor, weighing symptoms, risk flags, vitals, department, specialty, and urgency.
The assignment is persisted with a human-readable reason, and the Notification Agent then
alerts the doctor, the intake desk, and triage nurses automatically.

**How they wire together** (every step streamed live over SSE to the workspace):

```text
Intake submitted
   → 🩺 Savi Triage Agent    urgency + score + diagnosis + red flags
   → 📚 Research Agent       online articles → briefing + citations
   → ⚖️  Priority Agent       sorts queue: urgency > escalations > wait time > score
   → 👨‍⚕️ Assignment Agent     picks the doctor using triage + research output
   → 🔔 Notification Agent   flashcards + alerts to the whole care team
   → 🧠 Savi memory          everything embedded into semantic search
```

Supporting **system agents** (Priority, Notification, Discovery Brief) handle queue
mechanics and communications deterministically, and all agents — AI and deterministic — are
registered in a runtime panel where staff can toggle each one on or off.

**Savi is also your copilot.** The workspace chat agent uses real tool-calling: it can read
the live queue and metrics, semantically search patients ("longest-waiting critical
chest-pain patient"), and *act* — update statuses, override priorities, assign doctors — with
every action attributed to the logged-in staff member and passed through the same permission
checks as the UI. Mention `@savi` in the hospital chat room and it answers there too.

## Features

- 📝 **Smart intake** — departments, structured symptoms, vitals, risk flags, distress score;
  auto-generated patient IDs (`CF-YYYYMMDD-NNNN`).
- 🚦 **Live priority queue** — AI-ranked, filterable, sortable, with one-click status moves,
  audited priority overrides, and doctor assignment.
- 📡 **Live agent workflow stream** — watch every agent think in real time (SSE), with full
  reasoning for each decision.
- 🗂️ **Agent dashboard** — care-team flashcards, patient timelines, per-agent performance
  stats, and runtime on/off toggles for every agent.
- 💬 **Savi copilot + hospital chat** — tool-calling AI assistant, plus a staff chat room
  with `@savi` mentions.
- 🛏️ **Allocation views** — doctors and beds across the hospital.
- 📊 **Analytics dashboard** — Recharts views of queue load, urgency distribution, wait
  times, and override counts.
- 📖 **Knowledge base** — upload reference PDFs (parsed with PDFBox) into semantic memory.
- 🔔 **Notifications, threads, patient stories, staff directory** — the operational glue.
- 📜 **Swagger UI** — full interactive API docs at `/swagger-ui.html`.

## Tech Stack

| Component | Stack |
| --- | --- |
| `backend/` | Java 17 · Spring Boot 3.5 · Spring AI 1.1 (OpenAI SDK) · PostgreSQL · Flyway · JPA · springdoc · PDFBox |
| `frontend/` | React 18 · TypeScript · Vite · Tailwind CSS · Recharts |
| `ai-service/` | Python · FastAPI · OpenAI SDK · AMQP (optional sidecar for chat + vector search) |
| AI | OpenAI Responses API (default `gpt-5-mini`) + `text-embedding-3-small` embeddings |

## Getting Started

### Prerequisites

- Java 17+, Maven
- Node.js 18+ and npm
- PostgreSQL (a database created for CareFlow)
- An OpenAI API key
- (Optional) Python 3.11+ for the `ai-service` sidecar

### 1. Configure environment

Create a `.env` file in the repository root (auto-loaded by the backend):

```properties
DATABASE_URL=jdbc:postgresql://localhost:5432/careflow
DATABASE_USER=postgres
DATABASE_PASSWORD=<your password>
PORT=8080

OPENAI_ENABLED=true
OPENAI_API_KEY=<your OpenAI key>
OPENAI_MODEL=gpt-5-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Optional: route chat through the Python sidecar
AI_SERVICE_URL=

# Production only: comma-separated origins allowed to call the API cross-origin
# (leave empty in dev — Vite proxies /api same-origin)
CORS_ALLOWED_ORIGINS=
```

### 2. Run the backend

```bash
cd backend
mvn spring-boot:run
```

Flyway creates the full schema and seeds demo staff, doctors, and agents automatically.
API on `http://localhost:8080`, Swagger at `http://localhost:8080/swagger-ui.html`.

### 3. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` — Vite proxies `/api` to the backend.

### 4. (Optional) Run the AI sidecar

```powershell
cd ai-service
python -m venv .venv
. .venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env   # fill in OPENAI_API_KEY
uvicorn app.main:app --host 127.0.0.1 --port 8090
```

Then set `AI_SERVICE_URL=http://127.0.0.1:8090` in the root `.env`.

### 5. Log in and try it

Use a demo staff code in the workspace sidebar, then submit an intake and watch the agents
work in the live workflow stream:

| Staff code | Role |
| --- | --- |
| `INTAKE-01` | Intake staff |
| `TRIAGE-01` | Triage nurse |
| `CHARGE-01` | Charge nurse |

### Build & test

```bash
cd backend && mvn test        # backend tests
cd backend && mvn package     # backend build
cd frontend && npm run build  # type-check + production build
```

## FAQs

**Q: Does CareFlow AI diagnose patients?**
No. The triage agent produces a *suggested* differential and urgency signal for staff — every
prompt explicitly forbids prescriptions, treatment plans, and definitive diagnoses, and the
copilot redirects clinical questions to licensed clinicians. It is decision *support* for
hospital operations, not a medical device.

**Q: How does it actually reduce wait times?**
Three ways: triage happens in seconds instead of minutes; the queue is ordered by clinical
urgency plus wait-time pressure (30/40-minute thresholds) instead of arrival order, so
dangerous cases surface immediately; and doctor matching + notification is automatic, cutting
the coordination gap between "triaged" and "being seen".

**Q: What happens if OpenAI is down or an agent fails?**
Safety-critical and enrichment steps fail differently by design. Triage failure aborts the
intake with a clear error (no silent guessing). Research-agent failure is logged to the live
stream and the intake continues without a briefing. The backend also has a fallback LLM path
(raw Responses API client) behind the primary Spring AI path.

**Q: Can staff override the AI?**
Always. Priorities can be overridden with a recorded reason, doctors reassigned, statuses
changed, and every individual agent can be switched off at runtime from the System Agents
panel — the pipeline adapts and says so in the timeline.

**Q: Are the agents real or scripted?**
Real. The triage and assignment agents are live LLM calls over the actual intake data; the
research agent makes real HTTP calls to an online source and reasons over what it finds; Savi
uses genuine tool-calling to query and mutate the same services as the UI. The deterministic
system agents (Priority, Notification) are rule-based on purpose — queue ordering must be
predictable and auditable.

**Q: Is patient data safe to use here?**
The project uses demo/synthetic data and anonymous display IDs (`CF-…`). No credentials live
in the repo (environment variables only), all agent actions are attributed and role-checked,
and everything an agent does is persisted for audit. A production deployment would still need
HIPAA/GDPR-grade controls (encryption, access policies, PHI handling) on top.

**Q: Why is there both a Java backend AI layer and a Python ai-service?**
The Spring backend owns the agent pipeline end-to-end and works standalone. The FastAPI
sidecar is an optional scale-out path for conversational AI and patient vector search (fed
over AMQP) — set `AI_SERVICE_URL` to route chat there, leave it empty to skip it entirely.

---

*Built with ❤️ by **Chandan Pandey** for the OpenAI Agentic AI Hackathon.*
