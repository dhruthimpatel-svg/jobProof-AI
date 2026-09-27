# JobProof AI

**Don't just claim you're job-ready. Prove it.**

JobProof AI is a full-stack career assistant that turns a resume and a target job posting into an evidence-based readiness assessment — then closes the gaps with missions, interviews, and verifiable proof. It behaves like one personalized career agent, not a collection of disconnected AI tools.

**Proof over AI-generated fluff.** JobProof never invents skills, experience, metrics, certifications, or job requirements. Where evidence is missing, it says **"Not enough evidence to determine this."** Every conclusion is labeled:

- **Job requirement** — comes directly from the pasted job description
- **Your evidence** — comes from the user's resume, profile, or submitted evidence
- **AI inference** — a clearly-labeled heuristic conclusion, never presented as fact

---

## Problem

Resumes are full of claims. Recruiters can't tell which ones are real, and candidates themselves often can't either:

- "Worked on machine learning projects" — doing what, exactly, and how well?
- Skill lists with no artifacts behind them
- No feedback loop: candidates apply, get rejected, and never learn what was actually missing
- AI tools "improve" resumes by inventing metrics and stuffing keywords — which collapses at the interview

## Solution

JobProof separates **CLAIM → EVIDENCE → VERIFICATION**:

1. **Analyze** — parse the resume, parse the job description, compute a real match with per-requirement evidence
2. **Explain** — show what a hiring manager would notice, skim, and question (labeled as an AI perspective)
3. **Identify gaps** — per-skill statuses: `VERIFIED` / `PARTIAL` / `INSUFFICIENT EVIDENCE` / `NOT VERIFIED`
4. **Create missions** — turn the top gaps into concrete, time-boxed tasks
5. **Track proof** — GitHub repos, projects, certificates, and an adaptive interview become evidence in a ledger
6. **Adapt** — readiness updates only when evidence changes; the agent proposes the next action

The strongest visual moment of the product is that loop itself:

```
CLAIM → EVIDENCE FOUND → VERIFICATION → GAP DETECTED → MISSION CREATED → RETEST
```

---

## Features

### Feature 1 — Job Match & Resume Intelligence
- Resume upload (PDF / DOCX / TXT) with on-device parsing: sections, education, projects, experience, skills, bullet analysis, formatting risks
- Job description parsing from pasted text
- **Role Match Score** with a full evidence breakdown per requirement (`resumeCount`, JD context, required vs preferred)
- **ATS analysis**, **keyword analysis** (found vs missing, honesty warnings), strong-candidate **benchmark** (based on explicit requirements and role expectations — never private candidate data), strengths/weaknesses, **priorities**, and honest **resume rewrites** (Accept / Edit / Reject — never auto-applied, never invents numbers)

### Feature 2 — Career Readiness Agent
- **Readiness state** (`Ready` / `Nearly Ready` / `Needs Work` / `Insufficient Evidence`) — an evidence-based state, explicitly *not* a hiring probability
- **What is holding you back?** — top 3–5 blockers, each with source, explanation, evidence, and recommended action
- **Hiring Manager View** — labeled "AI hiring-manager perspective": first impression, what stands out, what gets skimmed, what raises questions
- **Gap engine** with statuses and "never say missing when it might just lack evidence" semantics
- **Fix First** — transparent prioritization
- **Missions** — generated from real gaps (BUILD / PROVE / IMPROVE types), tracked with steps and progress; completing one routes the submission through an AI review that recomputes the verdict from evidence
- **Career Agent tab** — next-move recommendation with a decision log, plus a global **Agent Activity** page showing every real agent state change

### Feature 3 — AI Application Agent
- Paste a job description (or URL); JobProof runs the **real Feature 1 pipeline** on it — it never searches or invents listings
- **Prioritized queue** (Apply First / Review / Low Fit) with transparent reasons ("48% match, 14 required keywords missing")
- **Customize flow** — Feature 1's rewriter + humanizer with Accept / Edit / Reject per suggestion, a keyword-honesty list ("only add if you genuinely have it"), saved **versions** per job, and TXT / DOC / PDF-print export
- Application tracking with status history

### Feature 4 — Proof & Verification Agent
- **Skill proof map**: for every skill — the claim, the evidence on file, what the evidence supports, and what it does *not* establish
- **Adaptive interview** — 7 questions generated from the user's real projects and claims; difficulty adapts per skill; transparent scoring (coverage / articulation / clarity) that is labeled as measuring articulation, not ground truth
- Interview results become **evidence** with strength derived from the actual assessment; the verifier records every status change in a timestamped **verification history**
- Downloadable **JobProof Verification Report** (TXT), explicitly labeled as *not* an employer certification or accreditation

### Feature 5 — Company Target Mode
"I want to become ready for THIS company and THIS role."

- Create multiple targets (company + role + location + level), each with its own requirements, gaps, missions, targeted resume, and progress; switch between them at any time
- Requirements come **only from the job posting the user supplies** (official careers text, a URL, or pasted text) and every requirement carries a source label: **OFFICIAL REQUIREMENT** (user-marked official source), **EXTERNAL SOURCE**, **AI-INFERRED** (role knowledge — used only when no posting is supplied, always labeled), **USER EVIDENCE**
- **My Match & Gaps** reuses the locked match + verifier engines against the target posting: critical / partial / covered per skill, with one-click "Create mission" into the existing mission system (target missions are tagged with the company and never overwrite others)
- **Resume Targeting**: the resume is rendered with inline highlights (weak wording / touches a required skill / strong evidence); every suggested change is categorized REQUIRED / RECOMMENDED / OPTIONAL with Before / After / Why / Evidence used, and Accept / Edit yourself / Reject — accepted changes are humanized into a **separate targeted copy**; the original resume is never modified
- **Interview Prep** per target: technical / project-based / behavioral / resume-based questions generated from the posting and the user's own evidence — explicitly *not* presented as real company interview questions
- **Roadmap** (4 working weeks), **daily next action**, targeted **scorecard** (requirement coverage, evidence strength, keyword coverage, ATS readability — explicitly not a hiring prediction), refresh research, and a downloadable **Company Target Report**
- Entry points: the new **Company Target** nav item, or **"Train for this target"** on any Job Match result (reuses that analysis — no duplicate job analysis)

---

## Architecture

A deliberate split: a **Python backend** (stdlib only — no pip dependencies) owns persistence, analysis, and file extraction; the frontend is dependency-free vanilla JS. The same engine logic exists on both sides, so the app **degrades gracefully to fully in-browser mode** if the backend is unreachable.

```
┌──────────── browser ────────────┐         ┌───────────── backend (Python) ─────────────┐
│  index.html (landing)           │  HTTP   │  backend/app.py   threaded HTTP server     │
│  app.html (application)         │ ──────► │    GET/POST/DELETE /api/state              │
│  js/*  (engine mirror + UI)     │         │    POST /api/analyze   ← engine.py port    │
│  localStorage = offline cache   │         │    POST /api/extract   ← PDF/DOCX/TXT      │
│                                 │         │  backend/engine.py  analysis engine port   │
└─────────────────────────────────┘         │  backend/data/jobproof.db   (SQLite, WAL)  │
                                            └─────────────────────────────────────────────┘
```

- **Workspaces**: each browser gets a workspace code (`X-Workspace` header, e.g. `K7P2-M4XQ`). Entering the same code on another device (Settings → Link device) opens the same profile — real multi-device sync.
- **Persistence**: every state change is pushed to SQLite (`backend/data/jobproof.db`) and kept locally; the app works offline and catches up on reconnect.
- **Analysis runs server-side** (`POST /api/analyze`) via `backend/engine.py`, a faithful port of the JS engine — same weights, thresholds, and wording. Falls back to the identical in-browser engine if the server hiccups.
- **File extraction runs server-side** (`POST /api/extract`): pure-Python PDF text extraction, DOCX via stdlib zipfile, TXT. Scanned PDFs return an honest error.
- All modules attach to a single `window.JP` namespace; no build step, no npm.

```
backend/
├── app.py            HTTP server, routing, SQLite store, multipart upload
├── engine.py         analysis engine: taxonomy, JD+resume parsing, match,
│                     ATS, keywords, insights, priorities, rewrites, humanizer
└── data/jobproof.db  SQLite (created on first run)
```

```
js/
├── core.js          store (localStorage mirror + server sync), utils, uid
├── api.js           backend client: connect/hydrate, state push, analyze, extract, device linking
├── taxonomy.js      skill/keyword taxonomy matcher
├── roles.js         role hints for detection
├── fileio.js        PDF / DOCX / TXT extraction (pdf.js, mammoth.js)
├── parse.js         resume parser → structured model + skills + risks
├── jd.js            job-description parser
├── analysis.js      match engine (per-requirement evidence)
├── insights.js      hiring-manager view, benchmark, honest mode, priorities
├── rewrite.js       bullet rewriter + humanizer (never invents facts)
├── pipeline.js      JP.runAnalysis orchestrates Feature 1 stages
├── results.js       Feature 1 results rendering
├── github.js        GitHub Agent — public repo evidence via the REST API
├── verifier.js      Evidence Engine — claim/evidence ledger, statuses, gaps, history
├── missions.js      Mission Planner — gap → mission sync, progress, statuses
├── interview.js     Interview Agent — adaptive questions, evaluation, evidence
├── agents.js        Orchestrator — runAssessment, readiness, nextAction, logging
├── modals.js        add-evidence + mission-complete → AI review modals
├── career.js        Feature 2 UI (Career Readiness + Agent Activity)
├── applications.js  Feature 3 UI (Application Agent)
├── proof.js         Feature 4 UI (Proof Center)
├── company.js       Feature 5 UI (Company Target Mode) — additive
├── demo.js          Demo mode (sample candidate through the real pipeline)
└── app.js           router, navigation, home, settings
```

## Agent architecture

The orchestrator coordinates five specialist agents over the shared store (server-side state, mirrored in the browser):

| Agent | Role | Evidence sources |
|---|---|---|
| **Orchestrator** (`agents.js`) | Sequences the run, computes readiness, picks the next action, logs every state change | all agents |
| **Job Market Agent** | Parses/validates the stored job description into requirements | pasted JD |
| **Resume Agent** | Extracts claims: skills, projects, dated experience, bullet quality | uploaded resume |
| **GitHub Agent** (`github.js`) | Inspects public repositories (languages, topics, activity) for claimed skills; degrades gracefully to `NEEDS_INPUT` when no username is set | public GitHub API |
| **Evidence Engine** (`verifier.js`) | The only component allowed to change a skill's status; recomputes the ledger from evidence, records history | GitHub, projects, certificates, interviews, missions, user submissions |
| **Mission Planner** (`missions.js`) | Converts unresolved gaps into missions and tracks their lifecycle | verifier gaps |
| **Interview Agent** (`interview.js`) | Adaptive questioning; its assessments feed back into the Evidence Engine | user's answers |

**Status semantics (never fabricated):**

- `VERIFIED` — practical evidence **and** (independent validation or a strong interview)
- `PARTIAL` — practical evidence without validation, or meaningful-but-incomplete support
- `INSUFFICIENT EVIDENCE` — required by the role, nothing on file
- `NOT VERIFIED` — claim exists but evidence does not support it

Evidence weights: GitHub/project 1.6 · interview up to 1.8 (by assessment strength) · mission 1.2 · certificate/course 0.6 (learning evidence only — never counts as practical proof).

## Tech stack

- **Backend**: Python 3 stdlib only — `http.server` (threaded), `sqlite3` (WAL mode), `zipfile` for DOCX, `zlib` for PDF streams. Zero pip dependencies.
- **Frontend**: HTML5 / CSS3 / vanilla JavaScript (no framework, no build step)
- **pdf.js** and **mammoth.js** (vendored) as the in-browser fallback extractors
- **SQLite** (`backend/data/jobproof.db`) as the database — workspaces, state, and an append-only event log
- GitHub REST API (optional, keyless, public endpoints only)

## Setup instructions

Requirements: Python 3.9+ (nothing else — no pip installs).

```bash
# from the project root
python backend/app.py
# → JobProof AI backend listening on http://0.0.0.0:8741
# then open http://127.0.0.1:8741/
```

Optional environment variables: `JOBPROOF_PORT` (default `8741`). The SQLite database is created automatically at `backend/data/jobproof.db` on first run.

## Environment variables

- `JOBPROOF_PORT` — server port (defaults to 8741)
- No API keys, no secrets, no telemetry. The GitHub integration uses unauthenticated public endpoints only.

## Database setup

Nothing to install: SQLite ships with Python. Tables are created on first run:

- `workspaces` — one row per workspace code: the full JSON state + timestamps
- `events` — append-only log (workspace created, state merges, analyses, extractions)

**Backup**: copy `backend/data/jobproof.db`. **Wipe a workspace**: Settings → Delete everything (removes server + local copies), or `DELETE /api/state` with the workspace header.

## Running frontend / backend

```bash
python backend/app.py          # backend + static frontend on :8741
```

- **Frontend**: http://127.0.0.1:8741/ (landing) → **Get Started** → `app.html`
- **Backend API**: http://127.0.0.1:8741/api/health (plus `/api/state`, `/api/analyze`, `/api/extract` — see below)
- The frontend is served by the same process; there is no separate frontend server to run. Opening `app.html` from any static server still works — the app then runs in its fully in-browser fallback mode.

## API documentation

All endpoints take/return JSON; the workspace is selected via the `X-Workspace` header.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/health` | — | `{ok, engine, version, time}` |
| GET | `/api/state` | — | `{ok, workspace, state}` (creates the workspace if new) |
| POST | `/api/state` | any shallow state patch | `{ok, workspace, state}` (merged) |
| DELETE | `/api/state` | — | `{ok: true}` (wipes the workspace) |
| POST | `/api/analyze` | `{resumeText, resumeMeta?, job:{text, mode?, title?, company?, url?}}` | `{ok, analysis}` — full Feature-1 result (match, ats, keywords, insights, benchmark, honest, priorities, rewrites, summaryRewrite, final) |
| POST | `/api/extract` | multipart `file` field | `{ok, text, kind, fileName}` — PDF/DOCX/TXT extraction |

`state` shape: `{resume, job, analysis, edits, settings, profile, f2, f3, f4, activity, version}` — see the feature sections above.

## Demo mode

On the app home screen: **Run live demo (sample candidate)**.

- Seeds a sample candidate (Alex Kumar, targeting *AI/ML Engineer Intern*) and clearly-labeled demo evidence
- Runs the **same real pipeline** the product uses for real users — parsing, matching, verification, missions — no separate fake code path
- Intentionally leaves SQL and deployment without evidence so the demo shows genuine gap detection and mission generation
- Ends on the Career Readiness page where every number is computed from the demo evidence

## API documentation (the `window.JP` surface)

- `JP.parseResume(text, meta)` → structured resume model; `JP.parseJobDescription(text, details)`
- `JP.runAnalysis(resumeText, resumeMeta, jobInput, onStage)` → `Promise<analysis>` (stages reported via `onStage(key, index, total, label)`)
- `JP.store` — `get / save / setResume / setJob / setAnalysis / deleteAll / f2() / f3() / uid() / profile()`
- `JP.agents` — `runAssessment({onStep})`, `readinessState()`, `nextAction()`, `log(agent, state, text)`, `S` (state enum)
- `JP.verifier` — `computeAll({resume, analysis})` → `{skills[], gaps[], …}`, `addEvidence({...})`
- `JP.missions` — `syncFromGaps(gaps)`, `setStatus(id, status)`
- `JP.interview` — `start()`, `nextQuestion()`, `submitAnswer()`, `complete()`, `latest()`, `evaluate()`
- `JP.github` — public-API evidence lookup with graceful `NEEDS_INPUT`
- `JP.modals` — `openEvidence(skill, cb)`, `openMissionComplete(mission, cb)`
- `JP.app` — `showView(name)`; `JP.ui` — `toast(msg)`, `openEditModal(value, cb)`
- `JP.career / JP.applications / JP.proof / JP.company` — per-feature `render()` entry points; `JP.company.fromCurrentJob()` bridges a Job Match result into a target

## Development notes

- After editing any `js/*.js`, bump its `?v=` query string in `app.html` — browsers aggressively cache script URLs.
- `tools/check_js.py` is a bracket-balance helper; it has known false positives on regex literals containing `//` or quotes inside character classes (e.g. `core.js`, `parse.js`, `applications.js`). The browser console is the authoritative check.
- Test fixtures: `test-resume.txt`, `test-jd.txt`.

## Future improvements

- Sync the ledger to a user-provided GitHub profile automatically on each run
- Export the verification report as PDF with embedded evidence links
- Shareable read-only "proof page" the candidate can attach to applications
- Spaced re-verification reminders ("Next verification date") per skill
- Optional on-device LLM for richer interview evaluation, with the same no-fabrication contract
- i18n and additional resume templates for the DOC export

---

JobProof AI — *"Don't just claim you're job-ready. Prove it."*
