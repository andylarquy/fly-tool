import { AircraftState } from "../../domain/AircraftState";
import { AtcIntent } from "../../domain/AtcIntent";
import { FlightPhase } from "../../domain/FlightPhase";
import { PilotMessage } from "../../domain/PilotMessage";
import { Situation } from "../../domain/Situation";
import { isAirbornePhase } from "../../situation/classifyPhase";
import { labAirport } from "../airports";

export const msg = (
  type: PilotMessage["type"],
  runway: string | null,
  subject: PilotMessage["subject"],
  emergency?: PilotMessage["emergency"],
): PilotMessage => ({ type, runway, subject, emergency });

export const label = (intent: AtcIntent): string => {
  switch (intent.type) {
    case "issue_clearance":
      return `issue_clearance:${intent.clearance}`;
    case "instruct":
      return `instruct:${intent.instruction}`;
    case "query":
      return `query:${intent.query}`;
    case "emergency_response":
      return intent.ask.length > 0
        ? `emergency_response:${intent.ask.join("+")}`
        : "emergency_response";
    case "advise":
      return `advise:${intent.topic}`;
    case "unable":
      return `unable:${intent.reason}`;
    case "acknowledge":
      return `acknowledge:${intent.kind}`;
    case "remark":
      return `remark:${intent.remark.kind}`;
    default:
      return intent.type;
  }
};

export const aircraftIn = (phase: FlightPhase): AircraftState => ({
  latitude: labAirport.position.latitude,
  longitude: labAirport.position.longitude,
  altitudeFeet: 500,
  trueHeading: 224,
  groundSpeed: 70,
  pitch: 0,
  bank: 0,
  verticalSpeedFeetPerMinute: 0,
  isOnGround: !isAirbornePhase(phase),
});

export const situationIn = (phase: FlightPhase, atMs: number): Situation => ({
  observedAtMs: atMs,
  runway: "23",
  phase,
  geometry: {
    alongFeet: 0,
    crossFeet: 0,
    headingOffsetDegrees: 0,
    aglFeet: 0,
    distanceToAirportNauticalMiles: 1,
  },
  onGround: !isAirbornePhase(phase),
  onRunway: phase === FlightPhase.LinedUp || phase === FlightPhase.LandingRoll,
  inAirspace: true,
  lastVerticalSpeedFeetPerMinute: 0,
});
