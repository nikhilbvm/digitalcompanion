variable "name_prefix" {
  description = "Prefix used for log groups and alarms"
  type        = string
}

variable "instance_id" {
  description = "EC2 instance id for alarms"
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention"
  type        = number
  default     = 30
}

variable "tags" {
  description = "Common resource tags"
  type        = map(string)
  default     = {}
}
