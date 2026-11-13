import {
  FacilityDataType,
  FacilityListType,
  RecvFacilityData,
  SimConnectConnection,
} from "node-simconnect";
import { Airport } from "../../domain/Airport";
import { GeoPoint } from "../../domain/GeoPoint";
import { distanceFeet, FEET_PER_METER } from "../../utils/geo";
import { parkingNameFromCode, parkingSuffixFromCode } from "./parkingNames";
import { buildFrequencies, RawFrequency } from "./frequencyFacility";
import { buildRunways, RawRunway } from "./runwayFacility";
import {
  buildTaxiNetwork,
  RawAirportTaxiData,
  RawParkingSpot,
  RawTaxiPath,
  RawTaxiPoint,
} from "./taxiFacility";

export interface ListedAirport {
  icao: string;
  region: string;
  position: GeoPoint;
}

const DEFINITION_ID = 1000;
const FIRST_REQUEST_ID = 2000;
const AIRPORT_LIST_REQUEST_ID = 100;
const REQUEST_TIMEOUT_MS = 30_000;

const DEFAULT_PATTERN_ALTITUDE_FEET_AGL = 1000;
const DEFAULT_AIRSPACE = { radiusNauticalMiles: 5, ceilingFeetAgl: 2500 };

// RawBuffer reads strings as Latin-1, but the simulator writes UTF-8.
const utf8 = (text: string): string => Buffer.from(text, "latin1").toString("utf8");

interface Collected {
  header?: { latitude: number; longitude: number; altitudeMeters: number; name: string };
  runways: RawRunway[];
  frequencies: RawFrequency[];
  points: RawTaxiPoint[];
  paths: RawTaxiPath[];
  names: string[];
  parking: RawParkingSpot[];
  leftOver: Map<string, number>;
}

interface Pending {
  collected: Collected;
  done: (collected: Collected) => void;
}

// Each entry of an airport arrives as its own message holding exactly the
// fields of its block of the definition below, in that order, so the reads in
// `receive` must mirror it. An entry with bytes left over means a field has a
// different size than assumed; it is reported as a warning.
export class MsfsFacilityReader {
  private readonly pending = new Map<number, Pending>();
  private readonly exceptions: string[] = [];
  private nextRequestId = FIRST_REQUEST_ID;

  constructor(private readonly connection: SimConnectConnection) {
    this.defineAirport();
    connection.on("facilityData", (data) => this.receive(data));
    connection.on("facilityDataEnd", (end) => {
      const request = this.pending.get(end.userRequestId);

      if (request) {
        this.pending.delete(end.userRequestId);
        request.done(request.collected);
      }
    });
    connection.on("exception", (exception) => {
      this.exceptions.push(JSON.stringify(exception));
    });
  }

  listAirports(): Promise<ListedAirport[]> {
    return new Promise((resolve, reject) => {
      const airports: ListedAirport[] = [];
      const timer = setTimeout(
        () => reject(new Error("Timed out waiting for the airport list.")),
        REQUEST_TIMEOUT_MS,
      );

      const onList = (list: {
        requestID: number;
        entryNumber: number;
        outOf: number;
        airports: { icao: string; region: string; latitude: number; longitude: number }[];
      }): void => {
        if (list.requestID !== AIRPORT_LIST_REQUEST_ID) {
          return;
        }

        for (const airport of list.airports) {
          airports.push({
            icao: airport.icao,
            region: airport.region,
            position: { latitude: airport.latitude, longitude: airport.longitude },
          });
        }

        if (list.entryNumber >= list.outOf - 1) {
          clearTimeout(timer);
          this.connection.off("airportList", onList);
          resolve(airports);
        }
      };

      this.connection.on("airportList", onList);
      this.connection.requestFacilitiesList(FacilityListType.AIRPORT, AIRPORT_LIST_REQUEST_ID);
    });
  }

  async nearestAirport(position: GeoPoint): Promise<ListedAirport> {
    const airports = await this.listAirports();

    if (airports.length === 0) {
      throw new Error("The simulator listed no airports.");
    }

    return airports.reduce((best, airport) =>
      distanceFeet(position, airport.position) < distanceFeet(position, best.position) ? airport : best,
    );
  }

  async readAirport(icao: string, region?: string): Promise<{ airport: Airport; warnings: string[] }> {
    const collected = await this.request(icao, region);
    const { header } = collected;

    if (!header) {
      throw new Error(`No facility data came back for ${icao}.${this.describeExceptions()}`);
    }

    const reference: GeoPoint = { latitude: header.latitude, longitude: header.longitude };
    const runways = buildRunways(collected.runways);
    const taxiData: RawAirportTaxiData = {
      reference,
      points: collected.points,
      paths: collected.paths,
      names: collected.names,
      parking: collected.parking,
    };
    const warnings = [...collected.leftOver].map(
      ([type, bytes]) => `${type}: ${bytes} bytes left over, the field layout is not what was assumed`,
    );

    return {
      warnings,
      airport: {
        icao,
        name: header.name,
        position: reference,
        elevationFeet: header.altitudeMeters * FEET_PER_METER,
        patternAltitudeFeetAgl: DEFAULT_PATTERN_ALTITUDE_FEET_AGL,
        airspace: DEFAULT_AIRSPACE,
        runways,
        taxi: collected.points.length > 0 ? buildTaxiNetwork(taxiData, runways) : undefined,
        frequencies: buildFrequencies(collected.frequencies),
      },
    };
  }

  private request(icao: string, region?: string): Promise<Collected> {
    return new Promise((resolve, reject) => {
      const requestId = this.nextRequestId++;
      const collected: Collected = {
        runways: [],
        frequencies: [],
        points: [],
        paths: [],
        names: [],
        parking: [],
        leftOver: new Map(),
      };
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Timed out reading facility data for ${icao}.${this.describeExceptions()}`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(requestId, {
        collected,
        done: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
      });
      this.connection.requestFacilityData(DEFINITION_ID, requestId, icao, region);
    });
  }

  private describeExceptions(): string {
    return this.exceptions.length > 0 ? ` SimConnect reported: ${this.exceptions.join("; ")}` : "";
  }

  private defineAirport(): void {
    const block = (name: string, fields: string[]): void => {
      this.connection.addToFacilityDefinition(DEFINITION_ID, `OPEN ${name}`);
      fields.forEach((field) => this.connection.addToFacilityDefinition(DEFINITION_ID, field));
      this.connection.addToFacilityDefinition(DEFINITION_ID, `CLOSE ${name}`);
    };

    this.connection.addToFacilityDefinition(DEFINITION_ID, "OPEN AIRPORT");
    ["LATITUDE", "LONGITUDE", "ALTITUDE", "NAME"].forEach((field) =>
      this.connection.addToFacilityDefinition(DEFINITION_ID, field),
    );
    block("RUNWAY", [
      "LATITUDE",
      "LONGITUDE",
      "ALTITUDE",
      "HEADING",
      "LENGTH",
      "WIDTH",
      "PRIMARY_NUMBER",
      "PRIMARY_DESIGNATOR",
      "SECONDARY_NUMBER",
      "SECONDARY_DESIGNATOR",
    ]);
    block("FREQUENCY", ["TYPE", "FREQUENCY", "NAME"]);
    block("TAXI_POINT", ["TYPE", "ORIENTATION", "BIAS_X", "BIAS_Z"]);
    block("TAXI_PARKING", ["NAME", "SUFFIX", "NUMBER", "BIAS_X", "BIAS_Z"]);
    block("TAXI_PATH", ["TYPE", "START", "END", "NAME_INDEX", "RUNWAY_NUMBER", "RUNWAY_DESIGNATOR"]);
    block("TAXI_NAME", ["NAME"]);
    this.connection.addToFacilityDefinition(DEFINITION_ID, "CLOSE AIRPORT");
  }

  private receive(message: RecvFacilityData): void {
    const request = this.pending.get(message.userRequestId);

    if (!request) {
      return;
    }

    const { collected } = request;
    const { data } = message;

    switch (message.type) {
      case FacilityDataType.AIRPORT: {
        const latitude = data.readFloat64();
        const longitude = data.readFloat64();
        const altitudeMeters = data.readFloat64();

        collected.header = { latitude, longitude, altitudeMeters, name: utf8(data.readString32()) };
        break;
      }
      case FacilityDataType.RUNWAY: {
        const centerLatitude = data.readFloat64();
        const centerLongitude = data.readFloat64();

        data.readFloat64();
        collected.runways.push({
          centerLatitude,
          centerLongitude,
          headingDegrees: data.readFloat32(),
          lengthMeters: data.readFloat32(),
          widthMeters: data.readFloat32(),
          primaryNumber: data.readInt32(),
          primaryDesignator: data.readInt32(),
          secondaryNumber: data.readInt32(),
          secondaryDesignator: data.readInt32(),
        });
        break;
      }
      case FacilityDataType.FREQUENCY:
        collected.frequencies.push({
          type: data.readInt32(),
          frequencyHz: data.readInt32(),
          name: utf8(data.readString64()),
        });
        break;
      case FacilityDataType.TAXI_POINT: {
        const type = data.readInt32();

        data.readInt32();
        collected.points.push({ type, biasXMeters: data.readFloat32(), biasZMeters: data.readFloat32() });
        break;
      }
      case FacilityDataType.TAXI_PARKING:
        collected.parking.push({
          name: parkingNameFromCode(data.readInt32()),
          suffix: parkingSuffixFromCode(data.readInt32()),
          number: data.readInt32(),
          biasXMeters: data.readFloat32(),
          biasZMeters: data.readFloat32(),
        });
        break;
      case FacilityDataType.TAXI_PATH:
        collected.paths.push({
          type: data.readInt32(),
          start: data.readInt32(),
          end: data.readInt32(),
          nameIndex: data.readInt32(),
          runwayNumber: data.readInt32(),
          runwayDesignator: data.readInt32(),
        });
        break;
      case FacilityDataType.TAXI_NAME:
        collected.names.push(utf8(data.readString32()));
        break;
      default:
        return;
    }

    if (data.remaining() > 0) {
      collected.leftOver.set(FacilityDataType[message.type], data.remaining());
    }
  }
}
