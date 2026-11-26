output "infra_role_arn" {
  value = aws_iam_role.infra.arn
}

output "deploy_role_arn" {
  value = aws_iam_role.deploy.arn
}

output "oidc_provider_arn" {
  value = local.oidc_provider_arn
}
