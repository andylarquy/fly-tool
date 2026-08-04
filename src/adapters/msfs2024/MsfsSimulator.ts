import { SimulatorAdapter } from "../SimulatorAdapter";
import { AircraftState } from "../../domain/AircraftState";
import {
  open,
  Protocol,
  SimConnectConstants,
  SimConnectDataType,
  SimConnectPeriod,
} from "node-simconnect";

const AIRCRAFT_STATE_DEFINITION_ID = 0;
const AIRCRAFT_STATE_REQUEST_ID = 0;

export class MsfsSimulator implements SimulatorAdapter {
  private handle: Awaited<ReturnType<typeof open>>["handle"] | null = null;

  async connect(): Promise<void> {
    if (this.handle) {
      return;
    }

    const { handle } = await open("Fly Tool Telemetry", Protocol.SunRise);

    this.handle = handle;

    this.setupAircraftStateDefinition();
  }

  disconnect(): void {
    if (!this.handle) {
      return;
    }

    this.handle.close();
    this.handle = null;
  }

  onAircraftStateUpdate(callback: (state: AircraftState) => void): void {
    const handle = this.getHandle();

    handle.on("simObjectData", (received) => {
      if (received.requestID !== AIRCRAFT_STATE_REQUEST_ID) {
        return;
      }

      const data = received.data;

      const state: AircraftState = {
        latitude: data.readFloat64(),
        longitude: data.readFloat64(),
        altitudeFeet: data.readFloat64(),
        trueHeading: data.readFloat64(),
        groundSpeed: data.readFloat64(),
        pitch: data.readFloat64(),
        bank: data.readFloat64(),
        verticalSpeedFeetPerMinute: data.readFloat64(),
        isOnGround: data.readInt32() !== 0,
      };

      callback(state);
    });

    handle.requestDataOnSimObject(
      AIRCRAFT_STATE_REQUEST_ID,
      AIRCRAFT_STATE_DEFINITION_ID,
      SimConnectConstants.OBJECT_ID_USER,
      SimConnectPeriod.SIM_FRAME,
    );
  }

  private setupAircraftStateDefinition(): void {
    const handle = this.getHandle();

    handle.addToDataDefinition(
      AIRCRAFT_STATE_DEFINITION_ID,
      "PLANE LATITUDE",
      "degrees",
      SimConnectDataType.FLOAT64,
    );

    handle.addToDataDefinition(
      AIRCRAFT_STATE_DEFINITION_ID,
      "PLANE LONGITUDE",
      "degrees",
      SimConnectDataType.FLOAT64,
    );

    handle.addToDataDefinition(
      AIRCRAFT_STATE_DEFINITION_ID,
      "PLANE ALTITUDE",
      "feet",
      SimConnectDataType.FLOAT64,
    );

    handle.addToDataDefinition(
      AIRCRAFT_STATE_DEFINITION_ID,
      "PLANE HEADING DEGREES TRUE",
      "degrees",
      SimConnectDataType.FLOAT64,
    );

    handle.addToDataDefinition(
      AIRCRAFT_STATE_DEFINITION_ID,
      "GROUND VELOCITY",
      "knots",
      SimConnectDataType.FLOAT64,
    );

    handle.addToDataDefinition(
      AIRCRAFT_STATE_DEFINITION_ID,
      "PLANE PITCH DEGREES",
      "degrees",
      SimConnectDataType.FLOAT64,
    );

    handle.addToDataDefinition(
      AIRCRAFT_STATE_DEFINITION_ID,
      "PLANE BANK DEGREES",
      "degrees",
      SimConnectDataType.FLOAT64,
    );

    handle.addToDataDefinition(
      AIRCRAFT_STATE_DEFINITION_ID,
      "VERTICAL SPEED",
      "feet per minute",
      SimConnectDataType.FLOAT64,
    );

    handle.addToDataDefinition(
      AIRCRAFT_STATE_DEFINITION_ID,
      "SIM ON GROUND",
      "Bool",
      SimConnectDataType.INT32,
    );
  }

  private getHandle() {
    if (!this.handle) {
      throw new Error("MSFS is not connected.");
    }

    return this.handle;
  }
}
