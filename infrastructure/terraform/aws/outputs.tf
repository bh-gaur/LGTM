output "cluster_name" {
  value       = aws_eks_cluster.eks.name
  description = "The name of the provisioned EKS cluster."
}

output "cluster_endpoint" {
  value       = aws_eks_cluster.eks.endpoint
  description = "The Kubernetes API server endpoint of the EKS cluster."
}

output "cluster_security_group_id" {
  value       = aws_eks_cluster.eks.vpc_config[0].cluster_security_group_id
  description = "Security group ID created for the EKS cluster."
}

output "vpc_id" {
  value       = aws_vpc.lgtm_vpc.id
  description = "The ID of the custom VPC."
}

output "kubeconfig_command" {
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${aws_eks_cluster.eks.name}"
  description = "Command to configure kubectl to point to EKS."
}
