import { AirportEntry } from "../../domain/AirportEntry";
import { AirportDirectory } from "../../directory/airportDirectory";
import {
  buildEntries,
  directoryFilesExist,
  loadOurAirports,
} from "../../directory/ourAirports";
import { editDistance, normalize, significantTokens, tokenSimilarity } from "../../directory/textMatch";
import { parseCsv } from "../../utils/csv";

const failures: string[] = [];

const check = (name: string, ok: boolean, detail = ""): void => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);

  if (!ok) {
    failures.push(name);
    if (detail) console.log(`  ${detail}`);
  }
};

const entry = (
  id: string,
  name: string,
  country: string,
  latitude: number,
  longitude: number,
  extra: Partial<AirportEntry> = {},
): AirportEntry => ({
  id,
  codes: [id],
  name,
  country,
  type: "medium",
  position: { latitude, longitude },
  aliases: [name],
  frequencies: [],
  ...extra,
});

const BUENOS_AIRES = { latitude: -34.45, longitude: -58.59 };

const fixture = new AirportDirectory([
  entry("SAEZ", "Ezeiza International Airport - Ministro Pistarini", "AR", -34.82, -58.54, {
    type: "large",
    iata: "EZE",
    codes: ["SAEZ", "EZE"],
    aliases: ["Ezeiza International Airport - Ministro Pistarini", "Buenos Aires", "Ezeiza"],
  }),
  entry("SABE", "Aeroparque Jorge Newbery", "AR", -34.56, -58.42, {
    type: "large",
    codes: ["SABE", "AEP"],
    aliases: ["Aeroparque Jorge Newbery", "Buenos Aires"],
  }),
  entry("SADP", "El Palomar Airport", "AR", -34.61, -58.6, { aliases: ["El Palomar Airport", "El Palomar"] }),
  entry("SADM", "Morón Airport", "AR", -34.68, -58.64, { type: "small", aliases: ["Morón Airport", "Morón"] }),
  entry("LEMO", "Morón Air Base", "ES", 37.17, -5.62, { aliases: ["Morón Air Base", "Morón de la Frontera"] }),
  entry("SACO", "Ingeniero Aeronáutico Ambrosio L.V. Taravella International Airport", "AR", -31.32, -64.21, {
    type: "large",
    aliases: ["Ingeniero Aeronáutico Ambrosio L.V. Taravella International Airport", "Cordoba"],
  }),
  entry("AR-0038", "Alvear Airpark", "AR", -33.1, -60.6, { type: "small", aliases: ["Alvear Airpark", "Aeroparque Rosario"] }),
  entry("LEBA", "Córdoba Airport", "ES", 37.84, -4.85, { aliases: ["Córdoba Airport", "Cordoba"] }),
]);

const top = (spoken: string, near?: { latitude: number; longitude: number }) =>
  fixture.shortlist(spoken, { near }).candidates[0]?.airport.id;

function runCsv(): void {
  const rows = parseCsv('"a","b","c"\r\n"x, y","say ""hi""","line\nbreak"\n,"",z\n');

  check("A quoted comma stays inside its field", rows[0].a === "x, y");
  check("A doubled quote is one quote", rows[0].b === 'say "hi"');
  check("A line break inside quotes is kept", rows[0].c === "line\nbreak");
  check("Empty fields and a missing final newline parse", rows[1].a === "" && rows[1].b === "" && rows[1].c === "z");
  check("CRLF line endings are handled", rows.length === 2);
}

function runText(): void {
  check("Accents and case are ignored", normalize("Morón AIRPORT") === "moron airport");
  check("Generic words are dropped", significantTokens("Aeropuerto Internacional de Ezeiza").join() === "ezeiza");
  check("A name made only of generic words keeps its words", significantTokens("Airport").join() === "airport");
  check("A one-letter slip still matches a long word", tokenSimilarity("eseiza", "ezeiza") > 0.8);
  check("Short words must match exactly", tokenSimilarity("eze", "ese") === 0);
  check("Edit distance gives up past its limit", editDistance("abcdefgh", "zzzzzzzz", 2) === 3);
}

function runShortlist(): void {
  check("A name finds its airport", top("Ezeiza") === "SAEZ");
  check("The official name finds it too", top("Ministro Pistarini") === "SAEZ");
  check("'Airport' and 'aeropuerto de' are ignored", top("aeropuerto de Ezeiza") === "SAEZ" && top("Ezeiza airport") === "SAEZ");
  check("A nickname that is in the data resolves", top("Aeroparque") === "SABE");
  check("A typo resolves", top("Eseiza") === "SAEZ");
  check("IATA and ICAO codes resolve", top("EZE") === "SAEZ" && top("sabe") === "SABE" && top("AEP") === "SABE");
  check("Codes are matched exactly, not fuzzily", fixture.shortlist("EZA").candidates.length === 0);

  check("Accents are optional", top("Moron", BUENOS_AIRES) === "SADM" && top("Cordoba", BUENOS_AIRES) === "SACO");
  check(
    "The same name resolves to the nearer airport",
    top("Moron", BUENOS_AIRES) === "SADM" && top("Moron", { latitude: 37, longitude: -5.6 }) === "LEMO",
  );

  check("A city with several airports is not confident", !fixture.shortlist("Buenos Aires", { near: BUENOS_AIRES }).confident);
  check("A clear match is confident", fixture.shortlist("Ezeiza", { near: BUENOS_AIRES }).confident);
  check("Every query word has to match", fixture.shortlist("Ezeiza Madrid").candidates.length === 0);
  check("Nonsense finds nothing", fixture.shortlist("Xyzzy Plugh").candidates.length === 0);
  check("An empty query finds nothing", fixture.shortlist("   ").candidates.length === 0);
  check("A country filter is respected", fixture.shortlist("Cordoba", { countries: ["ES"] }).candidates[0]?.airport.id === "LEBA");
  check("Lookup by code is exact", fixture.byCode("aep")?.id === "SABE" && fixture.byCode("AEE") === undefined);
}

function runLoader(): void {
  const entries = buildEntries(
    '"id","ident","type","name","latitude_deg","longitude_deg","elevation_ft","continent","iso_country","iso_region","municipality","scheduled_service","icao_code","iata_code","gps_code","local_code","home_link","wikipedia_link","keywords"\n' +
      '1,"SAEZ","large_airport","Ezeiza International Airport - Ministro Pistarini",-34.82,-58.54,67,"SA","AR","AR-B","Buenos Aires (Ezeiza)","yes","SAEZ","EZE","SAEZ",,,,"BUE, Ezeiza International Airport"\n' +
      '2,"CLOSED1","closed","Gone",1,1,0,"SA","AR","AR-B","X","no",,,,,,,\n' +
      '3,"HELI","heliport","Pad",2,2,0,"SA","AR","AR-B","Y","no",,,,,,,\n' +
      '4,"BAD","small_airport","No position",,,0,"SA","AR","AR-B","Z","no",,,,,,,\n',
    '"id","airport_ref","airport_ident","type","description","frequency_mhz"\n' +
      '1,1,"SAEZ","TWR","EZEIZA TWR",118.6\n' +
      '2,1,"SAEZ","APP","EZEIZA APP",119.9\n' +
      '3,1,"SAEZ","RDO","odd",0\n',
  );

  const saez = entries.find((e) => e.id === "SAEZ");

  check("Closed airports and rows with no position are dropped", entries.map((e) => e.id).join() === "SAEZ,HELI");
  check(
    "The municipality gives both of its names",
    saez?.aliases.includes("Buenos Aires") === true && saez.aliases.includes("Ezeiza"),
    JSON.stringify(saez?.aliases),
  );
  check("Keywords become aliases", saez?.aliases.includes("BUE") === true);
  check("Frequencies are joined, typed and unusable ones dropped", saez?.frequencies.map((f) => `${f.type}:${f.frequencyMhz}`).join() === "tower:118.6,approach:119.9");
  check("Codes are collected", saez?.codes.join() === "SAEZ,EZE");
}

function runRealData(): void {
  if (!directoryFilesExist()) {
    console.log("SKIP real-data checks: datasets/ourairports/*.csv not present");
    return;
  }

  const directory = new AirportDirectory(loadOurAirports());
  const near = BUENOS_AIRES;
  const best = (spoken: string) => directory.shortlist(spoken, { near });

  check("Real data: Ezeiza is confident", best("Ezeiza").candidates[0]?.airport.id === "SAEZ" && best("Ezeiza").confident);
  check("Real data: Ministro Pistarini", best("Ministro Pistarini").candidates[0]?.airport.id === "SAEZ");
  check("Real data: Aeroparque beats Aeroparque Rosario near Buenos Aires", best("Aeroparque").candidates[0]?.airport.id === "SABE");
  check("Real data: Moron resolves to the Argentine one nearby", best("Moron").candidates[0]?.airport.id === "SADM", best("Moron").candidates.map((c) => c.airport.id).join());
  check("Real data: El Palomar", best("El Palomar").candidates[0]?.airport.id === "SADP");
  check("Real data: EZE and SAEZ", best("EZE").candidates[0]?.airport.id === "SAEZ" && best("SAEZ").candidates[0]?.airport.id === "SAEZ");
  check("Real data: a typo", best("Eseiza").candidates[0]?.airport.id === "SAEZ");
  check("Real data: Buenos Aires is ambiguous", !best("Buenos Aires").confident);
  check(
    "Real data: Aeroparque carries its frequencies",
    directory.byCode("SABE")?.frequencies.some((f) => f.type === "ground" && f.frequencyMhz === 121.9) === true,
  );
}

runCsv();
runText();
runShortlist();
runLoader();
runRealData();

console.log(failures.length === 0 ? "\nAll checks passed." : `\n${failures.length} check(s) failed.`);
process.exitCode = failures.length === 0 ? 0 : 1;
