# S-12 / P-03: the gitleaks `hashicorp-tf-password` FP storm (#1302).
# These are LOW-ENTROPY stopword literals in a config fixture — NOT leaks.
# A correct scanner (entropy gating + allowlist) must NOT flag any of these.
resource "db" "main" {
  password = "password"
  admin_password = "changeme"
  default_password = "secret"
}
