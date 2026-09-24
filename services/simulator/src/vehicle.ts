import type { StatusPayload, TelemetryPayload } from '@iiot/events';

/**
 * Basic (Phase 1) vehicle model: each vehicle drives a circular loop in local
 * factory coordinates, accelerates/decelerates towards a cruise speed, drains
 * its battery while driving, stops to charge in place when low, and heats up
 * with load. Fully deterministic — initial state is derived from the vehicle
 * index, there is no randomness. Missions, routing to chargers and faults are
 * Phase 5.
 */

type VehicleStatus = StatusPayload['status'];

const CRUISE_SPEED = 1.5; // m/s
const ACCELERATION = 0.5; // m/s²
const LOOP_CENTER = { x: 50, y: 30 }; // m
const DRAIN_MOVING = 0.05; // %/s
const DRAIN_IDLE = 0.005; // %/s
const CHARGE_RATE = 0.5; // %/s
const LOW_BATTERY = 20; // % — stop and charge below this
const CHARGED_BATTERY = 95; // % — resume driving above this
const AMBIENT_TEMP = 25; // °C
const TEMP_RESPONSE = 0.05; // fraction of the gap to the target temperature closed per second

export interface Vehicle {
  readonly vehicleId: string;
  readonly radius: number; // m
  angle: number; // rad, position on the loop
  speed: number; // m/s
  battery: number; // %
  temperature: number; // °C
  status: VehicleStatus;
  /** Battery low: braking to a stop before charging (status stays `moving` until stopped). */
  braking: boolean;
}

export function createVehicle(vehicleId: string, index: number): Vehicle {
  return {
    vehicleId,
    radius: 5 + (index % 5) * 5,
    angle: (index * 2.399) % (2 * Math.PI), // golden angle: spreads vehicles around the loop
    speed: 0,
    battery: 100 - ((index * 7) % 60),
    temperature: AMBIENT_TEMP,
    status: 'moving',
    braking: false,
  };
}

/** Advances the vehicle by `dt` seconds. Returns `true` when `status` changed. */
export function stepVehicle(v: Vehicle, dt: number): boolean {
  const previous = v.status;

  if (v.status === 'moving' && v.battery < LOW_BATTERY) v.braking = true;
  if (v.braking && v.speed === 0) {
    v.braking = false;
    v.status = 'charging';
  }
  if (v.status === 'charging' && v.battery >= CHARGED_BATTERY) v.status = 'moving';

  const targetSpeed = v.status === 'moving' && !v.braking ? CRUISE_SPEED : 0;
  const maxDelta = ACCELERATION * dt;
  v.speed += Math.max(-maxDelta, Math.min(maxDelta, targetSpeed - v.speed));
  v.angle = (v.angle + (v.speed * dt) / v.radius) % (2 * Math.PI);

  if (v.status === 'charging') {
    v.battery = Math.min(100, v.battery + CHARGE_RATE * dt);
  } else {
    v.battery = Math.max(0, v.battery - (v.speed > 0 ? DRAIN_MOVING : DRAIN_IDLE) * dt);
  }

  const targetTemp =
    AMBIENT_TEMP + 10 * (v.speed / CRUISE_SPEED) + (v.status === 'charging' ? 8 : 0);
  v.temperature += (targetTemp - v.temperature) * Math.min(1, TEMP_RESPONSE * dt);

  return v.status !== previous;
}

const round = (n: number, digits: number): number => Number(n.toFixed(digits));

export function toTelemetry(v: Vehicle, timestamp: string): TelemetryPayload {
  return {
    timestamp,
    x: round(LOOP_CENTER.x + v.radius * Math.cos(v.angle), 3),
    y: round(LOOP_CENTER.y + v.radius * Math.sin(v.angle), 3),
    speed: round(v.speed, 3),
    battery: round(v.battery, 2),
    temperature: round(v.temperature, 2),
  };
}

export function toStatus(v: Vehicle, timestamp: string): StatusPayload {
  return { timestamp, status: v.status };
}
