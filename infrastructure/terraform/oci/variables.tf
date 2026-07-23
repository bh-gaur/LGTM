variable "tenancy_ocid" {
  type        = string
  description = "The OCID of the OCI tenancy."
}

variable "user_ocid" {
  type        = string
  description = "The OCID of the user calling API."
}

variable "fingerprint" {
  type        = string
  description = "Fingerprint of OCI API private key."
}

variable "private_key_path" {
  type        = string
  description = "Local path to OCI API private key file."
}

variable "compartment_ocid" {
  type        = string
  description = "The target OCI Compartment OCID."
}

variable "oci_region" {
  type        = string
  description = "The target OCI Region."
  default     = "us-ashburn-1"
}

variable "cluster_name" {
  type        = string
  description = "Name of the OKE cluster."
  default     = "lgtm-oke-cluster"
}

variable "node_shape" {
  type        = string
  description = "The OCI Compute shape shape for worker nodes."
  default     = "VM.Standard.E4.Flex"
}

variable "node_ocpus" {
  type        = number
  description = "OCPUs allocated to flexible shape instances."
  default     = 2
}

variable "node_memory_gb" {
  type        = number
  description = "Memory allocated to flexible shape instances (in GB)."
  default     = 16
}

variable "node_count" {
  type        = number
  description = "Number of worker nodes in node pool."
  default     = 2
}
