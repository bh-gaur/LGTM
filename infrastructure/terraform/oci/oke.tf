# 1. Oracle Container Engine for Kubernetes (OKE) Cluster
resource "oci_containerengine_cluster" "oke_cluster" {
  compartment_id     = var.compartment_ocid
  kubernetes_version = "v1.29.1" # Standard supported version in OKE
  name               = var.cluster_name
  vcn_id             = oci_core_vcn.lgtm_vcn.id

  options {
    service_lb_subnet_ids = [oci_core_subnet.public_subnet.id]
  }

  endpoint_config {
    is_public_ip_enabled = true
    subnet_id            = oci_core_subnet.public_subnet.id
  }
}

# 2. Get Available ADs (Availability Domains)
data "oci_identity_availability_domains" "ads" {
  compartment_id = var.compartment_ocid
}

# 3. OKE Node Pool
resource "oci_containerengine_node_pool" "node_pool" {
  cluster_id         = oci_containerengine_cluster.oke_cluster.id
  compartment_id     = var.compartment_ocid
  kubernetes_version = oci_containerengine_cluster.oke_cluster.kubernetes_version
  name               = "lgtm-node-pool"
  node_shape         = var.node_shape

  node_shape_config {
    ocpus         = var.node_ocpus
    memory_in_gbs = var.node_memory_gb
  }

  # Node Source Details (Get latest OCI Linux image dynamically in real applications)
  # Hardcode standard OKE image ID for us-ashburn-1 for syntax validity
  node_source_details {
    image_id    = "ocid1.image.oc1.iad.aaaaaaaav7my2bcrnpep24o4mqqsuxp3rgh4kox3jswv32uaw5e6w4p2zveq"
    source_type = "IMAGE"
  }

  node_config_details {
    placement_configs {
      availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
      subnet_id           = oci_core_subnet.private_subnet.id
    }
    size = var.node_count
  }

  initial_node_labels {
    key   = "role"
    value = "lgtm-worker"
  }
}
