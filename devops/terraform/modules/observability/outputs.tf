output "api_log_group_name" {
  value = aws_cloudwatch_log_group.api.name
}

output "agent_log_group_name" {
  value = aws_cloudwatch_log_group.agent.name
}
