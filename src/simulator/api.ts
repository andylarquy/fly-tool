import { MsfsAircraftState } from "../adapters/msfs2024/MsfsAircraftState";
import { MsfsConnector } from "../adapters/msfs2024/MsfsConnector";
import { Simulator } from "../constants/Simulators";

export interface SimulatorAPI {
  Connector: {
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    getAppName: () => string | undefined;
  };
  AircraftState: {
    setupListeners: () => void;
    onAircraftStateUpdate: (received: any) => void;
  };
}

type SimulatorAdapter = {
  [K in Simulator]: SimulatorAPI;
};

const MsfsSimAdapter: SimulatorAPI = {
  Connector: { ...MsfsConnector },
  AircraftState: { ...MsfsAircraftState },
};

const simAdapter: SimulatorAdapter = {
  [Simulator.MSFS_2024]: { ...MsfsSimAdapter },
};

export const getSimAdapter = (simulator: Simulator) => simAdapter[simulator];
