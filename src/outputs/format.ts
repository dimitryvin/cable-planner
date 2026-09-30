/** Minimal CSV/Markdown writers for the output tables. */

export interface Table {
  headers: string[];
  rows: (string | number)[][];
}

const csvCell = (v: string | number): string => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(t: Table): string {
  return [t.headers, ...t.rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

const mdCell = (v: string | number): string => String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function toMarkdownTable(t: Table): string {
  const head = `| ${t.headers.map(mdCell).join(' | ')} |`;
  const sep = `| ${t.headers.map(() => '---').join(' | ')} |`;
  const body = t.rows.map((r) => `| ${r.map(mdCell).join(' | ')} |`);
  return [head, sep, ...body].join('\n') + '\n';
}
