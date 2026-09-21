#!/usr/bin/env bash
# Regenerates services/<name>/Dockerfile from infrastructure/docker/Dockerfile.service.template.
# Ports must match each service's `PORT` default in src/config.ts.
# Portable to bash 3.2 (macOS default) — no associative arrays.
set -euo pipefail

cd "$(dirname "$0")/../.."

SERVICE_PORTS="
api-gateway:3000
iot-ingestion:3001
telemetry:3002
vehicle:3003
alert:3004
realtime:3005
simulator:3006
"

TEMPLATE="infrastructure/docker/Dockerfile.service.template"

for entry in $SERVICE_PORTS; do
  service="${entry%%:*}"
  port="${entry##*:}"
  out="services/$service/Dockerfile"
  sed -e "s/__SERVICE__/$service/g" -e "s/__PORT__/$port/g" "$TEMPLATE" > "$out"
  echo "generated $out (port $port)"
done
