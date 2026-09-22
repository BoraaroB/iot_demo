#!/bin/bash
# Creates the platform's Kafka topics explicitly (auto-create is disabled on the broker).
# Run by the one-shot `kafka-init` service in docker-compose.yml. Idempotent (--if-not-exists).
#
# Topic names MUST match `kafkaTopics` in packages/events/src/topics.ts and docs/contracts.md.
# `npm run smoke:kafka` fails if they drift.
set -euo pipefail

BOOTSTRAP="${KAFKA_BOOTSTRAP_SERVER:-kafka:19092}"
KAFKA_BIN=/opt/kafka/bin

# name:partitions — replication factor is 1 (single-node dev broker).
# Partition count caps per-consumer-group parallelism; high-volume topics get more.
TOPICS="
vehicle.telemetry:6
vehicle.location:6
vehicle.status:3
vehicle.alert:3
vehicle.mission:3
vehicle.command:3
"

for entry in $TOPICS; do
  name="${entry%%:*}"
  partitions="${entry##*:}"
  "$KAFKA_BIN/kafka-topics.sh" --bootstrap-server "$BOOTSTRAP" \
    --create --if-not-exists \
    --topic "$name" \
    --partitions "$partitions" \
    --replication-factor 1
done

echo "Topics on $BOOTSTRAP:"
"$KAFKA_BIN/kafka-topics.sh" --bootstrap-server "$BOOTSTRAP" --list
