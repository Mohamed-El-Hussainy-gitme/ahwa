declare global {
  interface Window {
    html2canvas?: (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;
    jspdf?: {
      jsPDF: new (options?: Record<string, unknown>) => {
        internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
        setProperties: (properties: Record<string, unknown>) => void;
        addImage: (imageData: string, format: string, x: number, y: number, width: number, height: number, alias?: string, compression?: string) => void;
        addPage: () => void;
        save: (filename: string) => void;
        html?: (
          source: HTMLElement,
          options: {
            callback?: (doc: unknown) => void;
            x?: number;
            y?: number;
            width?: number;
            windowWidth?: number;
            autoPaging?: string;
            margin?: number | [number, number, number, number];
            html2canvas?: Record<string, unknown>;
          },
        ) => Promise<unknown> | void;
      };
    };
  }
}
export {};
