import { PilotMessage } from "../../domain/PilotMessage";

export interface ClassificationSample {
  pilot: string;
  lastAtc?: string;
  expected: PilotMessage;
}

const msg = (
  type: PilotMessage["type"],
  runway: string | null,
  subject: PilotMessage["subject"],
): PilotMessage => ({ type, runway, subject });

export const samples: ClassificationSample[] = [
  {
    pilot: "Tower, holding short runway 23, ready for departure, LV-INQ.",
    expected: msg("request", "23", "takeoff"),
  },
  {
    pilot: "Tower, lined up runway 23, ready for departure, LV-INQ.",
    lastAtc: "LV-INQ, line up and wait runway 23.",
    expected: msg("request", "23", "takeoff"),
  },
  {
    pilot: "Tower, LV-INQ, ready for departure runway 23.",
    lastAtc: "LV-INQ, hold short runway 23.",
    expected: msg("request", "23", "takeoff"),
  },
  {
    pilot: "Tower, five miles south, request pattern entry runway 23, LV-INQ.",
    expected: msg("request", "23", "pattern_entry"),
  },
  {
    pilot: "LV-INQ, request line up and wait runway 23.",
    expected: msg("request", "23", "line_up"),
  },
  {
    pilot: "Tower, LV-INQ, request full stop landing runway 23.",
    expected: msg("request", "23", "landing"),
  },
  {
    pilot: "Tower, LV-INQ, request touch and go runway 23.",
    expected: msg("request", "23", "landing"),
  },
  {
    pilot: "Tower, request left traffic runway 5, LV-INQ.",
    expected: msg("request", "05", "pattern_entry"),
  },
  {
    pilot: "Tower, requesting climb to 3000 feet, LV-INQ.",
    expected: msg("request", null, "altitude"),
  },
  {
    pilot: "Cleared for takeoff runway 23, LV-INQ.",
    lastAtc: "LV-INQ, cleared for takeoff runway 23.",
    expected: msg("readback", "23", "takeoff"),
  },
  {
    pilot: "Roger, we're cleared for takeoff on runway 23, LV-INQ.",
    lastAtc: "LV-INQ, cleared for takeoff runway 23.",
    expected: msg("readback", "23", "takeoff"),
  },
  {
    pilot: "Wilco, cleared for takeoff runway 23, LV-INQ.",
    lastAtc: "LV-INQ, cleared for takeoff runway 23.",
    expected: msg("readback", "23", "takeoff"),
  },
  {
    pilot: "Cleared for takeoff runway 05, LV-INQ.",
    lastAtc: "LV-INQ, cleared for takeoff runway 23.",
    expected: msg("readback", "05", "takeoff"),
  },
  {
    pilot: "Cleared to land runway 23, LV-INQ.",
    lastAtc: "LV-INQ, cleared to land runway 23.",
    expected: msg("readback", "23", "landing"),
  },
  {
    pilot: "Climb and maintain 1000, report downwind, LV-INQ.",
    lastAtc: "LV-INQ, climb and maintain 1000 feet, report downwind.",
    expected: msg("readback", null, "altitude"),
  },
  {
    pilot: "Hold short runway 23, LV-INQ.",
    lastAtc: "LV-INQ, hold short runway 23.",
    expected: msg("readback", "23", "hold_short"),
  },
  {
    pilot: "Wilco, LV-INQ.",
    lastAtc: "LV-INQ, report downwind.",
    expected: msg("readback", null, "other"),
  },
  {
    pilot: "Roger.",
    lastAtc: "LV-INQ, wind two three zero at eight knots.",
    expected: msg("readback", null, "other"),
  },
  {
    pilot: "Tower, downwind, LV-INQ.",
    expected: msg("position_report", null, "downwind"),
  },
  {
    pilot: "Tower, currently downwind runway 23, LV-INQ.",
    expected: msg("position_report", "23", "downwind"),
  },
  {
    pilot: "Downwind at 1000 feet, LV-INQ.",
    lastAtc: "LV-INQ, climb and maintain 1000 feet, report downwind.",
    expected: msg("position_report", null, "downwind"),
  },
  {
    pilot: "Tower, turning crosswind, LV-INQ.",
    expected: msg("position_report", null, "crosswind"),
  },
  {
    pilot: "Tower, LV-INQ, turning base runway 23.",
    expected: msg("position_report", "23", "base"),
  },
  {
    pilot: "Tower, final runway 23, full stop, LV-INQ.",
    expected: msg("position_report", "23", "final"),
  },
  {
    pilot: "Tower, short final, LV-INQ.",
    lastAtc: "LV-INQ, cleared to land runway 23.",
    expected: msg("position_report", null, "final"),
  },
  {
    pilot: "Tower, going around, LV-INQ.",
    expected: msg("position_report", null, "go_around"),
  },
  {
    pilot: "Tower, airborne, initial climb, LV-INQ.",
    expected: msg("position_report", null, "airborne"),
  },
  {
    pilot: "Currently climbing through 700 feet, LV-INQ.",
    lastAtc: "LV-INQ, cleared for takeoff runway 23, maintain runway heading, climb and maintain 1000 feet.",
    expected: msg("position_report", null, "altitude"),
  },
  {
    pilot: "Tower, what is my current heading?",
    expected: msg("question", null, "heading"),
  },
  {
    pilot: "Tower, confirm we're airborne.",
    expected: msg("question", null, "airborne"),
  },
  {
    pilot: "Tower, LV-INQ, which runway is active?",
    expected: msg("question", null, "other"),
  },
  {
    pilot: "Tower, can you say the wind?",
    expected: msg("question", null, "weather"),
  },
  {
    pilot: "MAYDAY MAYDAY MAYDAY, LV-INQ, engine failure, 700 feet.",
    expected: msg("emergency", null, "other"),
  },
  {
    pilot: "Pan-pan pan-pan pan-pan, LV-INQ, rough running engine, returning to the field.",
    expected: msg("emergency", null, "other"),
  },
  {
    pilot: "Tower, LV-INQ, we have smoke in the cockpit, declaring an emergency.",
    expected: msg("emergency", null, "other"),
  },
  {
    pilot: "Good morning, tower.",
    expected: msg("other", null, "other"),
  },
  {
    pilot: "Requesting clearance to land on 05, LV-INQ.",
    expected: msg("request", "05", "landing"),
  },
  {
    pilot: "Tower, LV-INQ, ready for departure zero five.",
    expected: msg("request", "05", "takeoff"),
  },
  {
    pilot: "Cleared to land two three, LV-INQ.",
    lastAtc: "LV-INQ, cleared to land runway 23.",
    expected: msg("readback", "23", "landing"),
  },
  {
    pilot: "Line up and wait 05, LV-INQ.",
    lastAtc: "LV-INQ, line up and wait runway 05.",
    expected: msg("readback", "05", "line_up"),
  },
  {
    pilot: "Tower, LV-INQ, downwind for 23.",
    expected: msg("position_report", "23", "downwind"),
  },
  {
    pilot: "Torre, LV-INQ, solicito autorización para aterrizar pista 05.",
    expected: msg("request", "05", "landing"),
  },
  {
    pilot: "Torre, LV-INQ, listo para la salida pista 23.",
    expected: msg("request", "23", "takeoff"),
  },
  {
    pilot: "Autorizado a despegar pista 23, LV-INQ.",
    lastAtc: "LV-INQ, autorizado a despegar pista 23.",
    expected: msg("readback", "23", "takeoff"),
  },
  {
    pilot: "Thanks, tower.",
    lastAtc: "LV-INQ, wind two three zero at eight knots.",
    expected: msg("other", null, "other"),
  },
];
