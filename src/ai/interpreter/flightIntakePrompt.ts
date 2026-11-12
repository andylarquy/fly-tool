export const NOT_STATED = "none";

export const FLIGHT_INTAKE_SYSTEM_PROMPT = `You read a pilot's radio transmission to air traffic control and extract the flight plan details they gave. The language may be English or another language.

Return JSON with:

- destination: the place the pilot says they are flying to, in the pilot's own words, only the place itself and not words like "destination", "to" or "going to" in any language (an airport or town name, or an airport code; if the pilot spells a code with letter words such as "Sierra Alpha Echo Zulu", write it as letters: "SAEZ"). A bare airport name or code given together with the flight rules ("Sierra Alpha Echo Zulu, VFR") is the destination. Do not include the aircraft callsign. Use "none" if the pilot did not say where they are going. Runway numbers, taxiways, parking spots, the aircraft callsign and the airport they are leaving are NOT the destination.
- rules: "vfr" if the pilot says VFR or visual flight rules, "ifr" if the pilot says IFR or instrument flight rules, "none" if they did not say.
- scope: "local" if the pilot says they are staying around this airport (a local flight, pattern work, circuits, touch and go, staying in the pattern). "away" if the pilot says they are flying somewhere else. "none" if the pilot says neither: asking for taxi, a runway, a clearance, or parking says nothing about scope.

You also receive the controller's LAST ATC TRANSMISSION. If it asked for the destination, or to confirm which of two airports, then a bare place name in the pilot's reply is the destination.

Judge only what the pilot said. Never guess a destination.`;

export const OPTIONS_PROMPT = `

The controller has just offered the airports listed under OPTIONS to choose between. Add one more field:

- choice: the number of the option the pilot picked, even if they only say part of its name or a nearby town; "none" if the pilot did not pick one. When the pilot picks an option, put its name in destination too. If the pilot instead names a different airport that is not one of the options, put that airport in destination and use "none" for choice.`;

export const buildFlightIntakeSchema = (optionCount: number) => ({
  type: "object",
  properties: {
    destination: { type: "string" },
    rules: { type: "string", enum: ["vfr", "ifr", NOT_STATED] },
    scope: { type: "string", enum: ["local", "away", NOT_STATED] },
    ...(optionCount > 0
      ? {
          choice: {
            type: "string",
            enum: [...Array.from({ length: optionCount }, (_, i) => String(i + 1)), NOT_STATED],
          },
        }
      : {}),
  },
  required: ["destination", "rules", "scope", ...(optionCount > 0 ? ["choice"] : [])],
});
