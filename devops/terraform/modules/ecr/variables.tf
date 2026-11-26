variable "name_prefix" {
  description = "Prefix used for ECR repository names"
  type        = string
}

variable "tags" {
  description = "Common resource tags"
  type        = map(string)
  default     = {}
}
