import { AircraftState } from "../../domain/AircraftState";
import { AtcIntent } from "../../domain/AtcIntent";
import { FlightPhase } from "../../domain/FlightPhase";
import { PilotMessage } from "../../domain/PilotMessage";
import { Situation } from "../../domain/Situation";
import { isAirbornePhase } from "../../situation/classifyPhase";
import { pointFromRunwayFrame } from "../../utils/geo";
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
    case "taxi_instruction": {
      const where =
        intent.destination.kind === "runway"
          ? `runway ${intent.destination.runway}`
          : intent.destination.name;

      const legs = intent.legs
        .map((leg) => (leg.kind === "taxiway" ? leg.name : `x${leg.runway}`))
        .join("+");
      const cross = intent.crossFirst ? `:cross ${intent.crossFirst}` : "";
      const hold = intent.holdShort ? `:hold ${intent.holdShort}` : "";

      return `taxi_instruction:${intent.reason}:${where}:${legs || "-"}${hold}${cross}`;
    }
    case "acknowledge":
      return `acknowledge:${intent.kind}`;
    case "remark":
      return `remark:${intent.remark.kind}`;
    default:
      return intent.type;
  }
};

const labRunway = labAirport.runways[0];

// The airport's center is on a taxi path across the runway, so a generic
// ground position for the stage lab has to be somewhere off the network.
const OFF_THE_NETWORK = pointFromRunwayFrame(
  labRunway.threshold,
  labRunway.trueHeading,
  2500,
  -1500,
);

export const aircraftIn = (phase: FlightPhase): AircraftState => ({
  latitude: OFF_THE_NETWORK.latitude,
  longitude: OFF_THE_NETWORK.longitude,
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
