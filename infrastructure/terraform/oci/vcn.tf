# 1. Virtual Cloud Network (VCN)
resource "oci_core_vcn" "lgtm_vcn" {
  cidr_block     = "10.0.0.0/16"
  compartment_id = var.compartment_ocid
  display_name   = "lgtm-vcn"
  dns_label      = "lgtmvcn"
}

# 2. Internet Gateway
resource "oci_core_internet_gateway" "ig" {
  compartment_id = var.compartment_ocid
  display_name   = "lgtm-ig"
  vcn_id         = oci_core_vcn.lgtm_vcn.id
}

# 3. NAT Gateway
resource "oci_core_nat_gateway" "nat_gw" {
  compartment_id = var.compartment_ocid
  display_name   = "lgtm-nat-gw"
  vcn_id         = oci_core_vcn.lgtm_vcn.id
}

# 4. Service Gateway
data "oci_core_services" "all_services" {}

resource "oci_core_service_gateway" "sg" {
  compartment_id = var.compartment_ocid
  display_name   = "lgtm-sg"
  vcn_id         = oci_core_vcn.lgtm_vcn.id
  services {
    service_id = data.oci_core_services.all_services.services[0].id
  }
}

# 5. Route Tables
resource "oci_core_route_table" "public_rt" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.lgtm_vcn.id
  display_name   = "lgtm-public-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.ig.id
  }
}

resource "oci_core_route_table" "private_rt" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.lgtm_vcn.id
  display_name   = "lgtm-private-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_nat_gateway.nat_gw.id
  }
}

# 6. Subnets
resource "oci_core_subnet" "public_subnet" {
  cidr_block        = "10.0.1.0/24"
  compartment_id    = var.compartment_ocid
  vcn_id            = oci_core_vcn.lgtm_vcn.id
  display_name      = "lgtm-public-subnet"
  dns_label         = "public"
  route_table_id    = oci_core_route_table.public_rt.id
  security_list_ids = [oci_core_vcn.lgtm_vcn.default_security_list_id]
}

resource "oci_core_subnet" "private_subnet" {
  cidr_block                 = "10.0.2.0/24"
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.lgtm_vcn.id
  display_name               = "lgtm-private-subnet"
  dns_label                  = "private"
  route_table_id             = oci_core_route_table.private_rt.id
  prohibit_public_ip_on_vnic = true
}
