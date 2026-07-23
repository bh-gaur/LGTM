include "root" {
  path = find_in_parent_folders()
}

inputs = {
  gcp_project_id    = "YOUR_GCP_PROJECT_ID"
  gcp_region        = "us-central1"
  cluster_name      = "lgtm-gke-cluster"
  node_machine_type = "e2-medium"
  node_count        = 2
}
