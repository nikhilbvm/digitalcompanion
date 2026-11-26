variable "name_prefix" {
  description = "Prefix used for EC2 resources"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "subnet_id" {
  description = "Public subnet for the app instance"
  type        = string
}

variable "security_group_id" {
  description = "Security group allowing CloudFront to reach the API port"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t4g.small"
}

variable "data_volume_size" {
  description = "Size of the data EBS volume in GB"
  type        = number
  default     = 20
}

variable "app_port" {
  description = "API container port"
  type        = number
  default     = 4000
}

variable "ecr_repository_arns" {
  description = "ECR repositories the instance may pull from"
  type        = list(string)
}

variable "artifacts_bucket_arn" {
  description = "S3 bucket for deploy bundles and migration SQL"
  type        = string
}

variable "ssm_parameter_path" {
  description = "SSM parameter path the instance may read"
  type        = string
}

variable "cloudwatch_namespace" {
  description = "CloudWatch agent metric namespace"
  type        = string
  default     = "CWAgent"
}

variable "tags" {
  description = "Common resource tags"
  type        = map(string)
  default     = {}
}
