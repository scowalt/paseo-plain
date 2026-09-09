terraform {
  required_version = ">= 1.11.0"
  required_providers {
    github = {
      source  = "integrations/github"
      version = "6.11.1"
    }
  }
}

provider "github" {
  owner = "scowalt"
}

resource "github_repository" "paseo_plain" {
  name                   = "paseo-plain"
  description            = "Manual, display-only plain-English rewrites for Paseo assistant answers."
  visibility             = "public"
  has_issues             = true
  has_wiki               = false
  has_projects           = false
  allow_squash_merge     = true
  delete_branch_on_merge = true

  lifecycle {
    prevent_destroy = true
  }
}
