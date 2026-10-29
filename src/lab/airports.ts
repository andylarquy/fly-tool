import { Airport } from "../domain/Airport";
import { TaxiNetwork } from "../domain/TaxiNetwork";
import { pointFromRunwayFrame } from "../utils/geo";
import { Facility } from "../domain/Facility";

const RUNWAY_23_THRESHOLD = {
  latitude: -34.450169564238806,
  longitude: -58.585754419918246,
};
const RUNWAY_23_HEADING = 224;

const inRunway23Frame = (alongFeet: number, crossFeet: number) =>
  pointFromRunwayFrame(RUNWAY_23_THRESHOLD, RUNWAY_23_HEADING, alongFeet, crossFeet);

/*
 * Taxiway A runs parallel to the runway, 350 ft to its right. B connects it
 * to the hold line of runway 23, D to the hold line of runway 05 at the far
 * end, and C to the ramp. The two ramp spots are joined by an unnamed apron
 * path.
 */
export const labTaxiNetwork: TaxiNetwork = {
  points: [
    { id: 0, position: inRunway23Frame(2500, 900) },
    { id: 1, position: inRunway23Frame(2500, 600) },
    { id: 2, position: inRunway23Frame(2500, 350) },
    { id: 3, position: inRunway23Frame(1000, 350) },
    { id: 4, position: inRunway23Frame(0, 350) },
    { id: 5, position: inRunway23Frame(0, 150), holdShortRunway: "23" },
    { id: 6, position: inRunway23Frame(4000, 350) },
    { id: 7, position: inRunway23Frame(5000, 350) },
    { id: 8, position: inRunway23Frame(5000, 150), holdShortRunway: "05" },
    { id: 9, position: inRunway23Frame(2800, 600) },
    { id: 10, position: inRunway23Frame(2800, 900) },
  ],
  segments: [
    { from: 0, to: 1, taxiway: "C" },
    { from: 1, to: 2, taxiway: "C" },
    { from: 2, to: 3, taxiway: "A" },
    { from: 3, to: 4, taxiway: "A" },
    { from: 4, to: 5, taxiway: "B" },
    { from: 2, to: 6, taxiway: "A" },
    { from: 6, to: 7, taxiway: "A" },
    { from: 7, to: 8, taxiway: "D" },
    { from: 1, to: 9 },
    { from: 9, to: 10 },
  ],
  parking: [
    { id: 1, name: "Ramp 1", position: inRunway23Frame(2500, 900), pointId: 0 },
    { id: 2, name: "Ramp 2", position: inRunway23Frame(2800, 900), pointId: 10 },
  ],
};

export const labAirport: Airport = {
  icao: "ZZZZ",
  name: "Lab Field",
  position: { latitude: -34.4551, longitude: -58.5915 },
  elevationFeet: 13,
  patternAltitudeFeetAgl: 1000,
  airspace: { radiusNauticalMiles: 5, ceilingFeetAgl: 2500 },
  runways: [
    {
      designator: "23",
      trueHeading: 224,
      threshold: { latitude: -34.450169564238806, longitude: -58.585754419918246 },
      lengthFeet: 5000,
      widthFeet: 100,
      patternSide: "left",
    },
    {
      designator: "05",
      trueHeading: 44,
      threshold: { latitude: -34.46003523235621, longitude: -58.59730784146983 },
      lengthFeet: 5000,
      widthFeet: 100,
      patternSide: "right",
    },
  ],
  taxi: labTaxiNetwork,
};

export const labTower: Facility = {
  id: "ZZZZ-TWR",
  airportIcao: "ZZZZ",
  role: "tower",
  frequencyMhz: 118.1,
};
