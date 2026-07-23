# 1. Custom VPC Network
resource "google_compute_network" "vpc_network" {
  name                    = "lgtm-vpc-network"
  auto_create_subnetworks = false
}

# 2. Subnetwork with IP Ranges for Nodes, Pods, and Services
resource "google_compute_subnetwork" "subnet" {
  name          = "lgtm-subnet"
  ip_cidr_range = "10.10.0.0/20"
  region        = var.gcp_region
  network       = google_compute_network.vpc_network.id

  secondary_ip_range {
    range_name    = "gke-pods-range"
    ip_cidr_range = "10.20.0.0/16"
  }

  secondary_ip_range {
    range_name    = "gke-services-range"
    ip_cidr_range = "10.30.0.0/20"
  }

  private_ip_google_access = true
}

# 3. Cloud Router
resource "google_compute_router" "router" {
  name    = "lgtm-router"
  region  = var.gcp_region
  network = google_compute_network.vpc_network.id
}

# 4. Cloud NAT (allows GKE nodes to fetch external packages without public IPs)
resource "google_compute_router_nat" "nat" {
  name                               = "lgtm-nat"
  router                             = google_compute_router.router.name
  region                             = var.gcp_region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
}
