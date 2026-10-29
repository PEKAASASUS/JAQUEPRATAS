/** Exportação CSV: campos tratados como texto para impedir fórmulas em planilhas. */
export function csvCell(value: unknown): string {
 let text = value == null ? '' : String(value)
 if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text
 return '"' + text.replace(/"/g, '""') + '"'
}
export function buildCSV(rows: unknown[][]): string {
 return '\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\r\n')
}
export function withinPeriod(timestamp: string, start: string, end: string): boolean {
 const time = new Date(timestamp).getTime()
 if (!Number.isFinite(time)) return false
 return (!start || time >= new Date(`${start}T00:00:00`).getTime()) && (!end || time <= new Date(`${end}T23:59:59.999`).getTime())
}
