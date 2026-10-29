import { Airport } from "../domain/Airport";
import { Facility } from "../domain/Facility";

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
};

export const labTower: Facility = {
  id: "ZZZZ-TWR",
  airportIcao: "ZZZZ",
  role: "tower",
  frequencyMhz: 118.1,
};
