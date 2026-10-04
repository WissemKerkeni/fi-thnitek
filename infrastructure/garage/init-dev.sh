#!/usr/bin/env sh
# One-time setup of the dev Garage node: layout, the API's access key and the private documents bucket.
# Idempotent. Run from the repo root after `docker compose ... up -d garage`:
#   sh infrastructure/garage/init-dev.sh
set -eu
COMPOSE="docker compose -f infrastructure/compose/docker-compose.dev.yml"
G="$COMPOSE exec -T garage /garage"

# Dev-only credentials (must match apps/api/.env.example).
KEY_ID="GK1f2e3d4c5b6a79880f1e2d3c"
KEY_SECRET="6d1c4f0a9b8e7d6c5b4a39281706f5e4d3c2b1a0f9e8d7c6b5a4938271605f4e"
BUCKET="fi-documents"

NODE_ID=$($G node id -q | cut -d@ -f1)
if ! $G layout show | grep -q "$(echo "$NODE_ID" | cut -c1-16)"; then
  $G layout assign -z dc1 -c 1G "$NODE_ID"
  $G layout apply --version 1
fi
$G key info "$KEY_ID" >/dev/null 2>&1 || $G key import --yes -n fi-api "$KEY_ID" "$KEY_SECRET"
$G bucket info "$BUCKET" >/dev/null 2>&1 || $G bucket create "$BUCKET"
$G bucket allow --read --write --owner "$BUCKET" --key "$KEY_ID"
echo "Garage ready: bucket $BUCKET, key $KEY_ID"
