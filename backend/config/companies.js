import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, 'companies.csv');

function parseCsvLine(line) {
  const cells = [];
  let cell = '', quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === ',' && !quoted) { cells.push(cell.trim()); cell = ''; continue; }
    cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

export function loadCompanies(filePath = csvPath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#'));
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines.shift());
  return lines.map(parseCsvLine).filter(row => row.length >= headers.length).map(row => Object.fromEntries(headers.map((header, i) => [header, row[i] ?? '']))).map(company => ({
    ...company,
    enabled: String(company.enabled).toLowerCase() === 'true'
  }));
}

export function getEnabledCompanies(filePath = csvPath) {
  return loadCompanies(filePath).filter(company => company.enabled);
}
