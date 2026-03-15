'use client';

function ensurePdfTools() {
  if (typeof window === 'undefined') throw new Error('EXPORT_ONLY_IN_BROWSER');
  if (!window.html2canvas || !window.jspdf?.jsPDF) throw new Error('PDF_TOOLS_NOT_READY');
  return { html2canvas: window.html2canvas, jsPDF: window.jspdf.jsPDF };
}

function sanitizeFilename(name: string) {
  return name.replace(/[\/:*?"<>|]/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export async function downloadElementAsPdf(element: HTMLElement, filename: string, title?: string) {
  const { html2canvas, jsPDF } = ensurePdfTools();
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: Math.max(element.scrollWidth, document.documentElement.clientWidth),
    windowHeight: Math.max(element.scrollHeight, document.documentElement.clientHeight),
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
  if (title) pdf.setProperties({ title });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;
  const sliceHeight = Math.max(1, Math.floor(canvas.width * (usableHeight / usableWidth)));

  let offsetY = 0;
  let pageIndex = 0;
  while (offsetY < canvas.height) {
    const currentHeight = Math.min(sliceHeight, canvas.height - offsetY);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = currentHeight;
    const context = pageCanvas.getContext('2d');
    if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    context.drawImage(canvas, 0, offsetY, canvas.width, currentHeight, 0, 0, canvas.width, currentHeight);
    const imageData = pageCanvas.toDataURL('image/jpeg', 0.92);
    const renderedHeight = (currentHeight * usableWidth) / canvas.width;
    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(imageData, 'JPEG', margin, margin, usableWidth, renderedHeight, undefined, 'FAST');
    offsetY += currentHeight;
    pageIndex += 1;
  }
  pdf.save(`${sanitizeFilename(filename || 'ahwa-export')}.pdf`);
}
