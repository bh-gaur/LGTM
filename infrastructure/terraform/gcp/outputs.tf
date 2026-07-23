output "cluster_name" {
  value       = google_container_cluster.gke.name
  description = "The name of the provisioned GKE cluster."
}

output "cluster_endpoint" {
  value       = google_container_cluster.gke.endpoint
  description = "The Kubernetes API server endpoint of the GKE cluster."
}

output "network_name" {
  value       = google_compute_network.vpc_network.name
  description = "The name of the provisioned VPC network."
}

output "kubeconfig_command" {
  value       = "gcloud container clusters get-credentials ${google_container_cluster.gke.name} --region ${var.gcp_region} --project ${var.gcp_project_id}"
  description = "Command to configure kubectl to point to GKE."
}
