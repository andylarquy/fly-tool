import { AircraftState } from "../domain/AircraftState";
import { Airport, Runway } from "../domain/Airport";
import { FlightPhase } from "../domain/FlightPhase";
import { RunwayRelativePosition } from "../domain/Situation";
import { holdingShortRunway } from "../taxi/routing";
import { angleDifferenceDegrees, bearingDegrees } from "../utils/geo";

const STATIONARY_MAX_KNOTS = 1;
const TAKEOFF_ROLL_MIN_KNOTS = 30;
const RUNWAY_ALIGNED_DEGREES = 20;
const RUNWAY_END_MARGIN_FEET = 100;
const RUNWAY_SIDE_MARGIN_FEET = 30;

const SECTOR_HALF_WIDTH_DEGREES = 45;
const PATTERN_RADIUS_NAUTICAL_MILES = 3;
const FINAL_LENGTH_FEET = 5 * 6076.12;
const FINAL_HALF_WIDTH_FEET = 1500;
const UPWIND_MIN_CLIMB_FEET_PER_MINUTE = 100;
const INBOUND_OUTBOUND_TOLERANCE_DEGREES = 60;

export interface PhaseInput {
  aircraft: AircraftState;
  airport: Airport;
  runway: Runway;
  geometry: RunwayRelativePosition;
  previousPhase?: FlightPhase;
}

export const isOnRunway = (
  runway: Runway,
  geometry: RunwayRelativePosition,
): boolean =>
  geometry.alongFeet >= -RUNWAY_END_MARGIN_FEET &&
  geometry.alongFeet <= runway.lengthFeet + RUNWAY_END_MARGIN_FEET &&
  Math.abs(geometry.crossFeet) <=
    runway.widthFeet / 2 + RUNWAY_SIDE_MARGIN_FEET;

const classifyOnGround = ({
  aircraft,
  airport,
  runway,
  geometry,
  previousPhase,
}: PhaseInput): FlightPhase => {
  const stationary = aircraft.groundSpeed < STATIONARY_MAX_KNOTS;

  if (!isOnRunway(runway, geometry)) {
    if (!stationary) {
      return FlightPhase.Taxiing;
    }

    return airport.taxi && holdingShortRunway(airport.taxi, aircraft)
      ? FlightPhase.HoldingShort
      : FlightPhase.Stationary;
  }

  const landing =
    previousPhase !== undefined &&
    (previousPhase === FlightPhase.LandingRoll ||
      isAirbornePhase(previousPhase));

  if (landing) {
    return FlightPhase.LandingRoll;
  }

  const aligned =
    Math.abs(geometry.headingOffsetDegrees) <= RUNWAY_ALIGNED_DEGREES;

  if (!aligned) {
    return FlightPhase.Taxiing;
  }

  if (stationary) {
    return FlightPhase.LinedUp;
  }

  const rolling =
    previousPhase === FlightPhase.LinedUp ||
    previousPhase === FlightPhase.TakeoffRoll ||
    aircraft.groundSpeed >= TAKEOFF_ROLL_MIN_KNOTS;

  return rolling ? FlightPhase.TakeoffRoll : FlightPhase.Taxiing;
};

const classifyOutsidePattern = ({
  aircraft,
  airport,
}: PhaseInput): FlightPhase => {
  const bearingToAirport = bearingDegrees(aircraft, airport.position);
  const towardAirport = angleDifferenceDegrees(
    aircraft.trueHeading,
    bearingToAirport,
  );
  const awayFromAirport = angleDifferenceDegrees(
    aircraft.trueHeading,
    bearingToAirport + 180,
  );

  if (Math.abs(towardAirport) <= INBOUND_OUTBOUND_TOLERANCE_DEGREES) {
    return FlightPhase.Inbound;
  }

  if (Math.abs(awayFromAirport) <= INBOUND_OUTBOUND_TOLERANCE_DEGREES) {
    return FlightPhase.Outbound;
  }

  return FlightPhase.Transiting;
};

const classifyAirborne = (input: PhaseInput): FlightPhase => {
  const { aircraft, runway, geometry } = input;
  const { alongFeet, crossFeet, headingOffsetDegrees } = geometry;
  const aligned =
    Math.abs(headingOffsetDegrees) <= SECTOR_HALF_WIDTH_DEGREES;

  const climbing =
    aircraft.verticalSpeedFeetPerMinute >= UPWIND_MIN_CLIMB_FEET_PER_MINUTE;

  const onFinalApproachPath =
    aligned &&
    alongFeet < 0 &&
    -alongFeet <= FINAL_LENGTH_FEET &&
    Math.abs(crossFeet) <= FINAL_HALF_WIDTH_FEET;

  if (onFinalApproachPath && !climbing) {
    return FlightPhase.Final;
  }

  if (geometry.distanceToAirportNauticalMiles > PATTERN_RADIUS_NAUTICAL_MILES) {
    return classifyOutsidePattern(input);
  }

  if (aligned) {
    if (alongFeet < 0 && !onFinalApproachPath) {
      return classifyOutsidePattern(input);
    }

    return !climbing && alongFeet <= runway.lengthFeet
      ? FlightPhase.Final
      : FlightPhase.Upwind;
  }

  // Left traffic turns left onto crosswind and base, so crosswind sits at -90
  // from the runway heading and base at +90; right traffic mirrors that.
  const crosswindOffset = runway.patternSide === "left" ? -90 : 90;

  if (
    Math.abs(headingOffsetDegrees - crosswindOffset) <=
    SECTOR_HALF_WIDTH_DEGREES
  ) {
    return FlightPhase.Crosswind;
  }

  if (
    Math.abs(headingOffsetDegrees + crosswindOffset) <=
    SECTOR_HALF_WIDTH_DEGREES
  ) {
    return FlightPhase.Base;
  }

  return FlightPhase.Downwind;
};

export const isAirbornePhase = (phase: FlightPhase): boolean =>
  ![
    FlightPhase.Stationary,
    FlightPhase.Taxiing,
    FlightPhase.HoldingShort,
    FlightPhase.LinedUp,
    FlightPhase.TakeoffRoll,
    FlightPhase.LandingRoll,
  ].includes(phase);

export const classifyPhase = (input: PhaseInput): FlightPhase =>
  input.aircraft.isOnGround ? classifyOnGround(input) : classifyAirborne(input);
