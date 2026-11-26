variable "name_prefix" {
  description = "Prefix used for IAM role names"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository allowed to assume the roles"
  type        = string
  default     = "nikhilbvm/digitalcompanion"
}

variable "github_environment" {
  description = "GitHub Environment used by AWS jobs"
  type        = string
  default     = "digitalcompanion-dev"
}

variable "create_oidc_provider" {
  description = "Create the GitHub OIDC provider (set false if it already exists)"
  type        = bool
  default     = true
}

variable "artifact_bucket_arn" {
  description = "S3 artifacts bucket ARN"
  type        = string
}

variable "web_bucket_arn" {
  description = "S3 web bucket ARN"
  type        = string
}

variable "ecr_repository_arns" {
  description = "ECR repository ARNs"
  type        = list(string)
}

variable "api_distribution_arn" {
  description = "CloudFront API distribution ARN"
  type        = string
}

variable "web_distribution_arn" {
  description = "CloudFront web distribution ARN"
  type        = string
}

variable "instance_arn" {
  description = "EC2 instance ARN for SSM Run Command"
  type        = string
}

variable "ssm_parameter_path" {
  description = "SSM parameter path used by the deployment"
  type        = string
}

variable "tags" {
  description = "Common resource tags"
  type        = map(string)
  default     = {}
}
