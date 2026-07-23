# 1. GKE Cluster Control Plane
resource "google_container_cluster" "gke" {
  name     = var.cluster_name
  location = var.gcp_region

  # Delete default node pool on create and replace with custom managed node pool
  remove_default_node_pool = true
  initial_node_count       = 1

  network    = google_compute_network.vpc_network.id
  subnetwork = google_compute_subnetwork.subnet.id

  ip_allocation_policy {
    cluster_secondary_range_name  = "gke-pods-range"
    services_secondary_range_name = "gke-services-range"
  }

  release_channel {
    channel = "REGULAR"
  }

  workload_identity_config {
    workload_pool = "${var.gcp_project_id}.svc.id.goog"
  }
}

# 2. Managed Custom Node Pool (Auto-Scaling)
resource "google_container_node_pool" "primary_nodes" {
  name       = "lgtm-node-pool"
  location   = var.gcp_region
  cluster    = google_container_cluster.gke.name
  node_count = var.node_count

  node_config {
    preemptible  = false
    machine_type = var.node_machine_type

    # Standard IAM Scopes for GKE nodes
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      role = "lgtm-worker-nodes"
    }

    metadata = {
      disable-legacy-endpoints = "true"
    }
  }

  autoscaling {
    min_node_count = 1
    max_node_count = var.node_count + 3
  }
}
