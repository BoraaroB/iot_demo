# Contracts

## MQTT topics

```text
factory/{factoryId}/vehicle/{vehicleId}/telemetry
factory/{factoryId}/vehicle/{vehicleId}/status
factory/{factoryId}/vehicle/{vehicleId}/command
```

## Kafka topics

`vehicle.telemetry`, `vehicle.location`, `vehicle.status`, `vehicle.alert`, `vehicle.mission`, `vehicle.command`.
Key = `vehicleId`.

## Event envelope

Do not add fields casually; version changes via `schemaVersion`.

```ts
interface EventEnvelope<TPayload> {
  eventId: string;
  eventType: string;
  timestamp: string;
  vehicleId: string;
  factoryId: string;
  schemaVersion: number;
  payload: TPayload;
}
```

Consumers must tolerate duplicates, delays and cross-partition reordering (idempotency via `eventId`).

## Coordinates

Local factory `x`/`y` (no GPS initially).

## Multi-tenancy

`organizationId` + `factoryId` on core entities. Tenant isolation is a security requirement.
