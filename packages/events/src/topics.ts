import type { FactoryId, VehicleId } from '@iiot/types';

/**
 * MQTT topics — see CLAUDE.md "Contracts". Do not introduce a different
 * convention without documenting the reason.
 */
export const mqttTopics = {
  telemetry: (factoryId: FactoryId, vehicleId: VehicleId): string =>
    `factory/${factoryId}/vehicle/${vehicleId}/telemetry`,
  status: (factoryId: FactoryId, vehicleId: VehicleId): string =>
    `factory/${factoryId}/vehicle/${vehicleId}/status`,
  command: (factoryId: FactoryId, vehicleId: VehicleId): string =>
    `factory/${factoryId}/vehicle/${vehicleId}/command`,
} as const;

/**
 * Kafka topics — see CLAUDE.md "Contracts". Message keys should use
 * `vehicleId` where per-vehicle ordering matters.
 */
export const kafkaTopics = {
  vehicleTelemetry: 'vehicle.telemetry',
  vehicleLocation: 'vehicle.location',
  vehicleStatus: 'vehicle.status',
  vehicleAlert: 'vehicle.alert',
  vehicleMission: 'vehicle.mission',
  vehicleCommand: 'vehicle.command',
} as const;

export type KafkaTopic = (typeof kafkaTopics)[keyof typeof kafkaTopics];
