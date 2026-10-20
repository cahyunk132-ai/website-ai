import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { createGeneratedFile, isFileCreationRequest, MAX_FILE_BYTES } from './generatedFiles';
import { executeAgentToolCall } from './tools';

const decode = (url: string) => Buffer.from(url.split(',')[1], 'base64');

describe('downloadable generated files', () => {
  it('returns actual text bytes without a shared filesystem path', async () => {
    const file = await createGeneratedFile({ path: 'config.json', content: '{"name":"Keamanan digital"}' });
    expect(decode(file.url!).toString()).toBe('{"name":"Keamanan digital"}');
    expect(file.size).toBe(decode(file.url!).length);
    expect(file).not.toHaveProperty('fullPath');
  });

  it('allows an empty text file', async () => {
    expect((await createGeneratedFile({ path: 'empty.txt', content: '' })).size).toBe(0);
  });

  it('renders a valid multipage PDF rather than renaming text bytes', async () => {
    const file = await createGeneratedFile({ path: 'NIM_Nama_KeamananKomunikasiDigital.pdf', content: 'Panduan komunikasi digital: lindungi akun Anda.\n'.repeat(120) });
    const bytes = decode(file.url!);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(file.mimeType).toBe('application/pdf');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  });

  it('wraps long lines and unbroken strings without losing PDF validity', async () => {
    const file = await createGeneratedFile({ path: 'long.pdf', content: 'a'.repeat(5000) });
    expect((await PDFDocument.load(decode(file.url!))).getPageCount()).toBeGreaterThan(1);
  });

  it.each(['../secret.txt', '/tmp/a.txt', 'a/b.txt', 'a\\b.txt', '..', 'a.docx', 'a.exe'])('rejects unsafe or unsupported filename %s', async (path) => {
    await expect(createGeneratedFile({ path, content: 'test' })).rejects.toThrow();
  });

  it('rejects missing content and oversized input', async () => {
    await expect(createGeneratedFile({ path: 'a.txt' })).rejects.toThrow();
    await expect(createGeneratedFile({ path: 'a.txt', content: 'a'.repeat(MAX_FILE_BYTES + 1) })).rejects.toThrow('1 MiB');
  });

  it('reports unsupported PDF glyphs as errors instead of claiming success', async () => {
    const result = await executeAgentToolCall({ type: 'tool', tool: 'write_file', args: { path: 'test.pdf', content: '中文' }, payload: '' });
    expect(result.success).toBe(false);
  });

  it('dispatches file tools and provides a downloadable artifact', async () => {
    const result = await executeAgentToolCall({ type: 'tool', tool: 'write_file', args: { path: 'guide.pdf', content: 'Panduan keamanan digital' }, payload: '' });
    expect(result.success).toBe(true);
    expect(result.data.artifact.url).toMatch(/^data:application\/pdf;base64,/);
    expect(result.output).toContain('download');
  });

  it('makes invalid file tool calls fail rather than succeed with an error message', async () => {
    const result = await executeAgentToolCall({ type: 'tool', tool: 'write_file', args: { path: '../a.txt', content: 'test' }, payload: '' });
    expect(result.success).toBe(false);
  });
});

describe('file request routing', () => {
  it.each(['Buatkan file PDF panduan keamanan komunikasi digital', 'bikin config.json untuk aplikasi saya', 'Please create a PDF guide', 'Export this document to PDF', 'tolong jadikan file txt'])('uses tools for %s', (text) => {
    expect(isFileCreationRequest(text)).toBe(true);
  });
  it.each(['Apa itu PDF?', 'Hello', 'Jelaskan konsep enkripsi'])('does not route unrelated text %s', (text) => {
    expect(isFileCreationRequest(text)).toBe(false);
  });
});
