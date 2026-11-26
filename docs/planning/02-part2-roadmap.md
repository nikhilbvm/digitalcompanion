# Part 2 roadmap

Part 2 starts only after [Part 1](01-part1-checklist.md) acceptance passes. Three workstreams:
memory capture and review, scheduled check-in ring, and the AWS/Terraform deployment. Auth, consent
and retention are prerequisites for any real family use.

---

## 2A. Memory capture and review

**Goal:** remember stable, useful facts between conversations without letting the companion invent or
over-share sensitive details.

1. **Extraction job** — after a conversation ends, a Haiku call reads the transcript and proposes
   `memory_notes` rows: `{ text, type, sensitivity, confidence }`. Examples: "Daughter Sarah visits on
   Sundays", "Loves old Westerns", "Hard of hearing in the left ear".
2. **Rules** — never extract identifiers, medical diagnoses, financial details or third-party secrets;
   mark anything health/family-sensitive as `medium`/`high`; cap notes per conversation; require a
   minimum confidence.
3. **Review** — `/admin` gains a memory review queue: approve, edit, reject, expire. Only approved
   low-sensitivity notes are eligible for prompts.
4. **Injection** — `buildMemoryBlock(notes)` is appended as a separate system block after the profile,
   outside the persona cache. Keep it small (e.g. top 10 notes) and deterministic.
5. **Retention** — `expires_at`, per-person retention, export and delete. A scheduled job deactivates
   expired notes and purges deleted conversations.

Exit criteria: a memory survives across two conversations, is visible/editable in admin, and can be
deleted cleanly; no identifiers or high-sensitivity notes are injected without explicit approval.

---

## 2B. Scheduled check-in ring

**Goal:** an optional, consented scheduled call or notification ("ring") so the family knows the
person is okay.

1. **Schedule model** — new table `checkin_schedules` (person, days/time, timezone, quiet hours,
   enabled, consent record) and `checkin_runs` (scheduled, started, answered, outcome).
2. **Trigger** — EventBridge Scheduler → API internal endpoint (signed) or a worker cron. Respect
   quiet hours and timezone.
3. **Call path** — LiveKit SIP/telephony or an in-app notification first. If a call, the agent joins a
   room created by the scheduler with a purpose-specific persona ("I'm calling for your afternoon
   check-in"). If no answer, retry once, then notify the family contact; never call covertly.
4. **Safety** — explicit consent from the person/family; easy opt-out; no marketing; emergency
   language unchanged; log outcomes without transcript content in notifications.
5. **Family view** — last check-in status and a "call now" button in admin.

Exit criteria: a consented test schedule fires in the person's timezone, respects quiet hours, records
the outcome, and stops after opt-out.

---

## 2C. AWS and Terraform

**Goal:** deploy the API and voice agent with managed secrets, observability and a repeatable pipeline.

**Initial POC profile (before real users):** one EC2 `t4g.small` running Docker Compose (API + agent +
Postgres), S3 + CloudFront web, API behind CloudFront, no ALB/NAT/RDS. This account is **not
free-tier eligible**, so the POC is estimated at ~$20–25/month on-demand. It is for temporary cloud
E2E with synthetic data. Implementation plan:
[04-tenant-infrastructure.md](04-tenant-infrastructure.md).

**Production profile (change before real users):** RDS PostgreSQL, separate ECS Fargate API/agent
services, ALB, private subnets/NAT, WAF/auth, backups and alarms. Estimated ~$90–150/month. Migrate
with `pg_dump`/`pg_restore`; application code and `DATABASE_URL` stay the same.

1. **Terraform modules** in `devops/terraform/`: network, ECR, ECS cluster, API service + ALB/API
   Gateway, agent service (no inbound), Secrets Manager, IAM task roles, CloudWatch, GitHub OIDC role.
2. **State** — S3 + DynamoDB lock per environment (`dev`, `prod`).
3. **Images** — build in CI, push to ECR, deploy by immutable tag. GHCR remains for local/Part 1.
4. **Secrets** — OpenRouter/Anthropic, Deepgram, LiveKit, `DATABASE_URL` in Secrets Manager; task
   definitions inject at runtime; no secrets in env files or git.
5. **Pipeline** — manual deploy with version + environment; prod approval gate; migration step before
   service update; `/health` smoke test; deploy tag `deploy/{env}/{component}/v{version}`.
6. **Observability** — CloudWatch logs/alarms for 5xx, latency, agent restarts, classifier degradation,
   flag volume; no transcript text.
7. **Web** — **S3 + CloudFront** static Next export; `NEXT_PUBLIC_API_BASE_URL` points at the API;
   Capacitor wrapper later using the same client-only UI. AWS Amplify Hosting is an alternative if
   managed preview builds are wanted.
8. **Rollback** — redeploy previous image tag; migrations backward-compatible for one release.

Exit criteria: a one-command deploy to `dev`, a documented rollback, alarms firing to an on-call
channel, and no secret in the repo or task environment files.

---

## 2D. Authentication, consent and hardening

Prerequisite for family use, parallel with 2A:

- Family accounts, sessions, per-person authorization, audit log.
- Consent and recording/transcript disclosure; emergency escalation policy with a human contact.
- Rate limits, WAF, request size limits, admin CSRF protection.
- Retention/export/delete controls; backup/restore drill.
- Privacy review of OpenRouter/Anthropic/Deepgram/LiveKit/AWS processing, provider routing and
  prompt caching.
- Accessibility review with older adults; large-type and contrast checks.

---

## Suggested order and milestones

| Milestone | Contents | Gate |
|---|---|---|
| M1 | Part 1 acceptance | demo script passes with real keys |
| M2 | Auth + retention + audit | family account can access only their person |
| M3 | Memory extraction + review | memory persists, reviewable, deletable |
| M4 | Terraform dev deploy | CI → ECR → ECS dev, health green |
| M5 | Scheduled ring (dev) | consented test schedule fires correctly |
| M6 | Prod hardening | pen test, alarms, backups, consent, prod approval |
| M7 | Capacitor/web polish | app wrapper, accessibility review |

---

## Risks

| Risk | Mitigation |
|---|---|
| Memory invents or over-shares | extraction rules + approval queue + low-sensitivity-only injection |
| Scheduled calls feel intrusive or covert | explicit consent, quiet hours, easy opt-out, family visibility |
| Agent cost/latency grows | effort low, short replies, history caps, cache persona, monitor token usage |
| AWS complexity delays product | start with a single-region dev stack; keep Terraform modules small |
| Compliance (HIPAA) assumptions | Part 1 is not HIPAA-ready; assess before any health-data use |
| Public repo leaks | secret scanning, no real data in seeds/docs, service role server-only |

---

## Out of scope for Part 2 (revisit later)

- Native mobile apps beyond Capacitor.
- Multi-language conversations (English first).
- Video calls or avatars.
- Clinical integrations or EHR access.
- Autonomous actions (booking, purchases) — the companion remains conversational.
