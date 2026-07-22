variable "gcp_project_id" {
  type        = string
  description = "The target Google Cloud Project ID."
}

variable "gcp_region" {
  type        = string
  description = "The target GCP Region for deployment."
  default     = "us-central1"
}

variable "cluster_name" {
  type        = string
  description = "The name of the GKE cluster."
  default     = "lgtm-gke-cluster"
}

variable "node_machine_type" {
  type        = string
  description = "GCE machine family shape type for GKE workers."
  default     = "e2-medium"
}

variable "node_count" {
  type        = number
  description = "Initial number of GKE worker nodes."
  default     = 2
}
