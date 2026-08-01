import {
    open,
    Protocol,
    SimConnectConstants,
    SimConnectDataType,
    SimConnectPeriod,
} from 'node-simconnect';

const definitionId = 0;
const requestId = 0;

async function start(): Promise<void> {
    console.log('Connecting to Microsoft Flight Simulator 2024');

    const { recvOpen, handle } = await open('Fly Tool Telemetry', Protocol.SunRise);
    console.log(`Connected to ${recvOpen.applicationName}. Reading user-aircraft telemetry`);

    handle.addToDataDefinition(definitionId, 'PLANE LATITUDE', 'degrees', SimConnectDataType.FLOAT64);
    handle.addToDataDefinition(definitionId, 'PLANE LONGITUDE', 'degrees', SimConnectDataType.FLOAT64);
    handle.addToDataDefinition(definitionId, 'PLANE ALTITUDE', 'feet', SimConnectDataType.FLOAT64);
    handle.addToDataDefinition(definitionId, 'PLANE HEADING DEGREES TRUE', 'degrees', SimConnectDataType.FLOAT64);
    handle.addToDataDefinition(definitionId, 'GROUND VELOCITY', 'knots', SimConnectDataType.FLOAT64);
    handle.addToDataDefinition(definitionId, 'PLANE PITCH DEGREES', 'degrees', SimConnectDataType.FLOAT64);
    handle.addToDataDefinition(definitionId, 'PLANE BANK DEGREES', 'degrees', SimConnectDataType.FLOAT64);
    handle.addToDataDefinition(definitionId, 'SIM ON GROUND', 'Bool', SimConnectDataType.INT32);

    handle.on('simObjectData', (received) => {
        if (received.requestID !== requestId) {
            return;
        }

        const data = received.data;
        const latitude = data.readFloat64();
        const longitude = data.readFloat64();
        const altitudeFeet = data.readFloat64();
        const trueHeading = data.readFloat64();
        const groundSpeed = data.readFloat64();
        const pitch = data.readFloat64();
        const bank = data.readFloat64();
        const isOnGround = data.readInt32() !== 0;

        process.stdout.write(
            `\rLat ${latitude.toFixed(5)}  Lon ${longitude.toFixed(5)} | ` +
                `Alt ${altitudeFeet.toFixed(0)} ft  GS ${groundSpeed.toFixed(1)} kt | ` +
                `HDG ${trueHeading.toFixed(1)}  Pitch ${pitch.toFixed(1)} | ` +
                `Bank ${bank.toFixed(1)}  Ground: ${isOnGround ? 'yes' : 'no'}`,
        );
    });

    handle.on('exception', (exception) => console.error('\nSimConnect exception:', exception));
    handle.on('quit', () => console.log('\nMicrosoft Flight Simulator closed the connection.'));
    handle.on('close', () => console.log('\nConnection closed unexpectedly.'));

    handle.requestDataOnSimObject(
        requestId,
        definitionId,
        SimConnectConstants.OBJECT_ID_USER,
        SimConnectPeriod.SIM_FRAME,
    );

    const stop = (): void => {
        console.log('\nDisconnecting');
        handle.close();
        process.exit(0);
    };

    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
}

start().catch((error: unknown) => {
    console.error('Unable to connect to Microsoft Flight Simulator:', error);
    process.exitCode = 1;
});