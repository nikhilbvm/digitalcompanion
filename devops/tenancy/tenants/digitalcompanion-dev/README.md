# Tenant: digitalcompanion-dev

Non-secret tenant facts. Account IDs, role ARNs, emails and credentials stay in the local ops record
and GitHub Environment variables.

| Field | Value |
|---|---|
| Tenant | `digitalcompanion-dev` |
| Environment | dev |
| AWS region | `us-east-1` |
| SSO profile | `dc-tenant-dev` |
| Terraform stack | `devops/terraform/stacks/digitalcompanion-dev` |
| State key | `digitalcompanion/digitalcompanion-dev/terraform.tfstate` |
| Budget | $25/month, 50/80/100% direct email alerts |
| Status | Web, API, voice agent and Postgres live; CloudTrail pending |

## Links

- [Tenant infrastructure plan](../../../../docs/planning/04-tenant-infrastructure.md)
- [Tenancy model](../../../../docs/tenancy-model.md)
- [Runbook](../../RUNBOOK.md)
- [Audit](AUDIT.md)

## Notes

- The POC uses synthetic data only. There is no database backup automation by decision; data is
  disposable and rebuildable from migrations/seed.
- The API and web are reached through CloudFront default domains; no custom domain is configured.
- SSM Session Manager is the only host shell path; there is no SSH ingress.
- Local `pnpm dev` and cloud both use the LiveKit agent name `dc` by default; change the local name
  (for example `AGENT_NAME=dc-local`) before running both, or dispatches may cross over.
