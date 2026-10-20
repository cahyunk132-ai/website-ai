import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadGeneratedFile } from './downloadGeneratedFile';

const file = { id: 'a', name: 'guide.pdf', type: 'document' as const, mimeType: 'application/pdf', size: 5 };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('download generated artifact', () => {
  it('downloads bytes with the original filename and cleans up the blob URL', () => {
    vi.useFakeTimers();
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal('document', { createElement: () => link, body: { appendChild: vi.fn() } });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    downloadGeneratedFile({ ...file, url: 'data:application/pdf;base64,JVBERi0=' });
    expect(create.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(link.download).toBe('guide.pdf');
    expect(link.href).toBe('blob:test');
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.remove).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });

  it('does not open arbitrary remote URLs or executable data URLs', () => {
    const create = vi.spyOn(URL, 'createObjectURL');
    for (const url of ['https://attacker.example', 'javascript:alert(1)', 'data:text/html;base64,']) {
      downloadGeneratedFile({ ...file, url });
    }
    expect(create).not.toHaveBeenCalled();
  });
});
