variable "name_prefix" {
  description = "Prefix used for VPC resource names"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the tenant VPC"
  type        = string
  default     = "10.20.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR block for the single public subnet"
  type        = string
  default     = "10.20.1.0/24"
}

variable "app_port" {
  description = "API container port exposed to CloudFront"
  type        = number
  default     = 4000
}

variable "tags" {
  description = "Common resource tags"
  type        = map(string)
  default     = {}
}
