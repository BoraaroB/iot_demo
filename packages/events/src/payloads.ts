import { z } from 'zod';

/**
 * Vehicle-published MQTT payloads, validated at the MQTT boundary by
 * iot-ingestion and carried unchanged as the Kafka envelope `payload`.
 * See docs/contracts.md "Payloads" for units. `factoryId`/`vehicleId` are
 * NOT part of the payload — the MQTT topic is authoritative for identity.
 *
 * Unknown keys are stripped (Zod default), so an older ingestion tolerates a
 * newer vehicle firmware adding fields; removing or changing a field needs a
 * `schemaVersion` bump.
 */

/**
 * Periodic telemetry. `timestamp` is device time; the envelope's is ingestion
 * time. Zod v4 `z.number()` already rejects Infinity/NaN.
 */
export const telemetryPayloadSchema = z.object({
  timestamp: z.iso.datetime(),
  x: z.number(),
  y: z.number(),
  speed: z.number().nonnegative(),
  battery: z.number().min(0).max(100),
  temperature: z.number(),
});

export type TelemetryPayload = z.infer<typeof telemetryPayloadSchema>;

export const vehicleStatuses = ['idle', 'moving', 'charging', 'error'] as const;

/** Vehicle-reported operational status. */
export const statusPayloadSchema = z.object({
  timestamp: z.iso.datetime(),
  status: z.enum(vehicleStatuses),
});

export type StatusPayload = z.infer<typeof statusPayloadSchema>;

/** `eventType` values for envelopes produced by iot-ingestion. */
export const eventTypes = {
  telemetryReported: 'vehicle.telemetry.reported',
  statusReported: 'vehicle.status.reported',
} as const;

/** Current `schemaVersion` of the payloads above. */
export const PAYLOAD_SCHEMA_VERSION = 1;
