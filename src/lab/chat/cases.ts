import { AircraftState } from "../../domain/AircraftState";
import { AtcState } from "../../domain/SingleCallContext";

export interface LabCase {
  name: string;
  aircraftState: AircraftState;
  atcState: AtcState;
}

export const cases: LabCase[] = [
  {
    name: "On ground, stationary",
    aircraftState: {
      latitude: -34.450169564238806,
      longitude: -58.585754419918246,
      altitudeFeet: 13,
      trueHeading: 224,
      groundSpeed: 0,
      pitch: -0.13830090636339298,
      bank: -0.16137975025545245,
      verticalSpeedFeetPerMinute: 0,
      isOnGround: true,
    },
    atcState: {
      situationContext: `
Active runway is 23.
Pilot intention is performing a traffic pattern for runway 23.
Aircraft is lined up and waiting for takeoff clearance.
`,
    },
  },
  {
    name: "Climbing, 694 ft",
    aircraftState: {
      latitude: -34.466053600241985,
      longitude: -58.60380201309368,
      altitudeFeet: 694,
      trueHeading: 223,
      groundSpeed: 60,
      pitch: -7.184934695847636,
      bank: 1.4493565442989484,
      verticalSpeedFeetPerMinute: 789,
      isOnGround: false,
    },
    atcState: {
      situationContext: `
Active runway is 23.
Pilot intention is performing a traffic pattern for runway 23.
Aircraft just tookoff and is currently climbing.
`,
    },
  },
  {
    name: "Airborne, 1056 ft, on downwind",
    aircraftState: {
      latitude: -34.44601906163748,
      longitude: -58.56284715153178,
      altitudeFeet: 1056,
      trueHeading: 323,
      groundSpeed: 75,
      pitch: 1.1911054611925342,
      bank: -1.367722324568578,
      verticalSpeedFeetPerMinute: -98,
      isOnGround: false,
    },
    atcState: {
      situationContext: `
Active runway is 23.
Pilot intention is performing a traffic pattern for runway 23.
Aircraft is currently on the downind leg of the traffic pattern.
`,
    },
  },
];
