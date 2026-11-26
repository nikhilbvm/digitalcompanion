data "aws_cloudfront_cache_policy" "api_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "api_all_viewer" {
  name = "Managed-AllViewer"
}

locals {
  name_prefix = var.tenant_name
  ssm_path    = "/digitalcompanion/${var.tenant_name}"

  tags = {
    project    = var.project
    env        = var.environment
    tenant     = var.tenant_name
    owner      = var.owner
    managed-by = "terraform"
  }
}

module "network" {
  source = "../../modules/network-minimal"

  name_prefix        = local.name_prefix
  vpc_cidr           = var.vpc_cidr
  public_subnet_cidr = var.public_subnet_cidr
  app_port           = var.app_port
  tags               = local.tags
}

module "ecr" {
  source = "../../modules/ecr"

  name_prefix = local.name_prefix
  tags        = local.tags
}

module "artifacts" {
  source = "../../modules/s3-artifacts"

  name_prefix = local.name_prefix
  tags        = local.tags
}

module "ec2_app" {
  source = "../../modules/ec2-app"

  name_prefix          = local.name_prefix
  aws_region           = var.aws_region
  subnet_id            = module.network.public_subnet_id
  security_group_id    = module.network.app_security_group_id
  instance_type        = var.instance_type
  data_volume_size     = var.data_volume_size
  app_port             = var.app_port
  ecr_repository_arns  = module.ecr.repository_arns
  artifacts_bucket_arn = module.artifacts.bucket_arn
  ssm_parameter_path   = local.ssm_path
  tags                 = local.tags
}

module "cloudfront_api" {
  source = "../../modules/cloudfront-api"

  name_prefix              = local.name_prefix
  origin_domain_name       = module.ec2_app.origin_domain_name
  origin_port              = var.app_port
  cache_policy_id          = data.aws_cloudfront_cache_policy.api_disabled.id
  origin_request_policy_id = data.aws_cloudfront_origin_request_policy.api_all_viewer.id
  tags                     = local.tags

  depends_on = [module.ec2_app]
}

module "web" {
  source = "../../modules/web-static"

  name_prefix = local.name_prefix
  tags        = local.tags
}

module "observability" {
  source = "../../modules/observability"

  name_prefix        = local.name_prefix
  instance_id        = module.ec2_app.instance_id
  log_retention_days = var.log_retention_days
  tags               = local.tags
}

module "github_oidc" {
  source = "../../modules/github-oidc"

  name_prefix          = local.name_prefix
  github_repo          = var.github_repo
  github_environment   = var.github_environment
  create_oidc_provider = var.create_github_oidc_provider
  artifact_bucket_arn  = module.artifacts.bucket_arn
  web_bucket_arn       = module.web.bucket_arn
  ecr_repository_arns  = module.ecr.repository_arns
  api_distribution_arn = module.cloudfront_api.distribution_arn
  web_distribution_arn = module.web.distribution_arn
  instance_arn         = module.ec2_app.instance_arn
  ssm_parameter_path   = local.ssm_path
  tags                 = local.tags
}
