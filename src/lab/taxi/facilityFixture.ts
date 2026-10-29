import { FEET_PER_METER, localOffset, pointFromRunwayFrame } from "../../utils/geo";
import { RawAirportTaxiData } from "../../adapters/msfs2024/taxiFacility";
import { labAirport } from "../airports";

const runway23 = labAirport.runways[0];

// Offsets are given from the airport reference point, in meters, the way the
// facility data reports them. Positions here are described in the runway-23
// frame and converted, so the fixture reads like a map.
const biasOf = (alongFeet: number, crossFeet: number) => {
  const { northFeet, eastFeet } = localOffset(
    labAirport.position,
    pointFromRunwayFrame(runway23.threshold, runway23.trueHeading, alongFeet, crossFeet),
  );

  return { biasXMeters: eastFeet / FEET_PER_METER, biasZMeters: northFeet / FEET_PER_METER };
};

const point = (type: number, alongFeet: number, crossFeet: number) => ({
  type,
  ...biasOf(alongFeet, crossFeet),
});

const path = (
  type: number,
  start: number,
  end: number,
  nameIndex = -1,
  runwayNumber = 0,
  runwayDesignator = 0,
) => ({ type, start, end, nameIndex, runwayNumber, runwayDesignator });

const PARKING_INDEX = 6;

export const labFacilityData: RawAirportTaxiData = {
  reference: labAirport.position,
  points: [
    point(1, 2500, 900),
    point(1, 2500, 600),
    point(1, 2500, 350),
    point(1, 1000, 350),
    point(1, 0, 350),
    point(2, 0, 150),
    point(1, 5000, 350),
    point(4, 5000, 150),
    point(5, 2500, 150),
    point(6, 2500, -150),
  ],
  names: ["A", "B", "C", "D", "E"],
  paths: [
    path(1, 0, 1, 2),
    path(1, 1, 2, 2),
    path(1, 2, 3, 0),
    path(1, 3, 4, 0),
    path(1, 4, 5, 1),
    path(1, 2, 6, 0),
    path(1, 6, 7, 3),
    path(1, 2, 8, 4),
    path(2, 8, 9, -1, 23, 0),
    // Paths that would shorten the route if they were taxiable.
    path(5, 1, 5, 2),
    path(6, 0, 2, 2),
    path(7, 3, 5, 0),
    path(8, 2, 5, 0),
    // Parking: END is a parking index. Read as a taxi point it would be the far
    // end of taxiway A.
    path(3, 0, PARKING_INDEX),
    // References that do not exist.
    path(1, 99, 2, 0),
    path(1, 4, 4, 0),
  ],
  parking: [
    ...Array.from({ length: PARKING_INDEX }, (_, number) => ({
      name: "Unused",
      number,
      suffix: "",
      ...biasOf(3000 + number * 50, 900),
    })),
    { name: "Ramp", number: 1, suffix: "", ...biasOf(2500, 950) },
  ],
};
