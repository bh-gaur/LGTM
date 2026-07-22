# ============================================================================
# ROOT TERRAGRUNT CONFIGURATION
# Centralizes State Backends and Common Provider Settings
# ============================================================================

# 1. Configure DRY backend state mapping
# Default: Local backend for out-of-the-box local testing
remote_state {
  backend = "local"
  config = {
    path = "${get_parent_terragrunt_dir()}/states/${path_relative_to_include()}/terraform.tfstate"
  }
}

# ============================================================================
# PRODUCTION SECURE REMOTE BACKENDS (Uncomment your chosen cloud)
# ============================================================================

# --- AWS (S3 Bucket with Encryption + DynamoDB State Locking) ---
# remote_state {
#   backend = "s3"
#   config = {
#     encrypt        = true
#     bucket         = "lgtm-company-tfstate-bucket"
#     key            = "${path_relative_to_include()}/terraform.tfstate"
#     region         = "us-east-1"
#     dynamodb_table = "lgtm-tfstate-locks"
#   }
# }

# --- GCP (Google Cloud Storage Bucket with native locks) ---
# remote_state {
#   backend = "gcs"
#   config = {
#     bucket = "lgtm-company-tfstate-bucket"
#     prefix = "${path_relative_to_include()}"
#   }
# }

# --- OCI (Oracle Cloud Object Storage) ---
# remote_state {
#   backend = "http"
#   config = {
#     address        = "https://objectstorage.us-ashburn-1.oraclecloud.com/p/secure-state-uri"
#     unlock_address = "https://objectstorage.us-ashburn-1.oraclecloud.com/p/secure-state-uri"
#     username       = "oci-username"
#     password       = "oci-auth-token"
#   }
# }

# 2. Centrally inject boilerplate version requirements
generate "versions" {
  path      = "versions_generated.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
terraform {
  required_version = ">= 1.5.0"
}
EOF
}
