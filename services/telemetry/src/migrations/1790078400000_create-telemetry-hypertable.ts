import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Raw telemetry as a TimescaleDB hypertable partitioned on device time
 * (`payload.timestamp`). Hypertable unique indexes must include the
 * partitioning column, so idempotency on `eventId` is enforced as
 * UNIQUE (event_id, time) — a redelivered Kafka message carries the same
 * payload, hence the same pair.
 */
export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE telemetry (
      time         timestamptz      NOT NULL,
      event_id     uuid             NOT NULL,
      factory_id   text             NOT NULL,
      vehicle_id   text             NOT NULL,
      x            double precision NOT NULL,
      y            double precision NOT NULL,
      speed        double precision NOT NULL,
      battery      double precision NOT NULL,
      temperature  double precision NOT NULL,
      ingested_at  timestamptz      NOT NULL
    );

    SELECT create_hypertable('telemetry', by_range('time'));

    CREATE UNIQUE INDEX telemetry_event_id_time_key ON telemetry (event_id, time);
    CREATE INDEX telemetry_vehicle_id_time_idx ON telemetry (vehicle_id, time DESC);
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql('DROP TABLE telemetry;');
}
