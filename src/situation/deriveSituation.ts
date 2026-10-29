import { AircraftState } from "../domain/AircraftState";
import { Airport } from "../domain/Airport";
import { FlightEvent } from "../domain/FlightEvent";
import { FlightPhase } from "../domain/FlightPhase";
import { RunwayRelativePosition, Situation } from "../domain/Situation";
import {
  angleDifferenceDegrees,
  distanceNauticalMiles,
  runwayOffset,
} from "../utils/geo";
import { holdingShortRunway } from "../taxi/routing";
import { classifyPhase, isOnRunway } from "./classifyPhase";

const PHASE_DWELL_MS = 3000;

export interface SituationInput {
  aircraft: AircraftState;
  airport: Airport;
  runway: string;
  observedAtMs: number;
}

export interface DerivedSituation {
  situation: Situation;
  events: FlightEvent[];
}

const resolvePhase = (
  raw: FlightPhase,
  observedAtMs: number,
  onGround: boolean,
  previous?: Situation,
): Pick<Situation, "phase" | "pendingPhase"> => {
  if (!previous || previous.onGround !== onGround) {
    return { phase: raw };
  }

  if (raw === previous.phase) {
    return { phase: previous.phase };
  }

  if (previous.pendingPhase?.phase !== raw) {
    return {
      phase: previous.phase,
      pendingPhase: { phase: raw, sinceMs: observedAtMs },
    };
  }

  return observedAtMs - previous.pendingPhase.sinceMs >= PHASE_DWELL_MS
    ? { phase: raw }
    : { phase: previous.phase, pendingPhase: previous.pendingPhase };
};

const detectEvents = (
  previous: Situation,
  next: Situation,
  runway: string,
): FlightEvent[] => {
  const atMs = next.observedAtMs;
  const events: FlightEvent[] = [];

  if (previous.phase !== next.phase) {
    events.push({
      type: "phase_changed",
      atMs,
      from: previous.phase,
      to: next.phase,
    });

    if (
      previous.phase === FlightPhase.Final &&
      next.phase === FlightPhase.Upwind
    ) {
      events.push({ type: "go_around", atMs });
    }
  }

  if (!previous.onGround && next.onGround) {
    events.push({
      type: "touchdown",
      atMs,
      runway: next.onRunway ? runway : undefined,
      // The on-ground sample itself reads ~0, so the touchdown rate is the
      // last airborne sample.
      verticalSpeedFeetPerMinute: previous.lastVerticalSpeedFeetPerMinute,
    });
  }

  if (previous.onGround && !next.onGround) {
    events.push({
      type: "lifted_off",
      atMs,
      runway: previous.onRunway ? runway : undefined,
    });
  }

  if (!previous.inAirspace && next.inAirspace) {
    events.push({ type: "entered_airspace", atMs });
  }

  if (previous.inAirspace && !next.inAirspace) {
    events.push({ type: "left_airspace", atMs });
  }

  return events;
};

export const deriveSituation = (
  { aircraft, airport, runway: designator, observedAtMs }: SituationInput,
  previous?: Situation,
): DerivedSituation => {
  const runway = airport.runways.find((r) => r.designator === designator);

  if (!runway) {
    throw new Error(`Runway ${designator} not found at ${airport.icao}`);
  }

  const { alongFeet, crossFeet } = runwayOffset(
    runway.threshold,
    runway.trueHeading,
    aircraft,
  );

  const geometry: RunwayRelativePosition = {
    alongFeet,
    crossFeet,
    headingOffsetDegrees: angleDifferenceDegrees(
      aircraft.trueHeading,
      runway.trueHeading,
    ),
    aglFeet: aircraft.altitudeFeet - airport.elevationFeet,
    distanceToAirportNauticalMiles: distanceNauticalMiles(
      aircraft,
      airport.position,
    ),
  };

  const raw = classifyPhase({
    aircraft,
    airport,
    runway,
    geometry,
    previousPhase: previous?.phase,
  });

  const resolved = resolvePhase(raw, observedAtMs, aircraft.isOnGround, previous);

  const situation: Situation = {
    observedAtMs,
    runway: designator,
    ...resolved,
    geometry,
    onGround: aircraft.isOnGround,
    onRunway: isOnRunway(runway, geometry),
    holdingShortRunway:
      resolved.phase === FlightPhase.HoldingShort && airport.taxi
        ? holdingShortRunway(airport.taxi, aircraft)
        : undefined,
    inAirspace:
      geometry.distanceToAirportNauticalMiles <=
        airport.airspace.radiusNauticalMiles &&
      geometry.aglFeet <= airport.airspace.ceilingFeetAgl,
    lastVerticalSpeedFeetPerMinute: aircraft.verticalSpeedFeetPerMinute,
  };

  return {
    situation,
    events: previous ? detectEvents(previous, situation, designator) : [],
  };
};
