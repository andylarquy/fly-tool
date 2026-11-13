import { AircraftState } from "../domain/AircraftState";
import { Airport, Runway } from "../domain/Airport";
import { Facility } from "../domain/Facility";
import { GeoPoint } from "../domain/GeoPoint";
import { ListedAirport } from "../domain/ListedAirport";
import { angleDifferenceDegrees, distanceNauticalMiles } from "../utils/geo";

export interface AirportSource {
  list(): Promise<ListedAirport[]>;
  read(icao: string, region?: string): Promise<Airport>;
}

// Far enough from the current airport that it is no longer "the" airport, and
// a new one has to be clearly nearer (so that passing the midpoint between two
// airports does not flip back and forth).
const LEAVE_NM = 8;
const SWITCH_MARGIN_NM = 2;
// On the ground a neighbor closer than this counts as arriving even when the
// airports are only a few miles apart.
const ARRIVE_NM = 2;
const NEIGHBOR_MIN_DISTANCE_NM = 3;
// In the air an airport further away than this is not worth preparing for.
const AIRBORNE_RANGE_NM = 30;
const MAX_CANDIDATES_READ = 5;
// A single telemetry sample never moves this far on its own.
const JUMP_NM = 1;

export const isJump = (previous: AircraftState, next: AircraftState): boolean =>
  distanceNauticalMiles(previous, next) > JUMP_NM ||
  (previous.simTimeSeconds !== undefined &&
    next.simTimeSeconds !== undefined &&
    next.simTimeSeconds < previous.simTimeSeconds - 1);

// Without wind data, the end the aircraft already points along is the best
// guess at the runway in use; from the ramp the first one is as good as any.
export const likelyActiveRunway = (airport: Airport, aircraft: AircraftState): Runway =>
  airport.runways.reduce((best, runway) =>
    Math.abs(angleDifferenceDegrees(aircraft.trueHeading, runway.trueHeading)) <
    Math.abs(angleDifferenceDegrees(aircraft.trueHeading, best.trueHeading))
      ? runway
      : best,
  );

export const facilityFor = (airport: Airport): Facility => ({
  id: `${airport.icao}-TWR`,
  airportIcao: airport.icao,
  role: "tower",
  frequencyMhz: airport.frequencies?.find((f) => f.type === "tower")?.frequencyMhz ?? 0,
});

// Decides which airport the aircraft is "at". The simulator lists every airport
// including heliports and water fields; only those with a runway count.
export class AirportTracker {
  private listed?: ListedAirport[];
  private readonly usable = new Map<string, Airport>();
  private readonly unusable = new Set<string>();

  constructor(private readonly source: AirportSource) {}

  async nearest(position: GeoPoint): Promise<Airport | undefined> {
    this.listed ??= await this.source.list();

    const byDistance = this.listed
      .map((airport) => ({ airport, distance: distanceNauticalMiles(position, airport.position) }))
      .sort((a, b) => a.distance - b.distance);
    let tried = 0;

    for (const { airport } of byDistance) {
      if (this.unusable.has(airport.icao)) {
        continue;
      }

      const known = this.usable.get(airport.icao);

      if (known) {
        return known;
      }

      if (tried++ >= MAX_CANDIDATES_READ) {
        return undefined;
      }

      const read = await this.source.read(airport.icao, airport.region || undefined);

      if (read.runways.length === 0) {
        this.unusable.add(airport.icao);
        continue;
      }

      this.usable.set(airport.icao, read);

      return read;
    }

    return undefined;
  }

  // The airport to switch to, if the aircraft has left the current one.
  async next(aircraft: AircraftState, current: Airport): Promise<Airport | undefined> {
    const candidate = await this.nearest(aircraft);

    if (!candidate || candidate.icao === current.icao) {
      return undefined;
    }

    const toCurrent = distanceNauticalMiles(aircraft, current.position);
    const toCandidate = distanceNauticalMiles(aircraft, candidate.position);

    if (toCandidate + SWITCH_MARGIN_NM > toCurrent) {
      return undefined;
    }

    if (aircraft.isOnGround) {
      const arrivedAtNeighbor = toCandidate < ARRIVE_NM && toCurrent > NEIGHBOR_MIN_DISTANCE_NM;

      return toCurrent > LEAVE_NM || arrivedAtNeighbor ? candidate : undefined;
    }

    return toCurrent > LEAVE_NM && toCandidate <= AIRBORNE_RANGE_NM ? candidate : undefined;
  }
}
