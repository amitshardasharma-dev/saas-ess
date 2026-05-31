// Minimal ambient declaration for `pdf-lib` (pinned dependency 1.17.1).
//
// The package is declared in package.json and is present at runtime/CI install,
// but this worktree intentionally does not run `npm install` (code+typecheck
// only). This shim declares just the narrow surface used by src/services/esign.ts
// so `tsc` stays clean. When pdf-lib's own bundled types are installed they take
// precedence over this fallback for resolution within node_modules.
declare module 'pdf-lib' {
  export interface PDFImage {
    width: number;
    height: number;
  }

  export interface PDFFont {
    widthOfTextAtSize(text: string, size: number): number;
  }

  export interface RGB {
    type: 'RGB';
    red: number;
    green: number;
    blue: number;
  }

  export function rgb(red: number, green: number, blue: number): RGB;

  export interface PDFPageDrawTextOptions {
    x?: number;
    y?: number;
    size?: number;
    font?: PDFFont;
    color?: RGB;
  }

  export interface PDFPageDrawImageOptions {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }

  export interface PDFPage {
    getSize(): { width: number; height: number };
    drawText(text: string, options?: PDFPageDrawTextOptions): void;
    drawImage(image: PDFImage, options?: PDFPageDrawImageOptions): void;
  }

  export const StandardFonts: {
    Helvetica: string;
    [key: string]: string;
  };

  export class PDFDocument {
    static load(
      bytes: Uint8Array | ArrayBuffer | string,
      options?: Record<string, unknown>,
    ): Promise<PDFDocument>;
    static create(): Promise<PDFDocument>;
    getPages(): PDFPage[];
    embedFont(font: string): Promise<PDFFont>;
    embedPng(bytes: Uint8Array | ArrayBuffer | string): Promise<PDFImage>;
    save(): Promise<Uint8Array>;
  }
}
