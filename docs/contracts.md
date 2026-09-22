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

## Payloads (schemaVersion 1)

Vehicle → platform MQTT payloads are JSON, validated with Zod by `iot-ingestion`
(`telemetryPayloadSchema` / `statusPayloadSchema` in `packages/events/src/payloads.ts`) and carried
unchanged as the envelope `payload`. `factoryId`/`vehicleId` come from the MQTT topic, never from the
payload. Unknown keys are stripped; invalid or non-JSON messages are logged and dropped, never forwarded.

| MQTT kind | Kafka topic | `eventType` | Fields |
|---|---|---|---|
| `telemetry` | `vehicle.telemetry` | `vehicle.telemetry.reported` | `timestamp` (ISO 8601, device time), `x`, `y` (local factory coords), `speed` (≥ 0), `battery` (0–100 %), `temperature` (°C) |
| `status` | `vehicle.status` | `vehicle.status.reported` | `timestamp` (ISO 8601, device time), `status` (`idle` \| `moving` \| `charging` \| `error`) |

Envelope `timestamp` = ingestion time; payload `timestamp` = device time.

## Coordinates

Local factory `x`/`y` (no GPS initially).

## Multi-tenancy

`organizationId` + `factoryId` on core entities. Tenant isolation is a security requirement.
