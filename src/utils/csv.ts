// RFC 4180: quoted fields may contain commas, doubled quotes and line breaks.
export const parseCsv = (text: string): Record<string, string>[] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const character = text[i];

    if (quoted) {
      if (character === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[i + 1] === "\n") {
        i++;
      }

      row.push(field);
      field = "";

      if (row.length > 1 || row[0] !== "") {
        rows.push(row);
      }

      row = [];
    } else {
      field += character;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...records] = rows;

  return records.map((record) =>
    Object.fromEntries(header.map((name, index) => [name, record[index] ?? ""])),
  );
};
