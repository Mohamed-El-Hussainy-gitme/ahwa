'use client';

type JsPdfInstance = InstanceType<NonNullable<NonNullable<Window['jspdf']>['jsPDF']>>;

function ensurePdfTools() {
  if (typeof window === 'undefined') throw new Error('EXPORT_ONLY_IN_BROWSER');
  if (!window.html2canvas || !window.jspdf?.jsPDF) throw new Error('PDF_TOOLS_NOT_READY');
  return { html2canvas: window.html2canvas, jsPDF: window.jspdf.jsPDF };
}

function sanitizeFilename(name: string) {
  return name.replace(/[\/:*?"<>|]/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

async function tryHtmlExport(pdf: JsPdfInstance, element: HTMLElement) {
  if (typeof pdf.html !== 'function') return false;
  const windowWidth = Math.max(element.scrollWidth, 960);
  await new Promise<void>((resolve, reject) => {
    try {
      const result = pdf.html?.(element, {
        x: 20,
        y: 20,
        width: pdf.internal.pageSize.getWidth() - 40,
        windowWidth,
        autoPaging: 'text',
        margin: [20, 20, 20, 20],
        html2canvas: {
          scale: 1,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          windowWidth,
          windowHeight: Math.max(element.scrollHeight, window.innerHeight),
        },
        callback: () => resolve(),
      });
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        (result as Promise<unknown>).then(() => resolve()).catch(reject);
      }
    } catch (error) {
      reject(error);
    }
  });
  return true;
}

async function fallbackCanvasExport(html2canvas: NonNullable<Window['html2canvas']>, pdf: JsPdfInstance, element: HTMLElement) {
  const canvas = await html2canvas(element, {
    scale: 1.35,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: Math.max(element.scrollWidth, document.documentElement.clientWidth),
    windowHeight: Math.max(element.scrollHeight, document.documentElement.clientHeight),
    scrollX: 0,
    scrollY: 0,
  });

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
    const imageData = pageCanvas.toDataURL('image/jpeg', 0.9);
    const renderedHeight = (currentHeight * usableWidth) / canvas.width;
    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(imageData, 'JPEG', margin, margin, usableWidth, renderedHeight, undefined, 'FAST');
    offsetY += currentHeight;
    pageIndex += 1;
  }
}

export async function downloadElementAsPdf(element: HTMLElement, filename: string, title?: string) {
  const { html2canvas, jsPDF } = ensurePdfTools();
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true }) as JsPdfInstance;
  if (title) pdf.setProperties({ title });

  try {
    const htmlSucceeded = await tryHtmlExport(pdf, element);
    if (!htmlSucceeded) {
      await fallbackCanvasExport(html2canvas, pdf, element);
    }
  } catch {
    const retryPdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true }) as JsPdfInstance;
    if (title) retryPdf.setProperties({ title });
    await fallbackCanvasExport(html2canvas, retryPdf, element);
    retryPdf.save(`${sanitizeFilename(filename || 'ahwa-export')}.pdf`);
    return;
  }

  pdf.save(`${sanitizeFilename(filename || 'ahwa-export')}.pdf`);
}
