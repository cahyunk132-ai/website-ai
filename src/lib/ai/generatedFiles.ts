import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { FileAttachment } from './types';

export const MAX_FILE_BYTES = 1024 * 1024;

/** In-memory artifacts travel with the message, not a shared server /tmp directory. */
export async function createGeneratedFile(args: { path?: unknown; content?: unknown }): Promise<FileAttachment> {
  const name = args.path;
  if (typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_. -]{0,179}$/.test(name) || name.includes('..')) {
    throw new Error('Provide a safe filename without directories, for example panduan.pdf.');
  }
  if (typeof args.content !== 'string') throw new Error('File content must be a string.');
  if (Buffer.byteLength(args.content, 'utf8') > MAX_FILE_BYTES) throw new Error('File content exceeds 1 MiB. Split it into smaller files.');
  const extension = name.split('.').pop()?.toLowerCase();
  const textExtensions = ['txt', 'md', 'js', 'jsx', 'ts', 'tsx', 'py', 'json', 'csv', 'html', 'css', 'sql', 'yaml', 'yml', 'xml', 'sh', 'toml', 'ini', 'env', 'log', 'rs', 'go', 'java', 'c', 'cpp', 'h'];
  let bytes: Uint8Array;
  let mimeType = 'text/plain;charset=utf-8';
  if (extension === 'pdf') {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    let page = pdf.addPage([595.28, 841.89]);
    let y = 792;
    const drawLine = (line: string) => {
      if (y < 50) {
        if (pdf.getPageCount() >= 200) throw new Error('PDF exceeds 200 pages. Split the document.');
        page = pdf.addPage([595.28, 841.89]);
        y = 792;
      }
      page.drawText(line, { x: 50, y, size: 11, font });
      y -= 16;
    };
    // Standard Helvetica covers Indonesian/Latin text. Unsupported glyphs fail
    // explicitly instead of producing a corrupt PDF or silently losing text.
    const text = args.content.replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const char of paragraph) {
        if (font.widthOfTextAtSize(line + char, 11) > 495) { drawLine(line); line = ''; }
        line += char;
      }
      drawLine(line);
    }
    bytes = await pdf.save();
    mimeType = 'application/pdf';
  } else {
    if (!extension || !textExtensions.includes(extension)) throw new Error('Unsupported file format. Use .pdf or a text/code extension; binary office formats are not supported.');
    bytes = Buffer.from(args.content, 'utf8');
  }
  if (bytes.length > MAX_FILE_BYTES) throw new Error('Generated file exceeds 1 MiB.');
  return {
    id: crypto.randomUUID(), name, type: 'document', mimeType, size: bytes.length,
    url: `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`,
  };
}

/** File tasks need the real tool loop even when submitted from standard chat. */
export function isFileCreationRequest(text: string): boolean {
  return /(?:buat\w*|bikin\w*|hasilkan|generate|create|make|save|simpan|kirim|unduh|download|jadikan|ubah|convert|export|ekspor)[\s\S]{0,160}(?:\bfile\b|\bpdf\b|\bdokumen\b|\bberkas\b|\bdocument\b|\.[a-z]{2,5}\b)/i.test(text);
}
