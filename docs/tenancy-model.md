# Tenancy model — one organization, many tenants

This is the vocabulary and the short explanation to use with a user/customer. No account IDs,
emails or credentials belong in this public document.

---

## 1. The model

```
1 AWS Organization
│   management account: owns billing, SSO, SCPs, vending
│
└── 1 OU: `tenants`  (internal policy folder — NOT a customer)
    ├── tenant A / AWS account (e.g. digitalcompanion-dev)
    ├── tenant B / AWS account (e.g. digitalcompanion-prod)
    └── tenant C / AWS account (future customer)
```

| Layer | Count | Customer-visible? | Purpose |
|---|---:|---|---|
| Organization | 1 | indirect | Billing, identity, policy, account creation |
| Management account | 1 | no | Owns the org, SSO, SCPs, vending |
| `tenants` OU | 1 (today) | no | Internal folder that applies guardrail SCPs to all tenants |
| Tenant / member account | many | **yes** | Isolated AWS account with the app resources |
| Identity Center user | one per human | yes (portal) | SSO login; role assignments per tenant |
| Budget | one per tenant | yes (billing contact) | Monthly cost cap with email alerts |

**One tenant = one AWS account.** `dev` and `prod` are two tenants. The management account is not a
tenant. The `tenants` OU is a policy container, not a customer.

---

## 2. How to present it to a user

**30-second version:**

> "Your workspace runs in its own dedicated AWS account. It is isolated from every other customer:
> separate resources, separate access, separate budget. We manage billing, identity and the safety
> guardrails centrally, and you sign in through a secure portal with an admin role for your own
> account."

**What the user sees:**

- An email invitation / AWS access portal login.
- One account (their tenant) in the portal.
- An admin role for **that account only**.
- Their own AWS console, resources, budget alerts and bills rolled up to the platform owner.

**What the user does not see or control:**

- The management account, other tenants, the `tenants` OU, SCP internals or the vending control plane.
- Root credentials; these are not shared and the tenant root is denied by policy.
- Region changes outside the approved region; long-lived IAM users/access keys.

**Why this is reassuring:**

- A separate account is a strong isolation boundary; another tenant cannot see or touch their
  resources.
- Guardrails are inherited automatically; the customer does not have to configure security basics.
- Their admin access is scoped to their account and auditable through SSO.
- A budget and alerts are created with the account.

**Do not say:**

- "You are in our AWS organization" (too technical and ambiguous).
- "The OU is your tenant" (the OU is an internal policy folder).
- "You get root" (root is intentionally blocked).
- "There is a hard spend cap" (AWS Budgets alerts; no true hard cap).

---

## 3. User FAQ

| Question | Answer |
|---|---|
| "Is my data mixed with other customers?" | No. Each tenant is a separate AWS account with its own resources and access. |
| "Who pays?" | The platform owner pays the AWS bill; each tenant has its own budget and alerts. |
| "Can I have dev and prod?" | Yes — each is a separate tenant/account (`…-dev`, `…-prod`). |
| "Can I invite my team?" | They are assigned through the central Identity Center portal, scoped to this tenant. |
| "Can I create IAM users or keys?" | No; access is through SSO roles. This is a guardrail, not a limitation of the app. |
| "Can I use another region?" | Not by default; the tenant is locked to the approved region. |
| "How is the tenant deleted?" | The account is closed from the management account; there is a 90-day recovery window. |
| "Can I get the root login?" | No; root is denied for tenants. The platform owner controls account lifecycle. |

---

## 4. Internal ownership

| Responsibility | Owner |
|---|---|
| Organization, management account, SCPs, Identity Center | Platform owner |
| Tenant account creation, tags, budget, SSO assignment, closure | Vending control plane (internal scripts/API) |
| Application resources inside the tenant | Digital Companion Terraform/deploy pipeline |
| Tenant data/transcripts | Tenant account's database; service access only |

See [devops/tenancy/RUNBOOK.md](../devops/tenancy/RUNBOOK.md) for the operational commands and
[docs/history/aws-tenancy-log.md](history/aws-tenancy-log.md) for the dated work log.
