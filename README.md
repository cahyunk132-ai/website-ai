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
- **Agent Skills (Progressive Disclosure)**: A skill library stored in Supabase. The model only receives the *name + description* of every skill; the full body is loaded on demand the moment the agent decides to use it (`<skill_use skill="..."/>`). Users can browse, pin and author their own skills from the **Skills** panel.
- **Preset Personas**: A pinned skill becomes a manual persona that is injected into every request (agent *and* standard chat mode).
- **Autonomous Agent Loop**: In agent mode the model can call tools (`web_search`, `fetch_url`, `http_request`, `code_interpreter`, `calculator`, `datetime`) and load skills. Every result is fed back to the model, which continues with the next step until it produces the final answer. The UI shows the whole **Agent Execution Timeline**.
- **Edge Middleware Protection**: All `/api/*` routes (except the public auth, model catalog and status endpoints) require a valid HMAC signed session cookie — unauthenticated calls are rejected with HTTP 401 before reaching a handler.
- **Token Accounting**: Prompt/completion tokens reported by the provider are stored per message and rolled up into the daily usage log.
- **Modern Cyber-Slate Interface**:
  - Multiline auto-expanding textarea with `Shift+Enter` support.
  - Abort / Cancel generation in mid-stream.
  - Real-time Markdown rendering with GitHub Flavored Markdown (tables, blockquotes, lists).
  - Syntax highlighted code blocks with one-click **Copy Code** and language badges.
  - One-click **Regenerate Response** and **Copy Message**.
  - Accessible contrast, keyboard shortcuts, and responsive mobile drawer.

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
supabase/migrations/20261020000000_agent_skills.sql        # skill library + 12 seeded skills
```
Or via the Supabase CLI:
```bash
supabase db push
```

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

| Role  | Email                | Password      |
| ----- | -------------------- | ------------- |
| Admin | `admin@hyunkai.com`  | `Password123!`|
| User  | `demo@hyunkai.com`   | `demo1234`    |

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
│   │   │   └── conversations/         # Conversation CRUD endpoints
│   │   ├── globals.css                # Dark theme & styling
│   │   ├── layout.tsx                 # Root layout & metadata
│   │   └── page.tsx                   # Main chat interface
│   ├── components/
│   │   ├── Sidebar.tsx                # History & navigation drawer
│   │   ├── ModelSelector.tsx          # Provider & model picker
│   │   ├── UsageDashboardModal.tsx    # Quota telemetry modal
│   │   ├── SettingsModal.tsx          # API key encryption modal
│   │   ├── SkillsModal.tsx            # Skill library: browse, pin, author
│   │   ├── AgentReasoningCard.tsx     # Reasoning, tool outputs & agent timeline
│   │   └── ui/
│   │       ├── CodeBlock.tsx          # Syntax highlighted code
│   │       └── MarkdownRenderer.tsx   # GFM markdown renderer
│   ├── middleware.ts                   # Edge route protection for /api/*
│   └── lib/
│       ├── ai/
│       │   ├── types.ts               # Core AI contracts
│       │   ├── errors.ts              # Normalized error classes
│       │   ├── models.ts              # Model capability registry
│       │   ├── usage.ts               # Token estimation & metrics
│       │   ├── router.ts              # Fallback router engine
│       │   ├── tools.ts               # Agent tool registry & sandboxed executors
│       │   ├── agent.ts               # Autonomous multi-step agent loop
│       │   ├── agentProtocol.ts       # Agent protocol parser & prompt builders
│       │   ├── agentEvents.ts         # Shared agent view types
│       │   └── providers/
│       │       ├── radox.ts           # Radox AI adapter
│       │       └── inkstone.ts        # Intern InkStone adapter
│       ├── skills/
│       │   ├── types.ts               # Skill contracts
│       │   ├── builtins.ts            # 12 built-in skill definitions
│       │   └── registry.ts            # Supabase skill registry & fallbacks
│       ├── auth.ts                    # Login/register, Supabase seeding, sessions
│       ├── sessionToken.ts            # Edge safe HMAC session tokens
│       ├── conversationTitle.ts       # Shared title generator
│       ├── crypto.ts                  # AES-256-GCM encryption & redaction
│       └── storage.ts                 # Database & in-memory persistence
├── supabase/
│   └── migrations/
│       ├── 20261018000000_init_hyunk_ai_hub.sql
│       ├── 20261019000001_fix_and_features.sql
│       └── 20261020000000_agent_skills.sql
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

---

## 🚢 Deployment (Vercel)

1. Push your repository to GitHub (`cahyunk132-ai/website-ai`).
2. Import the project into [Vercel](https://vercel.com).
3. Set the environment variables in Vercel Project Settings (`RADOX_API_KEY`, `INKSTONE_API_KEY`, `APP_ENCRYPTION_KEY`, `SUPABASE_URL`, etc.).
4. Click **Deploy**.

---

## 📄 License
MIT License. Built for **Hyunk AI Hub**.
