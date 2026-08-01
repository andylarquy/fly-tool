import { open, Protocol } from "node-simconnect";
import { MsfsState } from "./msfs2024";

const connect = async () => {
  const openEvent = await open("Fly Tool Telemetry", Protocol.SunRise);
  MsfsState.update({
    recvOpen: openEvent.recvOpen,
    handle: openEvent.handle,
  });

  openEvent.handle.on("exception", (exception) =>
    console.error("\nSimConnect exception:", exception),
  );
  openEvent.handle.on("quit", () =>
    console.log("\nMicrosoft Flight Simulator closed the connection."),
  );
  openEvent.handle.on("close", () => console.log("\nConnection closed unexpectedly."));
};

const disconnect = async () => {
  const handle = MsfsState.get("handle");
  handle?.close();
  process.exit(0);
};

const getAppName = () => MsfsState.get("recvOpen")?.applicationName;

export const MsfsConnector = { connect, disconnect, getAppName };
