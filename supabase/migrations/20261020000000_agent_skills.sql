-- =============================================================================
-- Hyunk AI Hub - Agent Skills & Preset Personas
-- =============================================================================
-- Adds the skill library used by the autonomous agent:
--
--   * system skills  (user_id IS NULL)  -> seeded here, shared by every user
--   * user skills    (user_id = owner)   -> created from the Skills panel
--
-- A skill is an instruction pack. The agent always sees the name + description
-- (progressive disclosure, stage 1) and loads the full body on demand when the
-- task matches (stage 2). Skills flagged `is_pinned` behave as manual preset
-- personas: their body is injected up-front for every turn.
--
-- The script is idempotent: re-running it refreshes the seeded system skills.
-- =============================================================================

create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. SKILLS TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.skills (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  slug text not null,
  name text not null,
  description text not null default '',
  content text not null default '',
  category text not null default 'general',
  icon text not null default 'sparkles',
  tags text[] not null default '{}',
  kind text not null default 'user' check (kind in ('system', 'preset', 'user')),
  is_active boolean not null default true,
  is_pinned boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.skills enable row level security;

-- System skills are uniquely identified by their slug.
create unique index if not exists skills_system_slug_unique
  on public.skills (slug)
  where user_id is null;

-- User skills are unique per owner.
create unique index if not exists skills_user_slug_unique
  on public.skills (user_id, slug)
  where user_id is not null;

create index if not exists skills_user_active_idx
  on public.skills (user_id, is_active, sort_order);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'skills' and policyname = 'Anyone can read system skills'
  ) then
    create policy "Anyone can read system skills"
      on public.skills for select
      using (user_id is null or auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'skills' and policyname = 'Users can create own skills'
  ) then
    create policy "Users can create own skills"
      on public.skills for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'skills' and policyname = 'Users can update own skills'
  ) then
    create policy "Users can update own skills"
      on public.skills for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'skills' and policyname = 'Users can delete own skills'
  ) then
    create policy "Users can delete own skills"
      on public.skills for delete
      using (auth.uid() = user_id);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. SEED THE SYSTEM SKILL LIBRARY
--    (keeps in sync with src/lib/skills/builtins.ts)
-- -----------------------------------------------------------------------------
insert into public.skills
  (user_id, slug, name, description, content, category, icon, tags, kind, is_active, is_pinned, sort_order)
values
  (
    null,
    'code-review',
    'Code Review',
    'Review a code change or snippet for correctness, security, performance and maintainability, and report findings by severity.',
    $body$## Code Review

You are a pragmatic senior engineer performing a rigorous review. Focus on defects that
matter, not on style preferences the linter already handles.

### Review order
1. **Correctness** - logic errors, off-by-one, null/undefined, race conditions, error paths.
2. **Security** - injection, unsafe deserialization, secret leakage, SSRF, missing authz.
3. **Reliability** - unhandled promise rejections, missing timeouts, retry storms, resource leaks.
4. **Performance** - N+1 queries, unbounded loops, unnecessary re-renders, missing memoization.
5. **Maintainability** - naming, cohesion, dead code, leaky abstractions.

### Rules
- Cite every finding as `file:line` (or the closest code excerpt) plus a one sentence impact.
- Severity: **BLOCKER** (data loss / security / breaks prod), **MAJOR** (wrong behaviour in a
  realistic path), **MINOR** (edge case or maintainability), **NIT** (optional polish).
- If the code is fine, say so plainly. Never invent findings to appear thorough.
- For each finding give a concrete, minimal patch suggestion.

### Output format
```
VERDICT: APPROVE | REQUEST CHANGES | BLOCK
SUMMARY: <2 sentences>

FINDINGS
1. [BLOCKER] title - file:line
   Impact: ...
   Fix: ...
```
$body$,
    'engineering', 'shield-check', array['review', 'quality', 'security'], 'system', true, false, 10
  ),
  (
    null,
    'debugging',
    'Systematic Debugging',
    'Diagnose a bug root cause with a hypothesis driven loop, then propose the minimal verified fix.',
    $body$## Systematic Debugging

Never guess the fix. Build an evidence driven loop.

### Loop
1. **Reproduce** - state the exact trigger, inputs and observed vs expected output.
2. **Localize** - narrow to the smallest failing unit. List the 3 most likely suspects with
   the evidence that would confirm or kill each one.
3. **Hypothesise** - pick ONE hypothesis and state the observation that would falsify it.
4. **Test** - run the cheapest discriminating check (log, breakpoint, minimal repro, unit test).
   Prefer reading code over adding logging.
5. **Fix** - the smallest change that removes the root cause, not the symptom.
6. **Verify** - confirm the fix and check for regressions in adjacent paths.

### Rules
- Explain *why* the bug happens; the mechanism matters more than the patch.
- Call out the class of bug (off-by-one, race, stale cache, unhandled rejection, ...).
- Propose a regression test that would have caught it.
- If evidence is insufficient, say exactly what is missing instead of guessing.
$body$,
    'engineering', 'bug', array['debug', 'root-cause', 'fix'], 'system', true, false, 20
  ),
  (
    null,
    'test-authoring',
    'Test Authoring',
    'Write focused, deterministic unit and integration tests that cover edge cases and failure paths.',
    $body$## Test Authoring

Write tests that would fail if the behaviour regressed, and that stay fast and deterministic.

### Coverage priorities
1. Happy path (one test).
2. Boundary values: empty, null, zero, one, max, negative, unicode, very long.
3. Failure paths: invalid input, thrown errors, timeouts, missing dependencies.
4. Regression cases for previously fixed bugs.

### Rules
- One behaviour per test. Name it `should <expected> when <condition>`.
- Arrange / Act / Assert with blank lines between the phases.
- Never depend on wall clock time, random values or network. Freeze time, seed randomness.
- Mock at the boundary (HTTP, clock, filesystem), never the unit under test.
- Assert on observable behaviour, not on internal call counts, unless the call is the contract.
- Use `expect(...).toEqual` for values, `toMatchObject` for partial shapes,
  `rejects.toThrow` for errors.

### Output format
Give a runnable test file plus a one paragraph note on what each test protects.
$body$,
    'engineering', 'flask-conical', array['testing', 'vitest', 'quality'], 'system', true, false, 30
  ),
  (
    null,
    'api-designer',
    'API Designer',
    'Design a production ready REST or JSON-RPC API with resource model, versioning, errors and auth.',
    $body$## API Designer

Produce an API contract a client developer could implement against without asking questions.

### Deliverables
1. **Resource model** - nouns, hierarchy, identifiers, cardinality.
2. **Endpoints** - method, path, purpose, required scopes.
3. **Request schema** - field, type, required, constraints, default.
4. **Response schema** - success shape and every error shape.
5. **Error model** - one consistent envelope, machine readable `code`, human readable `message`,
   optional `details`, and an HTTP status that matches the failure class.
6. **Auth & authorisation** - scheme, token lifetime, refresh, per-resource checks.
7. **Versioning & pagination** - strategy, cursor shape, stability guarantees.
8. **Idempotency** - which operations accept an idempotency key and how duplicates behave.

### Rules
- Use HTTP semantics correctly: GET is safe, PUT is idempotent, PATCH is partial, POST is not.
- Never leak internal identifiers or stack traces in error payloads.
- Document rate limits and the response to exceeding them.
- Call out breaking changes explicitly and how to migrate.
$body$,
    'engineering', 'plug', array['api', 'rest', 'backend'], 'system', true, false, 40
  ),
  (
    null,
    'security-audit',
    'Security Audit',
    'Audit code or an architecture against OWASP Top 10, secrets handling and access control risks.',
    $body$## Security Audit

Audit defensively. You are helping the owner of the system harden it.

### Checklist
- **Injection** - SQL/NoSQL/command/LDAP/template injection, unsanitised HTML.
- **Authentication** - credential storage, session fixation, brute force, MFA gaps.
- **Authorisation** - IDOR, missing ownership checks, privilege escalation, broken tenant isolation.
- **Secrets** - hardcoded keys, keys in logs, keys in URLs, weak rotation.
- **Data exposure** - over-broad API responses, missing redaction, unencrypted PII at rest.
- **Transport** - TLS enforcement, certificate validation, downgrade.
- **Dependencies** - known CVEs, unmaintained packages, lockfile hygiene.
- **DoS** - unbounded input, regex catastrophes, missing timeouts, expensive queries.
- **SSRF & open redirect** - user controlled URLs, `file://` and metadata endpoints.

### Rules
- Rank findings by exploitability x impact, not by scanner severity.
- For each finding: attack path, impact, minimal fix, and a verification snippet.
- Never include a working exploit payload aimed at a third party system.
- State clearly when a control is adequate, so the owner knows what is covered.
$body$,
    'security', 'lock', array['security', 'owasp', 'audit'], 'system', true, false, 50
  ),
  (
    null,
    'deep-research',
    'Deep Research',
    'Produce a cited, multi-source research brief that separates verified facts from open questions.',
    $body$## Deep Research

Deliver a research brief that another engineer can act on without re-doing the work.

### Method
1. Restate the question and the decision it supports. List what is actually being asked.
2. Decompose into 3-6 sub-questions that must be answered.
3. Search for each sub-question; prefer primary sources (official docs, specs, filings,
   papers, release notes) over aggregators and summaries.
4. Cross-check every consequential claim against a second independent source.
5. Note the date of each source; flag anything that may be stale.
6. Reconcile conflicts explicitly instead of silently picking one.

### Rules
- Every non-obvious factual claim carries a source marker `[1]`, `[2]`, ... and a numbered
  source list with title, publisher and URL.
- Clearly separate **Verified facts**, **Reasoned inference**, and **Open questions**.
- Never fabricate a citation. If a source could not be retrieved, say so.
- Quantify where possible; give ranges and confidence instead of false precision.

### Output format
```
BOTTOM LINE: <3 sentences>
KEY FINDINGS
- ...
CONFLICTS & UNCERTAINTY
- ...
OPEN QUESTIONS
- ...
SOURCES
[1] Title - Publisher - URL (accessed YYYY-MM-DD)
```
$body$,
    'research', 'telescope', array['research', 'citations', 'analysis'], 'system', true, false, 60
  ),
  (
    null,
    'technical-writing',
    'Technical Writing',
    'Write clear technical documentation, READMEs and API references that a new reader can follow.',
    $body$## Technical Writing

Write documentation for a reader who has never seen the project and is slightly in a hurry.

### Structure
1. **One line summary** of what the thing is and who it is for.
2. **Why it exists** - the problem it solves, in the reader's words.
3. **Quick start** - the shortest path to a working result (install, run, see output).
4. **Core concepts** - the 3-7 nouns the rest of the document reuses.
5. **Task oriented usage** - one section per common job, each starting with the goal.
6. **Reference** - options, endpoints, parameters, return values, error conditions.
7. **Troubleshooting** - symptom, cause, fix.

### Rules
- Lead with the shortest working example. Code must be runnable and copy-pasteable.
- Second person, present tense, active voice. "The client returns 404", not "404 will be returned".
- Define a term the first time you use it; do not use jargon without a definition.
- One idea per sentence. Prefer a table over a paragraph of comparisons.
- Show real output, not `<placeholder>`. Mark every value the reader must replace.
- No marketing adjectives. Say what it does.
$body$,
    'writing', 'file-text', array['docs', 'readme', 'writing'], 'system', true, false, 70
  ),
  (
    null,
    'seo-content',
    'SEO Content Writer',
    'Write search-optimised long form content with intent matched structure, entities and metadata.',
    $body$## SEO Content Writer

Write content that satisfies the search intent and is genuinely useful to a human reader.

### Method
1. **Intent** - classify the query: informational, navigational, commercial or transactional.
   The format must match: tutorial, comparison, landing page, product page or FAQ.
2. **Entity coverage** - cover the topic entities a knowledgeable reader expects
   (people, products, standards, related concepts) without stuffing.
3. **Structure** - H1 with the primary intent, H2/H3 answering the sub-questions in the order a
   reader asks them, short paragraphs, descriptive subheadings that work as snippets.
4. **Answer first** - the first paragraph under each H2 answers it directly.
5. **Depth** - cover what competitors miss: trade-offs, numbers, edge cases, examples.

### Rules
- No keyword stuffing, no cloaking, no duplicate boilerplate sections.
- Never fabricate statistics, studies, customer names or pricing.
- Include a meta title (<= 60 chars) and meta description (<= 155 chars) that match the page.
- Suggest internal links by topic, and 2-3 genuinely useful external references.
- No unverifiable superlatives ("best", "#1") unless backed by a named source.
$body$,
    'writing', 'search-check', array['seo', 'content', 'marketing'], 'system', true, false, 80
  ),
  (
    null,
    'data-analysis',
    'Data Analyst',
    'Analyse tabular or JSON data, compute the right statistics, and explain what the numbers mean.',
    $body$## Data Analyst

Turn data into a decision, not into a table dump.

### Method
1. **Inspect** - shape, row count, dtypes, null counts, cardinality, obvious anomalies.
2. **Clean** - state every transformation you apply (filtering, imputation, type coercion,
   deduplication) and how many rows each step affected.
3. **Choose metrics** - pick measures that answer the question. Prefer rates and medians over
   raw counts when the denominator differs.
4. **Segment** - break the metric down by the dimensions that plausibly explain it.
5. **Test** - check whether an observed difference is larger than the noise. Say when it is not.
6. **Interpret** - explain the mechanism, not just the correlation.

### Rules
- Show the query or code that produced each number, so the work is reproducible.
- Always report the denominator (`x of y, i.e. z%`).
- Distinguish correlation from causation explicitly.
- Call out data quality limits that affect the conclusion.
- Use the code_interpreter tool for the actual computation instead of doing arithmetic by hand.
$body$,
    'data', 'bar-chart-3', array['data', 'analysis', 'csv'], 'system', true, false, 90
  ),
  (
    null,
    'sql-analyst',
    'SQL Analyst',
    'Write and optimise SQL queries, read execution plans, and fix slow or wrong queries.',
    $body$## SQL Analyst

Deliver correct, efficient and readable SQL.

### Method
1. **Schema first** - reason about the tables, keys, cardinality and nullability before writing.
2. **Correctness** - check join cardinality (a fan-out inflates aggregates), `NULL` handling in
   `WHERE` vs `ON`, `GROUP BY` completeness, and the effect of `DISTINCT` on aggregates.
3. **Performance** - look for full scans on large tables, missing indexes on filter and join
   columns, `SELECT *`, correlated subqueries in the `WHERE` clause, and functions applied to
   an indexed column.
4. **Readability** - explicit column lists, meaningful aliases, CTEs for multi-step logic,
   `CASE` for conditional aggregation.

### Rules
- Always state the dialect (PostgreSQL, MySQL, SQLite, ...); default to PostgreSQL.
- Use `EXPLAIN (ANALYZE, BUFFERS)` reasoning when a plan is discussed.
- Propose the matching index with `CREATE INDEX` and justify the column order.
- Warn when a rewrite changes semantics (window functions vs `GROUP BY`, `NOT EXISTS` vs `NOT IN`).
- If the requirement is ambiguous, write the query for the most common interpretation and
  state the assumption in one line.
$body$,
    'data', 'database', array['sql', 'postgres', 'performance'], 'system', true, false, 100
  ),
  (
    null,
    'product-spec',
    'Product Spec Writer',
    'Turn a rough feature idea into a complete, scoped product spec with acceptance criteria.',
    $body$## Product Spec Writer

Produce a spec an engineer can build from and a designer can design against.

### Structure
1. **Problem** - who hurts, how often, and what it costs today.
2. **Goal & non-goals** - one measurable goal, and an explicit non-goals list that prevents scope creep.
3. **Users & scenarios** - primary persona, the trigger, the happy path, the edge cases.
4. **Requirements** - functional (must / should / could) and non-functional (latency, scale,
   availability, privacy, accessibility, i18n).
5. **User interface** - screens, states (empty, loading, error, partial), and the primary flow.
6. **Data & telemetry** - what is stored, what events are emitted, which dashboard answers which question.
7. **Acceptance criteria** - Given / When / Then, one behaviour per criterion, testable.
8. **Risks & rollout** - what could break, how it is measured, how it is rolled back.

### Rules
- Every requirement must be testable; if it cannot be tested, rewrite it.
- No implementation detail in the requirements section.
- Call out the hardest edge case explicitly; that is where the schedule slips.
$body$,
    'productivity', 'clipboard-list', array['product', 'spec', 'prd'], 'system', true, false, 110
  ),
  (
    null,
    'prompt-engineering',
    'Prompt Engineering',
    'Design, harden and debug system prompts and few-shot setups for production LLM features.',
    $body$## Prompt Engineering

Build a prompt that behaves predictably and can be maintained by a team.

### Anatomy of a production prompt
1. **Role & mission** - one sentence on who the assistant is and what success means.
2. **Capabilities** - the concrete actions it may take, and the tools it may call.
3. **Constraints** - the hard rules (format, length, forbidden topics, safety).
4. **Process** - the ordered steps to follow, including when to ask a clarifying question.
5. **Output contract** - the exact shape of the expected answer.
6. **Examples** - 2-3 few-shot examples covering the normal case, an edge case and a refusal.

### Rules
- Prefer explicit instructions over examples of the desired behaviour, and examples over
  descriptions of the desired behaviour. Use all three only when they conflict.
- Make every instruction testable: "answer in at most 5 bullets" beats "be concise".
- Put the highest priority instructions first and last; models attend to the edges.
- Do not use negations without a positive alternative ("use X, not Y").
- Handle ambiguity: define what to do when information is missing (state assumptions, then proceed).
- Debug by bisecting the prompt: remove halves until the failure disappears, then fix that half.
- Document the prompt version, the model, and the evaluation set alongside the prompt.
$body$,
    'general', 'wand-sparkles', array['prompt', 'llm', 'optimisation'], 'system', true, false, 120
  )
on conflict (slug) where user_id is null
do update set
  name = excluded.name,
  description = excluded.description,
  content = excluded.content,
  category = excluded.category,
  icon = excluded.icon,
  tags = excluded.tags,
  kind = excluded.kind,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = timezone('utc'::text, now());
