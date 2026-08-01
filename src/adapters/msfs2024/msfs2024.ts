import { RecvOpen, SimConnectConnection } from "node-simconnect";

type MsfsStateType = {
  recvOpen?: RecvOpen;
  handle?: SimConnectConnection;
  definitionId: number;
  requestId: number;
};

const state: MsfsStateType = {
  definitionId: 0,
  requestId: 0,
};

export const MsfsState = {
  get<K extends keyof MsfsStateType>(key: K): MsfsStateType[K] {
    return state[key];
  },

  set<K extends keyof MsfsStateType>(key: K, value: MsfsStateType[K]): void {
    state[key] = value;
  },

  update(values: Partial<MsfsStateType>): void {
    Object.assign(state, values);
  },

  clear(): void {
    for (const key of Object.keys(state) as (keyof MsfsStateType)[]) {
      delete state[key];
    }
  },
};
