// Turns typed, pasted or uploaded text into a clean list of email addresses.
// Works line by line, so a CSV with extra columns ("email,name") works:
//  - cells are separated by commas, semicolons, tabs or spaces
//  - cells containing "@" are addresses (valid or invalid); the other cells
//    on that line are other columns (names...) and are ignored
//  - a line with no "@" is the header row if it's the first line and looks
//    like one; otherwise it counts as invalid ("not-an-email")
//  - quotes and "Name <a@b.com>" are unwrapped; duplicates are dropped, ignoring case

// Deliberately simple: one "@", no spaces, a dot in the domain. The backend
// validates again; this catches obvious typos early.
const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]{2,}$/;
const HEADER_RE = /^(e-?mail(\s*address(es)?)?|address(es)?|recipients?|to)$/i;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

export interface ParsedRecipients {
  emails: string[]; // valid, lowercased, not already in `existing`, no duplicates
  invalid: string[]; // entries that aren't usable addresses
  duplicates: number; // repeats inside the input + ones already in the list
}

export function parseRecipients(text: string, existing: readonly string[] = []): ParsedRecipients {
  const seen = new Set(existing.map((e) => e.toLowerCase()));
  const emails: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;

  const lines = text
    .replace(/[^,;\n<>]*<([^<>\s]+)>/g, "$1") // 'Jane Doe <jane@x.com>' -> 'jane@x.com'
    .split(/\r?\n|\r/)
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line, index) => {
    const cells = line.split(/[,;\t ]+/).map(cleanCell).filter(Boolean);
    const candidates = cells.filter((cell) => cell.includes("@"));

    if (candidates.length === 0) {
      const isHeader = index === 0 && (/[,;\t]/.test(line) || HEADER_RE.test(line));
      if (!isHeader) invalid.push(line); // one bad row = one skipped entry
      return;
    }

    for (const cell of candidates) {
      const email = cell.toLowerCase();
      if (!isValidEmail(email)) invalid.push(cell);
      else if (seen.has(email)) duplicates++;
      else {
        seen.add(email);
        emails.push(email);
      }
    }
  });

  return { emails, invalid, duplicates };
}

// '"a@b.com"' -> 'a@b.com', "'x'" -> 'x'
function cleanCell(cell: string): string {
  return cell.trim().replace(/^["'<]+|["'>]+$/g, "");
}
