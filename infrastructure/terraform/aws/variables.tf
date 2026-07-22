variable "aws_region" {
  type        = string
  description = "The target AWS Region for deployment."
  default     = "us-east-1"
}

variable "cluster_name" {
  type        = string
  description = "The name of the provisioned EKS cluster."
  default     = "lgtm-eks-cluster"
}

variable "vpc_cidr" {
  type        = string
  description = "The IP address range (CIDR) of the custom VPC."
  default     = "10.0.0.0/16"
}

variable "node_instance_type" {
  type        = string
  description = "The EC2 instance family type for managed workers."
  default     = "t3.medium"
}

variable "node_count" {
  type        = number
  description = "Desired auto-scaling size of node group."
  default     = 2
}
