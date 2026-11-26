output "api_url" {
  description = "HTTPS API endpoint (CloudFront default domain)"
  value       = module.cloudfront_api.url
}

output "web_url" {
  description = "HTTPS web endpoint (CloudFront default domain)"
  value       = module.web.url
}

output "web_cloudfront_distribution_id" {
  value = module.web.distribution_id
}

output "web_bucket" {
  value = module.web.bucket_name
}

output "artifacts_bucket" {
  value = module.artifacts.bucket_name
}

output "ecr_repository_urls" {
  value = module.ecr.repository_urls
}

output "instance_id" {
  value = module.ec2_app.instance_id
}

output "api_origin_domain_name" {
  description = "EC2 public DNS origin used by CloudFront"
  value       = module.ec2_app.origin_domain_name
}

output "github_infra_role_arn" {
  value = module.github_oidc.infra_role_arn
}

output "github_deploy_role_arn" {
  value = module.github_oidc.deploy_role_arn
}

output "ssm_parameter_path" {
  value = local.ssm_path
}

output "log_group_names" {
  value = {
    api   = module.observability.api_log_group_name
    agent = module.observability.agent_log_group_name
  }
}
