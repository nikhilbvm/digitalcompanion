variable "name_prefix" {
  description = "Prefix used for the API distribution"
  type        = string
}

variable "origin_domain_name" {
  description = "Public DNS name of the EC2 Elastic IP origin"
  type        = string
}

variable "origin_port" {
  description = "HTTP port on the EC2 origin"
  type        = number
  default     = 4000
}

variable "tags" {
  description = "Common resource tags"
  type        = map(string)
  default     = {}
}
