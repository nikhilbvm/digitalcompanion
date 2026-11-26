variable "name_prefix" {
  description = "Prefix used for the artifacts bucket"
  type        = string
}

variable "tags" {
  description = "Common resource tags"
  type        = map(string)
  default     = {}
}
