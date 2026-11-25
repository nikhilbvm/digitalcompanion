# 2026-11-25 — AWS tenant bootstrap

Applied manually from the management account, using the `dc-admin` SSO profile:

- Enabled IAM Identity Center in `us-east-1`; created the `TenantAdmin` permission set and an SSO
  user; created local `dc-admin` and `dc-tenant-dev` profiles.
- Created the `tenants` OU and attached four guardrail SCPs:
  region lock to `us-east-1`, root-user deny, IAM-user/access-key deny, organization/CloudTrail
  protection.
- Created the first tenant account, moved it under `tenants`, tagged it
  `project=digitalcompanion env=dev owner=nikhil`, assigned `TenantAdmin`, and created a
  $25/month cost budget with 50/80/100% alerts.
- Verified guardrails: an out-of-region EC2 call and `iam:CreateUser` are explicitly denied.
- SNS budget subscription is awaiting email confirmation.

Before this is production-ready: confirm SNS, add the internal create/close/recreate scripts and
vending control plane, install the tenant baseline (logging/roles), deploy the POC profile, and only
then consider public self-serve vending. See [../planning/03-aws-tenancy.md](../planning/03-aws-tenancy.md).
