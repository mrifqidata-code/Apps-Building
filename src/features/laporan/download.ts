import { CSV_BOM } from '../../domain/csv';

/** Saves a CSV file (on Android Chrome: to Downloads), ready to open in Google Sheets. */
export function downloadCsv(fileName: string, csv: string) {
  const url = URL.createObjectURL(new Blob([CSV_BOM, csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
