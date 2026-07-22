output "cluster_name" {
  value       = oci_containerengine_cluster.oke_cluster.name
  description = "The name of the provisioned OKE cluster."
}

output "cluster_id" {
  value       = oci_containerengine_cluster.oke_cluster.id
  description = "The OCID of the provisioned OKE cluster."
}

output "kubeconfig_command" {
  value       = "oci ce cluster create-kubeconfig --cluster-id ${oci_containerengine_cluster.oke_cluster.id} --file $HOME/.kube/config --region ${var.oci_region} --token-version 2.0.0 --kube-endpoint PUBLIC_ENDPOINT"
  description = "Command to configure kubectl to point to OKE."
}
