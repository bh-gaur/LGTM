include "root" {
  path = find_in_parent_folders()
}

inputs = {
  tenancy_ocid     = "YOUR_TENANCY_OCID"
  user_ocid        = "YOUR_USER_OCID"
  fingerprint      = "YOUR_FINGERPRINT"
  private_key_path = "YOUR_PRIVATE_KEY_PATH"
  compartment_ocid = "YOUR_COMPARTMENT_OCID"
  oci_region       = "us-ashburn-1"
  cluster_name     = "lgtm-oke-cluster"
  node_shape       = "VM.Standard.E4.Flex"
  node_ocpus       = 2
  node_memory_gb   = 16
  node_count       = 2
}
