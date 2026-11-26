output "instance_id" {
  value = aws_instance.app.id
}

output "instance_arn" {
  value = aws_instance.app.arn
}

output "public_ip" {
  value = aws_eip.app.public_ip
}

output "origin_domain_name" {
  description = "Stable public DNS name used as the CloudFront API origin"
  value       = local.origin_domain_name
}

output "data_volume_id" {
  value = aws_ebs_volume.data.id
}
