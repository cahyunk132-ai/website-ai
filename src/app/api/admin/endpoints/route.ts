import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/adminAccess';
import { endpointSchema } from '@/lib/ai/endpointSchema';
import { listEndpoints, publicEndpoint, saveEndpoint, deleteEndpoint } from '@/lib/ai/endpointStore';
import { validateEndpointUrl, endpointJson } from '@/lib/ai/endpointTransport';

export const dynamic = 'force-dynamic';
const noCache = { 'Cache-Control': 'no-store' };
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof z.ZodError ? 'Input endpoint tidak valid. Periksa nama, URL, API key, ID model, dan tier.' : error instanceof Error ? error.message : 'Gagal memperbarui endpoint.' }, { status: 400, headers: noCache });
}
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied;
  try { return NextResponse.json({ endpoints: (await listEndpoints()).map(publicEndpoint) }, { headers: noCache }); }
  catch (error) { return failure(error); }
}
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied;
  try {
    const json = await req.json();
    if (json.action === 'test') {
      const parsed = endpointSchema.parse(json.endpoint);
      validateEndpointUrl(parsed.baseUrl);
      // Tests always use explicitly supplied credentials; never reveal stored keys.
      if (!parsed.apiKey) throw new Error('Masukkan API key untuk menguji koneksi.');
      try {
        const data = await endpointJson(parsed.baseUrl, '/models', parsed.apiKey);
        return NextResponse.json({ success: true, modelIds: Array.isArray(data.data) ? data.data.slice(0, 100).map((model: any) => String(model.id).slice(0, 180)) : [] }, { headers: noCache });
      } catch { throw new Error('Tes koneksi gagal. Periksa URL /v1, API key, DNS publik, dan dukungan GET /models.'); }
    }
    const parsed = endpointSchema.parse(json);
    validateEndpointUrl(parsed.baseUrl);
    if (!parsed.apiKey) throw new Error('API key wajib diisi.');
    return NextResponse.json({ endpoint: await saveEndpoint(parsed) }, { status: 201, headers: noCache });
  } catch (error) { return failure(error); }
}
export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied;
  try {
    const { id, ...input } = await req.json();
    z.string().uuid().parse(id);
    const parsed = endpointSchema.parse(input);
    validateEndpointUrl(parsed.baseUrl);
    return NextResponse.json({ endpoint: await saveEndpoint(parsed, id) }, { headers: noCache });
  } catch (error) { return failure(error); }
}
export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied;
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(await req.json());
    await deleteEndpoint(id);
    return NextResponse.json({ success: true }, { headers: noCache });
  } catch (error) { return failure(error); }
}
