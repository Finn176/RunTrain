// Minimal, dependency-free CSV parser (RFC 4180-ish), used to parse Strava's
// exported activities.csv without pulling in an external library.
//
// Handles:
//  - Quoted fields, including quoted fields containing commas or newlines
//  - Escaped quotes inside quoted fields ("" -> ")
//  - \r\n, \r, and \n line endings
//  - A header row, returning an array of objects keyed by header name
//
// Not handled (not needed for Strava's export): multi-character delimiters,
// custom quote characters.

export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];

  const header = rows[0];
  const records: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    // Skip fully-empty trailing rows.
    if (row.length === 1 && row[0] === "") continue;
    const record: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      record[header[c]] = row[c] ?? "";
    }
    records.push(record);
  }

  return records;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Normalize CRLF/CR to LF up front is unsafe inside quoted fields containing
  // literal \r\n as data, so we scan character-by-character instead.
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (ch === "\r") {
      // Peek for \r\n
      if (text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      continue;
    }

    if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      continue;
    }

    field += ch;
  }

  // Flush the last field/row if the file didn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
