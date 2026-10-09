const PAGE_STYLE_ID = 'receipt-page-size';
const MEASURE_CLASS = 'print-measure';
const PX_PER_MM = 96 / 25.4;
/** Extra paper below the receipt so nothing gets cut off at the page edge. */
const BOTTOM_MARGIN_MM = 6;

/**
 * Opens the browser's print dialog with only the receipt, on a 58 mm wide
 * page as tall as the receipt, so "Simpan sebagai PDF" gives a file that
 * looks like a paper receipt and can be shared on WhatsApp.
 */
export function saveReceiptAsPdf() {
  const receipt = document.querySelector<HTMLElement>('[data-print-area]');
  if (!receipt) return;

  // Measure the receipt as it will look on 58 mm paper (see index.css).
  const measure = document.createElement('div');
  measure.className = MEASURE_CLASS;
  measure.appendChild(receipt.cloneNode(true));
  document.body.appendChild(measure);
  const heightMm = Math.ceil(measure.firstElementChild!.getBoundingClientRect().height / PX_PER_MM);
  measure.remove();

  document.getElementById(PAGE_STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = PAGE_STYLE_ID;
  style.textContent = `@page { size: 58mm ${heightMm + BOTTOM_MARGIN_MM}mm; margin: 0; }`;
  document.head.appendChild(style);
  window.print();
}
