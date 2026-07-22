include "root" {
  path = find_in_parent_folders()
}

inputs = {
  aws_region         = "us-east-1"
  cluster_name       = "lgtm-eks-cluster"
  vpc_cidr           = "10.0.0.0/16"
  node_instance_type = "t3.medium"
  node_count         = 2
}
