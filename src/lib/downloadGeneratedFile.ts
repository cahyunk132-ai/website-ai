import type { FileAttachment } from './ai/types';

/** Blob URLs avoid navigating to data: URLs and download HTML/code as bytes. */
export function downloadGeneratedFile(file: FileAttachment): void {
  const match = file.url?.match(/^data:(application\/pdf|text\/plain;charset=utf-8);base64,([A-Za-z0-9+/=]*)$/);
  if (!match) return;
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: match[1] }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
