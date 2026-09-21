/**
 * Shared, type-only definitions used across services. No runtime code, no
 * dependencies. Domain entities (Vehicle, Factory, Mission, ...) are added in
 * Phase 3 once the database schema is designed — see CLAUDE.md "Database Design".
 */

/** Vehicle identifier. Plain string alias (not branded) — matches the wire contract. */
export type VehicleId = string;

/** Factory identifier. */
export type FactoryId = string;

/** Organization identifier — the multi-tenancy boundary. */
export type OrganizationId = string;

/** Zone identifier within a factory. */
export type ZoneId = string;

/** ISO 8601 timestamp string, e.g. `new Date().toISOString()`. */
export type IsoTimestamp = string;

/**
 * Standard envelope for every Kafka event. See CLAUDE.md "Contracts".
 * Do not add fields casually — bump `schemaVersion` for contract changes.
 * Consumers must tolerate duplicate, delayed, and out-of-order events.
 */
export interface EventEnvelope<TPayload> {
  eventId: string;
  eventType: string;
  timestamp: IsoTimestamp;
  vehicleId: VehicleId;
  factoryId: FactoryId;
  schemaVersion: number;
  payload: TPayload;
}
