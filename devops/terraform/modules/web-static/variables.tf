variable "name_prefix" {
  description = "Prefix used for the web bucket and distribution"
  type        = string
}

variable "tags" {
  description = "Common resource tags"
  type        = map(string)
  default     = {}
}
