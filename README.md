# Hyunk AI Hub 🚀

> **Production-grade unified multi-provider AI chat platform** with intelligent quota fallback, real-time streaming, and AES-256-GCM encrypted server-side credential management.

[![Next.js](https://img.shields.io/badge/Next.js-14.2-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20RLS-3ecf8e?logo=supabase)](https://supabase.com/)
[![Vitest](https://img.shields.io/badge/Vitest-Passing-green?logo=vitest)](https://vitest.dev/)

---

## 🌟 Overview & Architecture

**Hyunk AI Hub** connects two frontier AI API gateways into a single high-availability interface:

1. **Radox AI** (`https://radoxai.com/v1`) — High-performance gateway for Claude Opus 4.8, GPT-4o, DeepSeek-V3, and DeepSeek-R1.
2. **Intern InkStone** (`https://chat.intern-ai.org.cn/api/v1`) — Shanghai AI Laboratory flagship research models (InternLM Latest, InternLM 2.5 7B, InternVL 2.5 Multimodal).

```
                  ┌────────────────────────────────────────┐
                  │            Hyunk AI Hub UI             │
                  │  (Streaming Markdown, Code Highlight)  │
                  └───────────────────┬────────────────────┘
                                      │ User Message / Options
                                      ▼
                  ┌────────────────────────────────────────┐
                  │       Route Execution & Fallback       │
                  │        (src/lib/ai/router.ts)          │
                  └───────┬──────────────────────┬─────────┘
                          │                      │
             [Primary]    │                      │  [Fallback]
                          ▼                      ▼
                   ┌──────────────┐      ┌──────────────┐
                   │   Radox AI   │ ◄──► │Intern InkStone│
                   │    (v1)      │      │   (v1 API)   │
                   └──────────────┘      └──────────────┘
                          │                      │
                          └───────────┬──────────┘
                                      ▼
                  ┌────────────────────────────────────────┐
                  │    Telemetry & Quota Health Tracker    │
                  │    • Tokens / Cost / HTTP 429 Status   │
                  │    • AES-256-GCM Encrypted Storage     │
                  └────────────────────────────────────────┘
```

---

## ✨ Key Features

- **Multi-Provider & Model Registry**: Unified model catalog with context window, pricing metadata, multimodal vision indicators, and fallback configurations.
- **Automated Non-Destructive Fallback**: If an active provider runs out of quota (HTTP 429), encounters rate limits, or times out, the router automatically preserves conversation context and switches to a secondary authorized provider, alerting the user in real-time.
- **Zero API Key Leakage**: API credentials remain strictly server-side. Persistent credentials in Supabase or local storage are encrypted with **AES-256-GCM** authenticated cipher. Masked representations (`sk-****1234`) are shown in the UI.
- **Live Quota & Usage Telemetry**: Dashboard displaying real-time requests count, input/output tokens, estimated USD spend, last success time, and normalized error logs.
- **Full Conversation History**: Persisted in Supabase PostgreSQL with strict Row Level Security (RLS) policies, or in-memory fallback during local development.
- **Persistent Folders & Parameters**: Conversations are grouped in per-user folders (`conversation_folders`) and remember their own system prompt and temperature, persisted in PostgreSQL.
- **Per-User Daily Quota**: Every AI request is accounted in `usage_logs` (atomic RPC, race free). The default limit is 200 requests/day per user and answers with HTTP 429 once exhausted.
- **Agent Skills (Progressive Disclosure)**: A skill library stored in Supabase. The model only receives the *name + description* of every skill; the full body is loaded on demand the moment the agent decides to use it (`<skill_use skill="..."/>`). **28 built-in skills** ship with the platform (engineering, devops, data, writing, research, security, productivity, language) and users can browse, pin and author their own skills from the **Skills** panel.
- **Preset Personas**: A pinned skill becomes a manual persona that is injected into every request (agent *and* standard chat mode).
- **Autonomous Agent Loop**: In agent mode the model can call tools (`web_search`, `fetch_url`, `http_request`, `code_interpreter`, `calculator`, `datetime`) and load skills. Every result is fed back to the model, which continues with the next step until it produces the final answer. The UI shows the whole **Agent Execution Timeline**.
- **Six Thinking Hats (Premium 3+)**: a dedicated panel that looks at one topic from six angles at once. Every hat is a separate AI request with its own system prompt: 🤍 White Hat (fakta & data), ❤️ Red Hat (emosi & intuisi), 🖤 Black Hat (risiko), 💛 Yellow Hat (peluang), 💚 Green Hat (ide kreatif) and 💙 Blue Hat (rangkuman + langkah selanjutnya). The first five run in parallel and stream into their card, the Blue Hat runs last and summarises the other five. The whole analysis costs **six requests** of the daily quota, is stored in the conversation history as one markdown message and can be copied or regenerated. The feature is reserved for **Premium 3, Premium 4 and the administrator**: a lower tier sees the button locked with a "Butuh Premium 3" tooltip.
- **AI Memory (Cross Conversation Memory)**: the assistant remembers the facts you ask it to keep (your name, your stack, your preferred style). Memories are extracted automatically from explicit statements, can be added with `/remember <fact>` and removed with `/forget <fact>`, and are injected into the system prompt of every following conversation. A dedicated panel lists them, with an on/off switch per entry.
- **Command Palette (Ctrl/Cmd + K)**: a searchable palette with the most common actions (new chat, switch to agent mode, open the tools, the skills, the memory, the schedules, the trash, share, export, theme, notifications) and a **Prompt Library** with eight built-in templates plus your own, saved directly from the composer.
- **Scheduled Runs (cron)**: background prompts that run on their own schedule (`0 9 * * *`, `0 8 * * 1-5`, ...). Each run is stored as a new conversation, and the panel shows the next run, the last result and a **Run now** button. On a serverless platform the schedules are evaluated by the client while the app is open.
- **Public Share Links**: turn a conversation into a read-only public page (`/share/<token>`) that anyone can read, with a revoke button. The share token is the only credential, so the reader does not need an account.
- **Message Feedback**: a thumbs up / thumbs down on every answer, stored per message so the quality of the model can be tracked.
- **Trash & Restore**: deleting a conversation moves it to the trash instead of removing it, and the **Sampah** panel restores it (or deletes it for good).
- **Tags & Filter**: label conversations with any number of tags and filter the sidebar by them.
- **Context Meter**: a live indicator of how much of the model context window the conversation already uses (the meter turns amber at 80% and red on an overflow).
- **Completion Notifications**: the browser can announce a finished answer with a system notification, which is handy when a long response runs while you are in another tab.
- **Usage Activity Chart**: the dashboard now shows the requests and the tokens of the last seven days as a bar chart, next to the aggregated counters.
- **Security & Developer Tool Suite** (11 new tools, usable in agent mode *and* from the **Tools** panel):
  - `website_security_scan` — non destructive security assessment of a website: TLS protocol/cipher and certificate expiry, HSTS/CSP/X-Frame-Options/X-Content-Type-Options/Referrer-Policy/Permissions-Policy/COOP, cookie `Secure`/`HttpOnly`/`SameSite` flags, CORS misconfiguration (wildcard + credentials), mixed content, version disclosure, secrets leaked in the page source and sensitive files that are publicly reachable (`.env`, `.git/HEAD`, `Dockerfile`, SQL dumps, backups…). The result is a **score (0-100) with a grade A-F**, a list of findings per severity with the evidence and the recommendation, plus the raw data. Every request goes through the SSRF guard, only `GET`/`HEAD` is used, the body is capped and the scan is rate limited.
  - `dns_lookup` — A, AAAA, MX, TXT, NS and CNAME records plus the presence of the SPF and DMARC records.
  - `page_inspector` — meta tags, Open Graph, Twitter card, heading structure, images without `alt`, links, word count and the SEO/accessibility issues of a page.
  - `hash_calculate`, `base64_codec`, `json_select`, `regex_extract`, `unit_convert`, `password_entropy`, `cron_next`, `text_diff` — everyday developer utilities (SHA-256/SHA-512/HMAC, Base64, JSON path with wildcards, safe regex extraction with a ReDoS timeout, unit conversion, password strength and entropy, next cron runs, line diff).
  - The tools are only meant for websites the user owns or is authorised to test. The security scan is an **assessment** tool: it never brute forces, never sends exploit payloads and never performs a denial of service.
- **Android Ready Rendering**: The interface is tuned for Android phones and for the native Android build (`com.hyunk.aihub`, a WebView wrapper around this app):
  - The soft keyboard no longer covers the composer (`interactive-widget=resizes-content` plus a `visualViewport` listener that keeps the conversation pinned to the bottom).
  - Safe area insets are respected for the status bar, the gesture navigation bar and the notch in landscape.
  - No more tap flash, no pull-to-refresh glow, no double tap delay (`touch-action: manipulation`).
  - Form controls use a 16px font on mobile, so Chrome never zooms the page in on focus.
  - Icon buttons have a 40dp (32dp in dense rows) touch target.
  - The Android hardware back button closes the open overlay instead of leaving the app.
  - The launcher icons are shipped at their real resolution (192/512) plus a maskable variant, and the installed PWA may be rotated like the native build.
- **Edge Middleware Protection**: All `/api/*` routes (except the public auth, model catalog and status endpoints) require a valid HMAC signed session cookie — unauthenticated calls are rejected with HTTP 401 before reaching a handler.
- **Token Accounting**: Prompt/completion tokens reported by the provider are stored per message and rolled up into the daily usage log.
- **Modern Cyber-Slate Interface**:
  - Multiline auto-expanding textarea with `Shift+Enter` support.
  - Abort / Cancel generation in mid-stream.
  - Real-time Markdown rendering with GitHub Flavored Markdown (tables, blockquotes, lists).
  - Syntax highlighted code blocks with one-click **Copy Code** and language badges.
  - One-click **Regenerate Response** and **Copy Message**.
  - Accessible contrast, keyboard shortcuts, and responsive mobile drawer.
- **Role & Tier (6 level akses)**: tiap akun punya **role** — `admin`, `free`, `premium1`, `premium2`, `premium3`, `premium4` — yang menentukan tiga hal sekaligus: kuota request per hari, panjang maksimum jawaban, dan model apa saja yang boleh dipakai.
  | Role | Tier | Request / hari | Maks token | Riwayat |
  |------|------|----------------|------------|---------|
  | 🆓 Free | 0 | 20 | 2.048 | 10 pesan |
  | ⭐ Premium 1 | 1 | 100 | 4.096 | 30 pesan |
  | ⭐⭐ Premium 2 | 2 | 200 | 8.192 | 50 pesan |
  | ⭐⭐⭐ Premium 3 | 3 | 500 | 16.000 | 80 pesan |
  | 💎 Premium 4 | 4 | 1.000 | 32.000 | 100 pesan |
  | 👑 Admin | 4 | tanpa batas | 32.000 | 100 pesan |

  Setiap model punya `minTier`: model yang butuh tier lebih tinggi tampil **terkunci 🔒** di model selector dengan tooltip "Butuh Premium X", dan server menolak request-nya dengan **403**. Fallback otomatis juga tidak pernah membuka model di luar tier akun. Role disimpan di tabel `user_roles` (hanya service role yang boleh akses, jadi user tidak bisa menaikkan role-nya sendiri), dengan fallback ke `user_metadata.role` lalu ke paket langganan. Semua batas bisa dituning lewat environment variable (`FREE_DAILY_REQUEST_LIMIT`, `PREMIUM2_MAX_TOKENS`, …).
- **Collision Free Toolbar**: every action sits directly in the header (**Skills**, **Tools**, **Palette**, **Memory**, **Jadwal**, **Share**, **Sampah**, **Export**, **Download**, **Key Pool**) as a compact icon button with its name in the tooltip, so there is no extra "More" click and the buttons can never overlap on a narrow laptop. The model selector shrinks with an ellipsis instead of being squeezed, and the toolbar scrolls as a last resort.
- **Working Sidebar Toggle**: the hamburger button collapses the sidebar on a desktop (the chat area then uses the full width) and opens the drawer on a phone. The icon follows the state and `Ctrl+B` does the same.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict mode enabled)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Validation**: Zod
- **Database**: Supabase PostgreSQL with Row Level Security (RLS)
- **Testing**: Vitest unit test suite

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js `>= 18.18.0`
- npm or pnpm

### 2. Clone the Repository
```bash
git clone https://github.com/cahyunk132-ai/website-ai.git
cd website-ai
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Fill in your provider API keys and encryption key:
```env
# AI Providers (Server-side only)
RADOX_API_KEY=your_radox_api_key_here
INKSTONE_API_KEY=your_inkstone_api_key_here

# Supabase (Optional for memory/local dev mode)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# AES-256-GCM Encryption Key (64-character hex string)
APP_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

> **Tip:** You can generate a random 32-byte encryption key with:
> `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 5. Run Database Migrations (Supabase)
Apply the migrations in your Supabase SQL editor (in chronological order):
```bash
supabase/migrations/20261018000000_init_hyunk_ai_hub.sql   # base schema
supabase/migrations/20261019000001_fix_and_features.sql    # folders, quota, multi-key pool
supabase/migrations/20261019000002_roles.sql               # role & tier (user_roles, usage_logs.role)
supabase/migrations/20261020000000_agent_skills.sql        # skill library + 12 seeded skills
supabase/migrations/20261021000000_features_memory_share_schedule.sql  # memory, prompts, shares, feedback, schedules, tags, trash
supabase/migrations/20261022000000_premium_plans.sql        # subscription plans (free / premium)
supabase/migrations/20261024000000_agent_skills_expansion.sql  # full skill catalogue (28 skills)
```
Or via the Supabase CLI:
```bash
supabase db push
```

> **Note:** a single typo in a migration file aborts the whole script, so none of
> the tables are created. `npm test` parses every migration and fails when a type
> name is misspelled (`timestamp with time zone`, …), when a dollar quoted block is
> not closed, or when the application queries a table or writes a column that the
> migrations do not declare.

The second migration adds:
- `conversations.folder_id` / `system_prompt` / `temperature`
- the persistent `conversation_folders` table (per-user folders)
- the `usage_logs` table with the atomic `increment_daily_usage` / `add_usage_tokens` RPC helpers
- multi-key support for `provider_settings` (unique on `(provider, encrypted_api_key)`)

The third migration adds the `skills` table (system skills, user skills and pinned
presets) with RLS policies and an idempotent seed of the 12 built-in skills
(code review, debugging, test authoring, API design, security audit, deep research,
technical writing, SEO content, data analysis, SQL analyst, product spec and prompt
engineering).

The fifth migration adds the `user_plans` table (`plan` = `free` | `premium`,
`premium_until`) plus the `get_user_plan()` resolver. The table is restricted to
the service role: the plan decides the daily quota, so it must never be writable
by the user himself.

The roles migration adds the `user_roles` table (the manual role override of an
administrator: `admin` | `free` | `premium1` .. `premium4`) and the `role` column of
`usage_logs`, so the usage can be attributed to a tier. The table is restricted to
the service role, the RLS policy only allows administrators to read and write it.
The seeded administrator (`admin@hyunkai.com`) receives the `admin` role.

The fourth migration adds the storage of the new features: the `user_memories` table
(AI memory), `user_prompts` (prompt library), `conversation_shares` (public share
links), `message_feedback` (thumbs up / down), `scheduled_runs` (cron) plus the
`tags` and `deleted_at` columns on `conversations` (tags and trash). Every statement
is idempotent (`if not exists` + a policy guard), so the file can safely be applied
again.

The last migration expands the catalogue to **28 built-in skills** and re-seeds the
whole library, so the database always matches `src/lib/skills/builtins.ts`. The 16
new skills are: refactoring, performance profiling, architecture design, dependency
upgrade, git workflow, docker containers, CI/CD, observability, machine learning, LLM
evaluation, data pipeline, business analysis, UX writing, email writer, translation &
localization and Indonesian content. Two categories are added with them: `devops` and
`language`.

> The seed file is generated: run `node scripts/generate-skill-migration.js` after
> editing `src/lib/skills/builtins.ts`, and `npm test` fails when the SQL and the
> TypeScript library drift apart.

> **Note:** `SUPABASE_SERVICE_ROLE_KEY` is required for the folder persistence, the daily
> quota accounting and the encrypted credential pool — those tables are restricted to the
> service role by Row Level Security.

### 6. Start the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to start chatting.

Default accounts (seeded into Supabase Auth on first login, and available in local
memory mode):

| Role       | Email                | Password      |
| ---------- | -------------------- | ------------- |
| 👑 Admin   | `admin@hyunkai.com`  | `Password123!`|
| 🆓 Free    | `demo@hyunkai.com`   | `demo1234`    |

Every new account starts on the role `free` (tier 0). The role of an account is
changed by an administrator on the page `/admin/users` (or in the Hyunk Premium
panel): it is written to the `user_roles` table and applies to the very next
request - a new login is not needed.

### 7. Run Unit Tests
```bash
npm test
```

---

## 📂 Project Structure

```
website-ai/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/route.ts          # SSE streaming endpoint with automatic fallback
│   │   │   ├── models/route.ts        # Model capability catalog
│   │   │   ├── status/route.ts        # Real-time telemetry and quota metrics
│   │   │   ├── settings/route.ts      # Encrypted credential management
│   │   │   ├── folders/               # Persistent per-user folder endpoints
│   │   │   ├── skills/                # Skill library endpoints (list/create/pin)
│   │   │   ├── tools/run/route.ts     # Manual runner for the security & utility tools
│   │   │   ├── six-hats/route.ts      # Six Thinking Hats (6 AI requests, Premium 3+)
│   │   │   ├── memories/route.ts      # AI memory (CRUD)
│   │   │   ├── prompts/route.ts       # Prompt library (CRUD)
│   │   │   ├── schedules/route.ts     # Scheduled runs (CRUD)
│   │   │   ├── schedules/tick/route.ts # Executes the due schedules
│   │   │   ├── share/route.ts         # Public share links (owner side)
│   │   │   ├── share/[token]/route.ts # Public share reader (no login)
│   │   │   ├── feedback/route.ts      # Thumbs up / down per message
│   │   │   ├── usage/daily/route.ts   # Daily usage for the activity chart
│   │   │   ├── premium/route.ts       # Plan, quota and upgrade of the account
│   │   │   ├── admin/users/route.ts   # Admin API: list users & change their role
│   │   │   └── conversations/         # Conversation CRUD endpoints
│   │   ├── globals.css                # Dark theme & styling
│   │   ├── layout.tsx                 # Root layout & metadata
│   │   └── page.tsx                   # Main chat interface
│   ├── admin/
│   │   └── users/page.tsx             # Admin page: manage the role of the users
│   ├── components/
│   │   ├── Sidebar.tsx                # History & navigation drawer
│   │   ├── ModelSelector.tsx          # Provider & model picker (locks a higher tier)
│   │   ├── UsageDashboardModal.tsx    # Quota telemetry modal
│   │   ├── SettingsModal.tsx          # API key encryption modal
│   │   ├── SkillsModal.tsx            # Skill library: browse, pin, author
│   │   ├── ToolsPanel.tsx             # Manual runner for the 11 new tools
│   │   ├── SixHatsPanel.tsx           # Six Thinking Hats: 6 streaming cards + summary
│   │   ├── CommandPalette.tsx         # Ctrl/Cmd+K palette + prompt library
│   │   ├── MemoryPanel.tsx            # AI memory management
│   │   ├── SchedulesPanel.tsx         # Cron schedules
│   │   ├── ShareModal.tsx             # Public share link
│   │   ├── TrashModal.tsx             # Trash & restore
│   │   ├── UsageChart.tsx             # 7 day activity chart
│   │   ├── ContextMeter.tsx           # Context window indicator
│   │   ├── PremiumPanel.tsx           # Tier ladder, quota and upgrade
│   │   ├── QuotaMeter.tsx             # Daily request quota in the composer
│   │   ├── AdminUsersPanel.tsx        # Admin table: role per user & usage today
│   │   ├── AgentReasoningCard.tsx     # Reasoning, tool outputs & agent timeline
│   │   └── ui/
│   │       ├── CodeBlock.tsx          # Syntax highlighted code
│   │       └── MarkdownRenderer.tsx   # GFM markdown renderer
│   ├── middleware.ts                   # Edge route protection for /api/*
│   └── lib/
│       ├── ai/
│       │   ├── types.ts               # Core AI contracts
│       │   ├── errors.ts              # Normalized error classes
│       │   ├── models.ts              # Model capability registry (with minTier)
│       │   ├── tiers.ts               # Role & tier definitions (quota, tokens, context)
│       │   ├── sixHats.ts             # Six Thinking Hats: the six hats & the markdown
│       │   ├── usage.ts               # Token estimation & metrics
│       │   ├── router.ts              # Fallback router engine
│       │   ├── tools.ts               # Agent tool registry & sandboxed executors
│       │   ├── agent.ts               # Autonomous multi-step agent loop
│       │   ├── agentProtocol.ts       # Agent protocol parser & prompt builders
│       │   ├── agentEvents.ts         # Shared agent view types
│       │   ├── tools/
│       │   │   ├── security.ts         # Website security assessment engine
│       │   │   ├── inspector.ts        # Page metadata & content inspector
│       │   │   └── utility.ts          # Hash, base64, JSON, regex, units, cron, diff
│       │   └── providers/
│       │       ├── radox.ts           # Radox AI adapter
│       │       └── inkstone.ts        # Intern InkStone adapter
│       ├── skills/
│       │   ├── types.ts               # Skill contracts
│       │   ├── builtins.ts            # 28 built-in skill definitions
│       │   └── registry.ts            # Supabase skill registry & fallbacks
│       ├── auth.ts                    # Login/register, Supabase seeding, sessions
│       ├── sessionToken.ts            # Edge safe HMAC session tokens
│       ├── conversationTitle.ts       # Shared title generator
│       ├── featureStorage.ts          # Memory, prompts, shares, feedback, schedules
│       ├── memory.ts                  # Memory extraction engine
│       ├── contextMeter.ts            # Context window estimation
│       ├── plans.ts                   # Free / premium plans and the daily quota
│       ├── roles.ts                   # Role storage & resolution (user_roles)
│       ├── scheduleRunner.ts          # Cron evaluation & execution
│       ├── crypto.ts                  # AES-256-GCM encryption & redaction
│       └── storage.ts                 # Database & in-memory persistence
├── scripts/
│   └── generate-skill-migration.js  # regenerates the SQL seed of the skills
├── supabase/
│   └── migrations/
│       ├── 20261018000000_init_hyunk_ai_hub.sql
│       ├── 20261019000001_fix_and_features.sql
│       ├── 20261020000000_agent_skills.sql
│       ├── 20261021000000_features_memory_share_schedule.sql
│       └── 20261024000000_agent_skills_expansion.sql
├── vitest.config.ts
├── tailwind.config.ts
└── next.config.mjs
```

---

## 🛡️ Security & Provider Compliance

- **No Credential Exposure**: Client code never handles or receives raw API keys.
- **Provider Anti-Abuse Adherence**: The automatic fallback engine strictly respects provider rate limits, bounds exponential retries, and never attempts unauthorized account rotation.
- **Secret Redaction**: Logging mechanisms automatically filter and redact authorization headers and API tokens.
- **Secure HTTP Headers**: Configured with strict `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy`.
- **Signed Sessions**: Session cookies are HMAC-SHA256 signed and verified in constant time; invalid or expired cookies are rejected by the Edge middleware and cleared.
- **Per-User Quota**: A daily request budget (200 requests) is enforced per account through atomic database counters, so a single user cannot exhaust the shared provider quota.
- **Safe Tool Execution**: Every tool that reaches the network goes through the SSRF guard (`assertSafeUrl`), which rejects loopback, private, link-local and cloud metadata addresses. The security scan re-validates the target on **every redirect hop**, only issues `GET`/`HEAD` requests, caps the response body (512 KB), applies a request timeout and a maximum number of requests per scan, and never executes an exploit payload.

---

## 🚢 Deployment (Vercel)

1. Push your repository to GitHub (`cahyunk132-ai/website-ai`).
2. Import the project into [Vercel](https://vercel.com).
3. Set the environment variables in Vercel Project Settings (`RADOX_API_KEY`, `INKSTONE_API_KEY`, `APP_ENCRYPTION_KEY`, `SUPABASE_URL`, etc.).
4. Click **Deploy**.

---

## 📄 License
MIT License. Built for **Hyunk AI Hub**.
