# Deep Thinking Career Guidance and Beginner Courseware Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable a bounded DeepSeek thinking-mode answer path that returns a complete evidence-grounded answer or a local fallback within one minute, and publish a zero-beginner courseware set explaining this project end to end.

**Architecture:** The existing local parse -> Supabase aggregate evidence -> single DeepSeek call flow stays intact. `lib/env.ts` owns non-secret thinking and timeout validation; `lib/deepseek.ts` consumes that configuration and exposes only model `content`; the Route Handler and Vercel both use the matching 60-second request limit.

**Tech Stack:** Next.js 15 App Router, TypeScript, Vitest, Supabase PostgreSQL/Auth/RLS, DeepSeek Chat Completions, SSE, Tailwind CSS, Vercel, GitHub, Mermaid Markdown.

---

## File Map

| File | Responsibility |
|---|---|
| `lib/env.ts` | Validate server-only API configuration, including non-secret thinking mode and answer timeout. |
| `lib/deepseek.ts` | Build a DeepSeek request, enforce the bounded answer timeout, and keep only final visible content. |
| `app/api/chat/route.ts`, `vercel.json` | Advertise the matching 60-second Route Handler and Vercel limits. |
| `.env.example` | Show safe model, thinking-mode, and timeout defaults. |
| `tests/env.test.ts`, `tests/deepseek.test.ts` | Prove the configuration contract, payload, and truncation behavior. |
| `README.md`, `docs/PROJECT_ARCHITECTURE.md` | Keep operator and engineering documentation accurate. |
| `docs/guide/*.md` | Teach the project to a zero-base reader in seven lessons. |

### Task 1: Lock the Configuration Contract With Failing Tests

**Files:**
- Modify: `tests/env.test.ts`
- Modify: `lib/env.ts`

- [ ] **Step 1: Write failing environment tests**

Add this import and tests to `tests/env.test.ts`:

```ts
import { env, getBrowserSupabaseConfig, hasSupabasePublicConfig } from "@/lib/env";

it("uses thinking and timeout defaults when optional values are absent", () => {
  expect(env.deepseekThinkingMode({})).toBe("enabled");
  expect(env.deepseekAnswerTimeoutMs({})).toBe(50_000);
});

it("accepts an explicit mode and bounded timeout", () => {
  expect(env.deepseekThinkingMode({ DEEPSEEK_THINKING_MODE: "disabled" })).toBe("disabled");
  expect(env.deepseekAnswerTimeoutMs({ DEEPSEEK_ANSWER_TIMEOUT_MS: "49000" })).toBe(49_000);
});

it("rejects unsupported mode and unsafe timeout", () => {
  expect(() => env.deepseekThinkingMode({ DEEPSEEK_THINKING_MODE: "auto" })).toThrow("DEEPSEEK_THINKING_MODE");
  expect(() => env.deepseekAnswerTimeoutMs({ DEEPSEEK_ANSWER_TIMEOUT_MS: "0" })).toThrow("DEEPSEEK_ANSWER_TIMEOUT_MS");
  expect(() => env.deepseekAnswerTimeoutMs({ DEEPSEEK_ANSWER_TIMEOUT_MS: "60000" })).toThrow("DEEPSEEK_ANSWER_TIMEOUT_MS");
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- tests/env.test.ts`

Expected: FAIL because the two new `env` methods do not exist.

- [ ] **Step 3: Implement the minimal parser**

In `lib/env.ts`, add the exact server types and helpers below, keeping the current required-key functions unchanged:

```ts
export type ServerEnvironment = Record<string, string | undefined>;
export type DeepSeekThinkingMode = "enabled" | "disabled";

const DEFAULT_DEEPSEEK_ANSWER_TIMEOUT_MS = 50_000;
const MAX_DEEPSEEK_ANSWER_TIMEOUT_MS = 50_000;

function readThinkingMode(source: ServerEnvironment): DeepSeekThinkingMode {
  const value = source.DEEPSEEK_THINKING_MODE ?? "enabled";
  if (value === "enabled" || value === "disabled") return value;
  throw new Error("DEEPSEEK_THINKING_MODE 必须为 enabled 或 disabled");
}

function readAnswerTimeoutMs(source: ServerEnvironment): number {
  const raw = source.DEEPSEEK_ANSWER_TIMEOUT_MS;
  if (!raw) return DEFAULT_DEEPSEEK_ANSWER_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_DEEPSEEK_ANSWER_TIMEOUT_MS) {
    throw new Error("DEEPSEEK_ANSWER_TIMEOUT_MS 必须是 1 到 50000 的整数");
  }
  return value;
}
```

Expose them through `env` as `deepseekThinkingMode(source: ServerEnvironment = process.env)` and `deepseekAnswerTimeoutMs(source: ServerEnvironment = process.env)`. The 50-second maximum deliberately leaves ten seconds of the Route Handler budget for fallback, persistence, and SSE completion.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `npm test -- tests/env.test.ts`

Expected: PASS, including all existing browser configuration tests.

- [ ] **Step 5: Commit the configuration contract**

```bash
git add tests/env.test.ts lib/env.ts
git diff --cached --check
git commit -m "feat: validate DeepSeek thinking settings"
```

### Task 2: Enable Bounded Thinking-Mode Generation With Tests

**Files:**
- Modify: `tests/deepseek.test.ts`
- Modify: `lib/deepseek.ts`

- [ ] **Step 1: Write failing DeepSeek payload and answer-boundary tests**

Replace the obsolete disabled-mode test and add these tests:

```ts
it("enables server-side thinking and reserves tokens for a detailed visible answer", () => {
  expect(buildDeepSeekPayload("deepseek-v4-flash", [{ role: "user", content: "测试" }], "enabled")).toMatchObject({
    model: "deepseek-v4-flash",
    stream: false,
    max_tokens: 2200,
    thinking: { type: "enabled" }
  });
});

it("can disable thinking only through explicit server configuration", () => {
  expect(buildDeepSeekPayload("deepseek-v4-flash", [{ role: "user", content: "测试" }], "disabled")).toMatchObject({
    thinking: { type: "disabled" }
  });
});

it("limits detailed answers to 1000 characters at a sentence boundary", () => {
  const limited = limitCareerAnswer("职业建议。".repeat(300) + "最后一句。");
  expect(limited.length).toBeLessThanOrEqual(1000);
  expect(limited.endsWith("。")).toBe(true);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- tests/deepseek.test.ts`

Expected: FAIL because the payload hard-codes `thinking.disabled`, 700 tokens, and a 520-character default limit.

- [ ] **Step 3: Implement the minimal bounded generation change**

In `lib/deepseek.ts`:

1. Import `DeepSeekThinkingMode` with `env`.
2. Change `buildDeepSeekPayload(model, messages, thinkingMode)` to emit `max_tokens: 2200` and `thinking: { type: thinkingMode }`.
3. Remove the hard-coded 16-second default and use `env.deepseekAnswerTimeoutMs()` as the default `complete` timeout.
4. Pass `env.deepseekThinkingMode()` when building the request.
5. Change `writeCareerAnswer` to return `limitCareerAnswer(answer, 1000)`.
6. Preserve every existing evidence and skill-combination restriction. Replace only its presentation requirement with: first paragraph gives a decision; then 3-5 short paragraphs explain match, city/trend, salary or threshold, AI effect, and next skill when evidence exists; do not mention fields, JSON, algorithms, or hidden reasoning; target 700-1000 Chinese characters and at most six paragraphs.

The response type stays `choices[].message.content`. Do not add `reasoning_content` to types, SSE events, Supabase rows, logs, or client code.

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
npm test -- tests/deepseek.test.ts
npm test
```

Expected: PASS, with no real API call, API key, or model response printed.

- [ ] **Step 5: Commit the model behavior**

```bash
git add tests/deepseek.test.ts lib/deepseek.ts
git diff --cached --check
git commit -m "feat: enable bounded DeepSeek thinking answers"
```

### Task 3: Align Next.js, Vercel, and Example Configuration

**Files:**
- Modify: `app/api/chat/route.ts`
- Modify: `vercel.json`
- Modify: `.env.example`

- [ ] **Step 1: Change the Next.js Route Handler export**

Replace:

```ts
export const maxDuration = 30;
```

with:

```ts
export const maxDuration = 60;
```

Keep the existing catch path unchanged so a bounded model timeout emits `fallback` and calls `formatFallbackCareerAnswer(evidence)`.

- [ ] **Step 2: Change Vercel's matching configuration**

Use this complete `vercel.json`:

```json
{
  "framework": "nextjs",
  "functions": {
    "app/api/chat/route.ts": { "maxDuration": 60 }
  }
}
```

- [ ] **Step 3: Add safe defaults to `.env.example`**

Make the file exactly:

```text
DEEPSEEK_API_KEY=
DEEPSEEK_ANSWER_MODEL=deepseek-v4-flash
DEEPSEEK_THINKING_MODE=enabled
DEEPSEEK_ANSWER_TIMEOUT_MS=50000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 4: Verify matching budgets and types**

Run:

```bash
npm run typecheck
npm run lint
git diff --check
```

Expected: PASS. Confirm code uses 60 seconds for Next.js and Vercel, while the model parser cannot accept more than 50000 milliseconds.

- [ ] **Step 5: Commit the runtime boundary**

```bash
git add app/api/chat/route.ts vercel.json .env.example
git diff --cached --check
git commit -m "feat: allow one-minute career answer fallback"
```

### Task 4: Synchronize README and Engineering Architecture

**Files:**
- Modify: `README.md`
- Modify: `docs/PROJECT_ARCHITECTURE.md`

- [ ] **Step 1: Update the README operational statements**

State that `DEEPSEEK_THINKING_MODE=enabled` is server-only and never returns a reasoning trace to the browser; `DEEPSEEK_ANSWER_TIMEOUT_MS=50000` gives the model 50 seconds, after which the same Supabase evidence becomes a local fallback. State that Vercel permits 60 seconds and that SSE evidence normally appears before model completion.

- [ ] **Step 2: Update `docs/PROJECT_ARCHITECTURE.md` precisely**

Make these replacements:

1. Change the availability objective to one minute.
2. Label the DeepSeek request in the online sequence as a thinking-mode request and its result as visible `content` only.
3. Replace the “非思考模式与输出控制” section with “思考模式、可见回答与超时控制”, covering enabled thinking, 2200 max tokens, a 50-second abort, a 700-1000 Chinese-character target, and hidden reasoning.
4. Label the 9.03-second non-thinking benchmark as a historical pre-change baseline, not a current deep-thinking claim.
5. Update the latency table, technical stack, and Vercel checklist to the 60/50-second split.

- [ ] **Step 3: Verify documentation consistency**

Run: `git diff --check`

Review every reference to 16 seconds, 30 seconds, and non-thinking. It must either be deleted or explicitly marked as pre-change history.

- [ ] **Step 4: Commit core documents**

```bash
git add README.md docs/PROJECT_ARCHITECTURE.md
git diff --cached --check
git commit -m "docs: explain bounded thinking runtime"
```

### Task 5: Generate Beginner Lessons 00-02

**Files:**
- Create: `docs/guide/00-项目是什么.md`
- Create: `docs/guide/01-平台与角色.md`
- Create: `docs/guide/02-数据如何变成职业建议.md`

- [ ] **Step 1: Write the entry lesson**

`00-项目是什么.md` must have headings `你将学会什么`, `先区分两套系统`, `一次咨询发生了什么`, `本项目不做什么`, and `检查自己是否理解`. Explain offline 800 万招聘明细 processing versus online aggregate queries. Include a Mermaid flowchart from question to local parsing, Supabase evidence, DeepSeek visible content, and browser response. Use `Python、沟通能力、药学` as a safe example and explain that unobserved combinations are not invented.

- [ ] **Step 2: Write the platform lesson**

`01-平台与角色.md` must have headings `平台总览`, `每个平台像什么`, `它们如何连接`, `公开变量和秘密变量`, and `检查自己是否理解`. Give Next.js, TypeScript, Tailwind CSS, Supabase, DeepSeek, GitHub, and Vercel one concrete responsibility each. Include a Mermaid sequence diagram showing browser -> Vercel/Next.js -> Supabase and DeepSeek, and explain why CSV data stays out of Vercel and service-role stays server-side.

- [ ] **Step 3: Write the data lesson**

`02-数据如何变成职业建议.md` must have headings `从原始招聘到聚合数据`, `导入 Supabase 的原因`, `表如何协作`, `在线排序的边界`, and `动手检查`. Explain `npm run import:data`, 500-row batches, and the actual tables: `skills`, `skill_aliases`, `skill_pairs`, `occupation_skill_stats`, `city_skill_forecasts`, `pair_occupation_stats`, `pair_city_stats`, `skill_yearly_trends`, `skill_monthly_trends`, `skill_ai_exposure`. End with safe SQL: `SELECT COUNT(*) FROM public.skills;`.

- [ ] **Step 4: Check structure and secrets**

Run: `git diff --check`

Read all three lessons. Each must explain the why, contain a concrete project path/example, provide a verification check, and contain no text beginning with `sk-`, `sb_`, or `re_`.

- [ ] **Step 5: Commit lessons 00-02**

```bash
git add docs/guide/00-项目是什么.md docs/guide/01-平台与角色.md docs/guide/02-数据如何变成职业建议.md
git diff --cached --check
git commit -m "docs: add beginner product and data lessons"
```

### Task 6: Generate Beginner Lessons 03-04

**Files:**
- Create: `docs/guide/03-从零搭建前后端.md`
- Create: `docs/guide/04-登录、邮件与安全.md`

- [ ] **Step 1: Write the web-request lesson**

`03-从零搭建前后端.md` must have headings `页面和接口为什么在一个项目里`, `提问接口的四个阶段`, `为什么使用 SSE`, `模型回答为什么可信`, and `动手验证`. Refer to `components/career-workbench.tsx`, `app/api/chat/route.ts`, `lib/local-query.ts`, `lib/evidence.ts`, `lib/deepseek.ts`, and `lib/chat-stream.ts`. Draw the `status`, `evidence`, `complete`, and `error` sequence. Explain that only `message.content` is rendered and `formatFallbackCareerAnswer` uses the same evidence when DeepSeek fails.

- [ ] **Step 2: Write the authentication lesson**

`04-登录、邮件与安全.md` must have headings `为什么需要登录`, `OTP 登录的真实流程`, `回调地址必须匹配`, `邮件服务为什么会限流`, `密钥与权限边界`, and `检查清单`. Explain `signInWithOtp`, `verifyOtp`, middleware refresh, RLS on `conversations` and `messages`, Site URL, and Redirect URLs. Give generic Resend SMTP values: host `smtp.resend.com`, port `465`, username `resend`, and a verified `noreply@your-domain` sender. Say that receiving MX configuration is unrelated to sending OTP and must not be changed for this app. Never include a real password or key.

- [ ] **Step 3: Check auth guidance safety**

Run: `git diff --check`

Confirm it distinguishes `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `SUPABASE_SERVICE_ROLE_KEY`, never puts secrets in client code, and only uses `http://localhost:3000/**` as a local redirect example.

- [ ] **Step 4: Commit lessons 03-04**

```bash
git add docs/guide/03-从零搭建前后端.md docs/guide/04-登录、邮件与安全.md
git diff --cached --check
git commit -m "docs: add beginner web and auth lessons"
```

### Task 7: Generate Beginner Lessons 05-06

**Files:**
- Create: `docs/guide/05-部署、域名与环境变量.md`
- Create: `docs/guide/06-故障排查与真实踩坑.md`

- [ ] **Step 1: Write the deployment lesson**

`05-部署、域名与环境变量.md` must have headings `上线前的文件边界`, `从本地到 GitHub`, `Vercel 自动部署如何发生`, `配置生产环境变量`, `绑定域名后的两个同步点`, and `上线检查`. Explain `git add`, `git commit`, and `git push origin main`; a connected Vercel project deploys the pushed commit automatically. List `.env.example` variable names without values. Explain Vercel environment variables, Vercel domain configuration, Supabase Site URL/Redirect URLs, and pre-push commands `npm run typecheck`, `npm test`, and `npm run build`.

- [ ] **Step 2: Write the troubleshooting lesson**

`06-故障排查与真实踩坑.md` must present symptom, cause, first diagnostic place, and fix for: missing `NEXT_PUBLIC_SUPABASE_URL`; Vercel client exception after an environment change; magic links pointing to localhost; `email rate limit exceeded`; `Error sending magic link email`; email returning to the page without updated login UI; and long model generation. The final section must use the triage order: reproduce once, collect the first exact error, inspect the correct platform, change one setting, redeploy/retest. Explain the 60-second function / 50-second model / evidence fallback boundary.

- [ ] **Step 3: Check production safety**

Run: `git diff --check`

Confirm neither lesson tells readers to commit `.env.local`, claims a Vercel build alone proves the live app works, or includes a real domain, personal email, or secret.

- [ ] **Step 4: Commit lessons 05-06**

```bash
git add docs/guide/05-部署、域名与环境变量.md docs/guide/06-故障排查与真实踩坑.md
git diff --cached --check
git commit -m "docs: add beginner deployment lessons"
```

### Task 8: Full Verification and Publication

**Files:** Verify every file changed by Tasks 1-7.

- [ ] **Step 1: Run all local checks**

```bash
npm test
npm run typecheck
npm run lint
npm run build
git diff --check
git status --short
```

Expected: all commands exit 0; whitespace check is empty; working tree is clean after commits.

- [ ] **Step 2: Inspect the commit range**

```bash
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
```

Expected: only planned runtime, test, documentation, and guide files; no `.env.local`, data CSV, credentials, or schema changes.

- [ ] **Step 3: Push and verify the deployment trigger**

Run: `git push origin main`.

Then inspect Vercel for the pushed commit. Verify the live page loads without a client exception and that a signed-in sample question first receives evidence and then a detailed answer or fallback in at most one minute. Do not print a production secret.

- [ ] **Step 4: Record delivery facts**

Report commit IDs, test/type/lint/build results, guide paths, and Vercel deployment status. If production verification is blocked by authentication or model availability, report that exact boundary rather than claiming an unperformed end-to-end test.
