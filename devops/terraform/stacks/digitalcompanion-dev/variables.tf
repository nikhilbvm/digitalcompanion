variable "aws_region" {
  description = "AWS region (tenant is locked to us-east-1)"
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Project tag/name"
  type        = string
  default     = "digitalcompanion"
}

variable "tenant_name" {
  description = "Tenant/account name used in resource names"
  type        = string
  default     = "digitalcompanion-dev"
}

variable "environment" {
  description = "Environment tag"
  type        = string
  default     = "dev"
}

variable "owner" {
  description = "Owner tag"
  type        = string
  default     = "nikhil"
}

variable "vpc_cidr" {
  description = "Tenant VPC CIDR"
  type        = string
  default     = "10.20.0.0/16"
}

variable "public_subnet_cidr" {
  description = "Public subnet CIDR"
  type        = string
  default     = "10.20.1.0/24"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t4g.small"
}

variable "data_volume_size" {
  description = "Postgres/data EBS volume size in GB"
  type        = number
  default     = 20
}

variable "app_port" {
  description = "API container port"
  type        = number
  default     = 4000
}

variable "log_retention_days" {
  description = "CloudWatch log retention"
  type        = number
  default     = 30
}

variable "github_repo" {
  description = "GitHub repository allowed to assume OIDC roles"
  type        = string
  default     = "nikhilbvm/digitalcompanion"
}

variable "github_environment" {
  description = "GitHub Environment used by AWS jobs"
  type        = string
  default     = "digitalcompanion-dev"
}

variable "create_github_oidc_provider" {
  description = "Create the GitHub OIDC provider (false if already present)"
  type        = bool
  default     = true
}
