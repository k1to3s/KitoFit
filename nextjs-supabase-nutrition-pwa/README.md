# Bloom — a little better, every day

A Next.js App Router + TypeScript nutrition/workout PWA. The default preview is an isolated, persistent PostgreSQL demo. Configure Supabase to replace demo sessions with verified consumer accounts. Hosted AI is optional; manual logging is not dependent on AI, camera, push, or Open Food Facts.

**Release status:** functional application and deployment scaffolding, not a claim of independently audited production readiness. Run the Supabase policy tests and the real-device checks below on your own deployment. Legal templates, moderation ownership, provider configuration, backups/retention, and deliverability must be reviewed before launch. No external service credentials are included.

## Architecture

```text
 iOS Safari / installed PWA
   |  Supabase Auth SDK (email verification + session refresh)
   |  HTTPS JSON + Authorization: Bearer JWT
   |  locally decoded barcode (self-hosted ZXing WASM)
   v
 Vercel / Next.js App Router
   |-- nonce CSP, strict origins, Zod, safe errors
   |-- verified Supabase identity + object ownership on EVERY API operation
   |-- Drizzle ORM ----------------------------------------------+
   |-- normalized image / signed URL ----+                       |
   |-- hosted inference ---------------+ |                       |
   |-- food lookup --------------+     | |                       |
   |-- daily Cron --> Web Push   |     | |                       |
   v                            v     v v                       v
 Push provider            Open Food  Hugging Face          Supabase
 (Apple/FCM/Mozilla)       Facts      hf-inference          + Auth
                          (cached)   (optional; cached)     + Postgres + RLS
                                                           + private Storage
 Browser <------------- membership-filtered Realtime ------+ Realtime
```

On Vercel, `DATABASE_URL` MUST reference the same Supabase project as `NEXT_PUBLIC_SUPABASE_URL`. All database application queries use Drizzle and `@/db`; Supabase JS handles Auth, Storage, and Realtime. The trusted database connection bypasses RLS, so every API query includes a verified `user_id` or explicit room membership. RLS separately protects direct Supabase REST/Realtime access. Never expose the DB URL, service-role key, HF token, private VAPID key, or cron secret.

## Repository map

```text
src/
  app/
    page.tsx, layout.tsx, globals.css       dashboard and global visual system
    privacy/page.tsx, terms/page.tsx       legal templates
    api/
      auth/route.ts                       Supabase login/signup/reset/resend
      tracker/route.ts                    diary, water, goals, supplements, workouts
      foods/route.ts                      OFF + reference/custom food search
      estimate/route.ts                   bounded upload, EXIF stripping, AI, signed URLs
      push/route.ts                       subscribe/unsubscribe/public VAPID key
      cron/reminders/route.ts             protected daily reminder sender + cache cleanup
      chat/route.ts                       rooms, invitations, messages, block/report
      account/route.ts                    export and reauthenticated deletion
      health/route.ts                     database healthcheck (no secrets)
  components/
    dashboard.tsx                         overview, diary, workouts, supplements, progress
    dialogs.tsx                           native dialogs, logging, auth, settings, Realtime chat
    workout-chart.tsx                     seven-day training volume chart
  db/index.ts, schema.ts                  Drizzle connection and all local table definitions
  lib/
    demo.ts                              default targets and reference food values
    supabase.ts                          browser Auth/Realtime client (public keys only)
    security.ts                          JWT verification, origin checks, Zod, atomic rate limiter
    food-search.ts                       Open Food Facts cache and response validation
  proxy.ts                               CSP nonce and strict API CORS
supabase/migrations/202610010001_bloom.sql complete Supabase schema, RLS, storage and Realtime
supabase/tests/rls.sql                    two-user authorization regression test
public/
  manifest.webmanifest, sw.js             installability, push and private-data-safe offline page
  offline.html, icon.svg, icons/          PWA fallback and app icons
  wasm/zxing_reader.wasm                  self-hosted barcode decoder
next.config.ts                           security headers
vercel.json                              Hobby-compatible daily Cron
.env.example                             required/optional variable guide
```

## Vertical slices implemented

1. **Auth and isolation:** verified Supabase email/password sessions, signup, resend, recovery, sign-out; authorization enforced in each server endpoint. Public app shell exposes no real user data. Optional demo only when the Supabase URL is absent.
2. **Diary:** date/meal CRUD, editable grams, total macro recalculation, custom foods, editable calorie/macro/water goals, daily summary and seven-day charts. Tap a food to edit/delete. Initial example meals only exist in the isolated demo.
3. **Barcode:** iPhone file/camera capture decoded locally with ZXing WASM; EAN-13/EAN-8/UPC-A/UPC-E; typed-number fallback. OFF lookup uses a descriptive User-Agent and a seven-day cache. Missing nutrition is not silently replaced with zero.
4. **Photo estimate:** consent before upload, JPEG/PNG signature verification, 4 MB bounded read, 25 MP decoder limit, rotation + EXIF removal + 1400 px JPEG output. Private storage, server-only HF calls, Zod output, per-user/image/model cache, timeouts, one delayed retry, shared failure circuit breaker, manual fallback. Food and grams always need confirmation; no automatic diary insertion. Signed photo links live for 60 seconds; export links for 300 seconds.
5. **Movement and essentials:** editable exercises/sets/reps/weight/RPE, workout notes, saved templates and session history; supplements with dose/time/notes, daily check-offs, schedules/reminders. Workout exercise data is stored atomically as JSON; normalized exercises/workout_sets tables are available for future per-set analytics.
6. **Notifications:** user-gesture permission request, subscribe/unsubscribe persisted privately, VAPID server keys, safe provider allowlist, cron authentication, expired subscription cleanup and at-most-once reminder claiming. Unsupported devices see installation guidance. Reminder delivery is best-effort, not medical.
7. **Chat:** private circle creation, owner-controlled invitation by verified member UUID, authorized history, Supabase Realtime refresh, plain-text messages, max 2,000 characters, per-user rate limiting, database trigger to prevent direct REST bypass, block and report. Reports persist for operator review; automated moderation is intentionally not claimed.

## Quickstart: isolated local demo

```sh
npm install
cp .env.example .env
# Set DATABASE_URL for your local PostgreSQL. Leave Supabase vars blank.
npx drizzle-kit push
npm run dev
```

The platform preview provisions PostgreSQL automatically. Each browser gets a random 256-bit demo workspace key; a SHA-256-derived UUID partitions its demo rows. The app sends this key in `X-Demo-Session` from browser storage, with an HttpOnly SameSite=Strict cookie fallback for direct API clients. The header keeps this non-authenticated demo usable inside previews where third-party cookies are blocked. Real configured accounts never accept this demo header. The exact managed sandbox hostname is allowlisted only when its sandbox environment variable is present, and this isolated demo may be framed for the preview. Configured Supabase deployments always deny framing. This is a demo workspace identifier, NOT a password/authentication system. Only Supabase Auth is used for real accounts. Demo cookies expire in seven days; operators should expire abandoned demo rows or disable the public demo on real deployments.

Open http://localhost:3000. Add/edit meals, change the date, log water, check supplements, log a workout, edit targets, and export the demo data. Auth/AI/chat/push show clear configuration guidance instead of inventing results. PostgreSQL and connectivity are still required for core persistence; this version does not queue offline health data.

## Supabase setup (real accounts)

1. Create a Supabase project. Keep all server-side connections in the same region when possible.
2. Run **`supabase/migrations/202610010001_bloom.sql`** in a new project's SQL Editor, or `supabase link --project-ref <ref>` then `supabase db push`. It creates the schema, enables RLS, creates the private bucket, message rate-limit trigger, and Realtime publication. Do not run `drizzle-kit push` as a replacement for this migration on Supabase; Drizzle schema push does not apply policies.
3. Configure Auth → Providers → Email: enable email/password and **require email confirmation**. Configure strong password requirements, native Auth rate limits (including verification/resend/recovery), and production SMTP. Supabase’s default development mail limits are not suitable for production; choose a suitable free-tier mail provider if available and test delivery. Consider native CAPTCHA/bot protection before public signup.
4. Auth → URL Configuration: exact Site URL `https://your-app.vercel.app`; allow that root and `https://your-app.vercel.app/?recovery=true` for verification/recovery. Add localhost equivalents only for development. Avoid unrestricted wildcards on production domains.
5. Copy the project URL and anon/public key into the two `NEXT_PUBLIC_SUPABASE_*` variables. Set `SUPABASE_SERVICE_ROLE_KEY` on the server only. Use a transaction-pooler Postgres connection for `DATABASE_URL` (port 6543, TLS). Never use the sample localhost URL in a Vercel deployment.
6. Verify `meal-photos` is private. The authenticated browser has SELECT/DELETE access only in its own UUID folder; INSERT/UPDATE is server-only so users cannot bypass image sanitization by calling Storage directly.
7. Run `supabase/tests/rls.sql` in a staging project's SQL Editor. It runs inside a rollback transaction. Then test two real verified users through both the Next.js endpoints and Supabase clients. Policy tests are not substitutes for a security review.
8. Create two accounts, follow verification links, and test login, reset, export, deletion, private room invitation, Realtime, and block/report.

### Optional TOTP MFA (safe extension)

Supabase provides native `auth.mfa.enroll({factorType:'totp'})`, `challengeAndVerify`, `listFactors`, `unenroll`, and assurance-level checks. A full MFA enrollment/challenge/recovery UI is not enabled here. Do not merely add a QR code: enrollment must be verified, sign-in needs AAL2 step-up, session refresh and factor removal need reauthentication, and recovery must be tested. Add AAL2 policies/claim checks to sensitive routes before requiring MFA. Never implement custom TOTP secrets or passwords. Currently deletion re-verifies the account password.

## Hosted AI setup and reliability

- Set a fine-grained `HF_API_TOKEN` with inference permission.
- Set `HF_FOOD_MODEL` to a food-classification model **currently supported by the `hf-inference` provider**, not merely an arbitrary food model on the Hub. Check https://huggingface.co/api/partners/hf-inference/models and the provider documentation. Hosted availability and free monthly credits change. This repo deliberately does not assert that any particular model will be available forever.
- The official `@huggingface/inference` client is used with `provider: 'hf-inference'`; no self-hosting or paid dedicated endpoint is required. Keep HF paid billing disabled or capped if staying within free credits is essential.
- `HF_CAPTION_MODEL` is reserved, documented, and not used by this build. No caption call or additional AI cost is hidden.
- Ten AI attempts/user/day and 60 globally/hour. Cached normalized image+model results expire after seven days. There are two inference attempts, each with an eight-second abort deadline and 600 ms backoff. Three failures in a shared five-minute bucket open the circuit for the rest of the bucket. OFF has a six-second timeout.
- Not configured, paused model, 429, timeout, invalid result, no nutrition match, or provider failure → manual entry. No result is presented as exact weight or nutrition. The client requires a food name, numeric nutrition, and a user-confirmed portion.
- Privacy: normalized photos remain private until account deletion. Choose and document a retention period and implement maintenance if you need shorter automatic retention. Public deployment requires processor/privacy review.

## Vercel deployment

1. Push the repository to Git (first run the secret scan below), import it into Vercel as Next.js.
2. Set `.env.example` variables in Vercel Project Settings → Environment Variables. Production and preview should use separate Supabase projects; do not share production user data with arbitrary preview deployments.
3. Set `NEXT_PUBLIC_APP_URL` to the exact production HTTPS origin. `VERCEL_URL` is included as the one deployment’s allowed origin. No wildcard CORS. Public environment values are build-time values: **redeploy after changing them**.
4. Verify the presence of env variables without printing values:
   ```sh
   node --env-file=.env -e "for(const k of ['DATABASE_URL','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','HF_API_TOKEN','HF_FOOD_MODEL','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','NEXT_PUBLIC_APP_URL']) console.log(k,process.env[k]?'loaded':'not configured')"
   ```
5. Deploy. GET `/api/health` should return `{ "ok": true }`. Inspect response headers, sign up/verify, log a food, and reload to verify persistence.
6. Vercel Hobby restrictions and acceptable-use rules apply, including noncommercial-use limitations. A commercial production deployment may require a paid plan even if request volume is small; no blanket free-forever promise is made. Supabase free projects can pause and have quotas. Configure monitoring and tested export/backups.

## Push and cron setup

```sh
npx web-push generate-vapid-keys
# Independently generate a 32+ byte cryptographic CRON_SECRET.
```

Store `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:your-contact@example.com`, and `CRON_SECRET` in Vercel. Public key is served only by authenticated GET `/api/push`. The private key never leaves the server. `vercel.json` schedules GET `/api/cron/reminders` at 08:00 UTC daily; Vercel adds `Authorization: Bearer CRON_SECRET`. The sender claims due schedules before dispatch to avoid duplicates, and drops dead (404/410) subscriptions. It uses a generic lock-screen message without food/supplement names. Large deployments need bounded batches and queue/retry architecture beyond this starter.

**Honest free-tier limit:** Vercel Hobby permits daily cron, not precise minute-level scheduling. Selected reminder times are due times, not delivery guarantees; daily polling may deliver later. Exact-time reminders require a supported scheduler plan or a separately reviewed alternative. The included UI says this. A temporary push failure may drop that occurrence because delivery is at-most-once. Native iPhone Reminders is the no-infrastructure fallback.

On iPhone: Safari → Share → Add to Home Screen → open installed app → Settings → Reminders → Enable. Requires iOS 16.4+, granted permission, and supported device/browser. Permission is requested from a user click. Camera scanning uses a camera capture file input rather than assuming BarcodeDetector support; typed barcodes work everywhere. HEIC photos need conversion to JPEG for AI.

## Security hardening implemented

- [x] Supabase Auth only for consumer identities; server `auth.getUser(token)` validation and verified email requirement.
- [x] Object ownership on reads, updates, deletes, uploads, exports, and room membership on chat actions; cross-user IDs return 404/403.
- [x] All Supabase user tables have RLS; `WITH CHECK` prevents reassignment. Private cache/limiter tables have no browser access. Realtime SELECT policies enforce membership and blocking. A fixed-search-path membership helper avoids recursive policies.
- [x] Zod on API body/query/route values, upload and AI output, provider nutrition, subscription endpoints, cron data. Body/file limits and plain structured client errors; no stack traces or secrets.
- [x] Atomic Postgres UPSERT fixed-window rate limiter, shared across Vercel instances. Auth: 10/IP/5min and 5/email/5min + Supabase’s native limits. Tracker: 60 writes/min, 120 reads/min. Food search: 15/min. Chat: 15 sends/min, 5 administrative actions/min. Photo/export/delete have lower limits. A message trigger additionally limits direct REST writes. Rate counters expire and are cleaned by cron; no fragile process-memory-only limiter.
- [x] Real accounts use explicit `Authorization` headers, not automatically sent cookies. Cross-site pages cannot read the token or attach it without an allowed CORS preflight, so conventional cookie CSRF is mitigated. The demo’s HttpOnly SameSite=Strict cookie additionally requires a custom `X-Requested-With: bloom` header for mutations and strict Origin checks. Sensitive account deletion requires explicit confirmation and reauthentication. All client mutations send the custom header; cross-origin requests are denied.
- [x] Request-specific nonce CSP with strict-dynamic, no arbitrary user scripts/HTML, self-hosted WASM, `wasm-unsafe-eval` only for decoding. `unsafe-eval` only in development. Inline styles are allowed for safe chart percentages; rich text is NOT rendered. CSP excludes third-party script CDNs.
- [x] `nosniff`, strict referrer policy, restricted camera/microphone/location/payment permissions, DENY framing, explicit API CORS, `no-store` for APIs. HSTS enabled only with configured HTTPS app URL. Verify every subdomain supports HTTPS before keeping `includeSubDomains`; only preload after a separate deliberate review.
- [x] File magic bytes, bounded 4 MB stream, 25 MP decode guard, decoded/reencoded JPEG, EXIF stripping, private bucket with no authenticated INSERT policy, per-user paths, short signed URLs.
- [x] Push endpoints limited to known HTTPS provider hosts, no credentials/custom ports, mitigating arbitrary-URL SSRF. Persisted subscriptions are revalidated before sending.
- [x] Audit events for food create/delete, photo upload, room invite/report. No full health payloads/passwords/tokens in logs.
- [x] Export + password-confirmed account deletion, RLS cascades on Auth users, deletion of private photos and per-user AI cache. Shared circle history is deleted with its owner and this is disclosed.
- [x] `.gitignore` excludes secrets. Scan commits and working tree before deployment:
  ```sh
  # Install gitleaks using its official release or your package manager.
  gitleaks git --redact
  gitleaks dir . --redact
  npm audit --omit=dev
  ```
  If a secret was committed, rotate it immediately; deleting the file or rewriting history alone is not enough.

### Operational gaps to resolve before a public release

Run a real Supabase authorization test, dependency audit, external security review as appropriate, stress tests for the DB-based limiter, real SMTP verification/reset delivery tests, abuse/CAPTCHA configuration, moderation workflow/contact, privacy contact/legal review, provider region/processor contracts, database backup and restore drills, retention cleanup for demo data/photos, and iOS device testing. A free-tier project is not an uptime guarantee. No analytics, advertising, marketing tracking, or automatic medical advice is included.

## Accessibility implementation and verification

- Native semantic buttons, headings, navigation, labels, forms; skip link and visible focus rings.
- Native `<dialog>.showModal()` supplies focus containment, Escape dismissal, inert background and focus restoration. All icon-only controls have names. Forms have required/min/max constraints and live error/status regions.
- Charts have labeled progress values and numeric summaries; macro meaning is not color-only. Food thumbnails are decorative beside the equivalent text; uploaded photos have descriptive alt text.
- Reduced-motion support, responsive layouts, 16px mobile form inputs to avoid Safari input zoom, no maximum-scale restriction, safe-area support.
- Verification required: automated axe, keyboard-only, 200% zoom, VoiceOver on iOS, contrast under actual screens/overlays, and touch target spacing. This is implementation intent, not an independent WCAG certification.

## Validation

```sh
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build
# Run the platform production start/healthcheck, or deploy via Vercel.
# With a running LOCAL DEMO on localhost:3000:
npx playwright install chromium
node tests/smoke.mjs
```

The browser regression suite uses isolated contexts to check diary CRUD, grams recalculation, hydration persistence, date switching, targets, cross-session authorization, origin rejection, and unconfigured integration failures. Screenshots are written under `/tmp`, not committed. The Supabase RLS SQL test is separate because a local PostgreSQL demo has no Supabase Auth/Storage services.

## Sources and references

- Supabase: https://supabase.com/docs/reference/javascript/auth-signinwithpassword and https://supabase.com/docs/guides/database/postgres/row-level-security
- ZXing WASM: https://sec-ant.github.io/zxing-wasm/docs/
- Hugging Face JS: https://huggingface.co/docs/huggingface.js/inference/README
- Open Food Facts: https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorial-off-api/ (ODbL attribution and derivative database obligations apply)
- Web Push / iOS: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/

Always verify current platform documentation, quotas, and local legal requirements before launch.
