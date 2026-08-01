import {
  SimConnectConstants,
  SimConnectDataType,
  SimConnectPeriod,
} from "node-simconnect";
import { MsfsState } from "./msfs2024";

const setupListeners = () => {
  const handle = MsfsState.get("handle");

  if (!handle) {
    throw Error("Connection with SimConnect could not be established");
  }

  const definitionId = MsfsState.get("definitionId");

  handle.addToDataDefinition(
    definitionId,
    "PLANE LATITUDE",
    "degrees",
    SimConnectDataType.FLOAT64,
  );
  handle.addToDataDefinition(
    definitionId,
    "PLANE LONGITUDE",
    "degrees",
    SimConnectDataType.FLOAT64,
  );
  handle.addToDataDefinition(
    definitionId,
    "PLANE ALTITUDE",
    "feet",
    SimConnectDataType.FLOAT64,
  );
  handle.addToDataDefinition(
    definitionId,
    "PLANE HEADING DEGREES TRUE",
    "degrees",
    SimConnectDataType.FLOAT64,
  );
  handle.addToDataDefinition(
    definitionId,
    "GROUND VELOCITY",
    "knots",
    SimConnectDataType.FLOAT64,
  );
  handle.addToDataDefinition(
    definitionId,
    "PLANE PITCH DEGREES",
    "degrees",
    SimConnectDataType.FLOAT64,
  );
  handle.addToDataDefinition(
    definitionId,
    "PLANE BANK DEGREES",
    "degrees",
    SimConnectDataType.FLOAT64,
  );
  handle.addToDataDefinition(
    definitionId,
    "SIM ON GROUND",
    "Bool",
    SimConnectDataType.INT32,
  );
};

const onAircraftStateUpdate = (callback: (_received: any) => void) => {
  const handle = MsfsState.get("handle");

  if (!handle) {
    throw new Error("Connection with SimConnect could not be established");
  }

  const requestId = MsfsState.get("requestId");
  const definitionId = MsfsState.get("definitionId");

  handle.on("simObjectData", (received) => {
    if (received.requestID !== requestId) {
      return;
    }

    callback(received);
  });

  handle.requestDataOnSimObject(
    requestId,
    definitionId,
    SimConnectConstants.OBJECT_ID_USER,
    SimConnectPeriod.SIM_FRAME,
  );
};

export const MsfsAircraftState = { onAircraftStateUpdate, setupListeners };
