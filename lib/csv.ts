/** Celda segura para Excel/Sheets: escapa comillas y neutraliza fórmulas. */
export function csvCell(value: unknown): string {
  let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvDocument(headers: string[], rows: Record<string, unknown>[]): string {
  return [
    '\uFEFF' + headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(',')),
  ].join('\r\n');
}
