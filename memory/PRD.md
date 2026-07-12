# ViralLead Automator — PRD

## Original problem statement
Build a full-stack automation platform that:
1. Scrapes the public web for potential leads matching an ICP.
2. Conducts market research to find high-virality topics for the user's niche.
3. Writes LinkedIn posts in the user's voice.
4. Sends every post to the user for approval in a dashboard.
5. Analyzes past-post engagement and strategizes the next post.
6. Once approved, schedules posts.
7. Writes customized cold emails per lead, sends after approval.

Constraints the user emphasized:
- No login prompts anywhere.
- Emails written by Gemini; user expects Gmail delivery.
- Post writing done with Gemini Flash.
- Research from public forums + Gemini.
- Contacts from public data (company pages, WHOIS).
- Post scheduling via any free web app (one-time login).
- Positioning: "Consumer behavior based brand strategy and marketing executive."

## User personas
- **Solo operator / marketing executive** who needs to compound presence on LinkedIn while running client work. Wants a hands-off engine that respects their tone.

## Architecture
- **Backend**: FastAPI, MongoDB (motor), Gemini 3 Flash via `emergentintegrations` + EMERGENT_LLM_KEY.
- **Frontend**: React 19 + shadcn/ui, Manrope + IBM Plex Sans + JetBrains Mono. Dark "Electric & Neon" theme (Cyber Yellow accent #FFD700 on #050505). Recharts for insights.
- **No auth** (single-user MVP). Positioning stored as `profile.singleton`.
- **Collections**: profile, leads, research, posts, voice_qa, emails, jobs.

## Interpretation of no-login requirements
- **LinkedIn insights** → Gemini reasoning over the post text (+ optional public URL the user pastes). Not real-time scraping (LinkedIn blocks that). Marked `source: estimate | public`.
- **Gmail sending** → One-click Gmail-compose URL (`mail.google.com/mail/?view=cm&fs=1&to=...&su=...&body=...`) so the user's already-signed-in browser opens a prefilled compose; they click Send. Zero OAuth.
- **Post scheduling** → Optional Buffer or Publer API key pasted once in Settings (Publer POST attempted); otherwise the post stays in the local queue with `scheduled_for` and a copy-to-clipboard button.
- **Lead sources** → Public web only: company /about pages, Reddit, HN, IndieHackers, WHOIS records, product launch pages, podcast guests. Emails are pattern-guessed with `email_confidence: verified | guessed`.

## What's been implemented (Feb 2026)
- `POST /api/profile` + `GET /api/profile` — positioning, tone samples, scheduler keys, cadence.
- `POST /api/leads/discover` — Gemini-driven public-source lead generation (respects `leads_per_cycle`).
- `GET/PATCH/DELETE /api/leads` + CSV export.
- `POST /api/research/generate` — viral candidate topics with virality_score.
- `POST /api/posts/generate` — LinkedIn drafts in the user's voice, seeded by voice Q&A.
- `PATCH /api/posts/{id}` — approve / reject / edit inline.
- `POST /api/posts/{id}/schedule` — schedules locally + attempts Publer if key present.
- `POST /api/posts/{id}/metrics/refresh` — Gemini-estimated LinkedIn engagement + learnings.
- `POST /api/posts/strategy` — next-move strategy (patterns, gaps, next 3 topics, voice adjustment).
- `POST /api/voice-questions/generate` + `/answer` — anchor questions so posts sound like the user.
- `POST /api/emails/generate` — per-lead cold email drafts; UI opens Gmail-compose in a new tab.
- `GET /api/dashboard/summary` — counters + recent lists.
- Frontend: Command dashboard, Leads table + discovery dialog, Research grid, Post studio with tabs + inline edit + schedule, Insights (charts + strategy), Emails (Gmail-compose + mailto), Voice interview, Onboarding wizard, Settings (Buffer / Publer keys).
- Full data-testid coverage. Sonner toasts. Recharts engagement chart.
- Backend tests: 13/13 passing (iteration_1.json).

## Prioritized backlog
- **P1** Background scheduler / cron so discovery + research runs every N hours automatically (currently manual triggers).
- **P1** Save discovery runs history (jobs collection is written to but no UI yet).
- **P1** Google Sheets export of leads (the user asked for "sheets"; today we export CSV).
- **P2** Multi-user auth (currently single-tenant).
- **P2** Streaming (SSE) for long Gemini calls with progress indicator.
- **P2** Real Buffer API scheduling (currently intent-only; Publer already attempted).
- **P2** Post analytics via manual CSV import from LinkedIn export (higher accuracy than Gemini estimate).
- **P3** ICP presets / saved discovery templates.
- **P3** Rich onboarding — upload past posts as PDF/DOCX for tone fingerprinting.
