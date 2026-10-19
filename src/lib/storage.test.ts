import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Minimal Supabase client double: every builder call is recorded and the
 * resulting chain resolves with the configured payload.
 */
const { mockState } = vi.hoisted(() => ({
  mockState: {
    client: null as any,
  },
}));

vi.mock('./supabase/server', () => ({
  createServerSupabaseClient: () => mockState.client,
  createServerSupabaseAdminClient: () => mockState.client,
}));

interface QueryLog {
  method: string;
  args: any[];
}

function createQuery(log: QueryLog[], result: any): any {
  const target: any = {
    then: (onFulfilled: any, onRejected: any) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (onRejected: any) => Promise.resolve(result).catch(onRejected),
    finally: (onFinally: any) => Promise.resolve(result).finally(onFinally),
  };

  let proxy: any;
  proxy = new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop as any];
      return (...args: any[]) => {
        log.push({ method: String(prop), args });
        return proxy;
      };
    },
  });

  return proxy;
}

function createFakeClient(config: {
  tables?: Record<string, any>;
  rpc?: (name: string, params: any) => any;
}) {
  const log: QueryLog[] = [];

  const client: any = {
    log,
    from(table: string) {
      log.push({ method: 'from', args: [table] });
      return createQuery(log, config.tables?.[table] ?? { data: null, error: null });
    },
    rpc(name: string, params: any) {
      log.push({ method: 'rpc', args: [name, params] });
      return Promise.resolve(
        config.rpc ? config.rpc(name, params) : { data: null, error: null }
      );
    },
  };

  return client;
}

function callsFor(log: QueryLog[], method: string): QueryLog[] {
  return log.filter((entry) => entry.method === method);
}

// The module under test is imported after the mock is registered.
import {
  listConversations,
  listFolders,
  createFolder,
  deleteFolder,
  checkAndIncrementUsage,
  searchConversations,
  saveMessage,
  addProviderApiKey,
  DAILY_REQUEST_LIMIT,
} from './storage';

describe('Storage layer (Supabase backed)', () => {
  beforeEach(() => {
    mockState.client = createFakeClient({});
  });

  it('maps folder, system prompt and temperature when listing conversations', async () => {
    mockState.client = createFakeClient({
      tables: {
        conversations: {
          data: [
            {
              id: 'c1',
              title: 'Roadmap',
              selected_model: 'gpt-5.6-luna',
              selected_provider: 'radox',
              created_at: '2026-10-18T00:00:00.000Z',
              updated_at: '2026-10-18T01:00:00.000Z',
              user_id: 'user-1',
              folder_id: 'folder-1',
              system_prompt: 'You are helpful',
              temperature: 0.42,
            },
          ],
          error: null,
        },
      },
    });

    const conversations = await listConversations('user-1');

    expect(conversations).toHaveLength(1);
    expect(conversations[0].folderId).toBe('folder-1');
    expect(conversations[0].systemPrompt).toBe('You are helpful');
    expect(conversations[0].temperature).toBe(0.42);
  });

  it('reads folders from Supabase instead of memory', async () => {
    mockState.client = createFakeClient({
      tables: {
        conversation_folders: {
          data: [
            {
              id: 'f1',
              name: 'Work',
              color: '#06b6d4',
              created_at: '2026-10-18T00:00:00.000Z',
              user_id: 'user-1',
            },
          ],
          error: null,
        },
      },
    });

    const folders = await listFolders('user-1');

    expect(folders).toHaveLength(1);
    expect(folders[0].name).toBe('Work');
    expect(callsFor(mockState.client.log, 'from').some((c) => c.args[0] === 'conversation_folders')).toBe(
      true
    );
  });

  it('seeds the default folders when the user has none', async () => {
    const insertCalls: any[] = [];
    mockState.client = createFakeClient({
      tables: {
        conversation_folders: { data: [], error: null },
      },
    });

    const originalFrom = mockState.client.from.bind(mockState.client);
    mockState.client.from = (table: string) => {
      if (table === 'conversation_folders') {
        const log = mockState.client.log;
        log.push({ method: 'from', args: [table] });
        const chain = createQuery(log, { data: [], error: null });
        chain.insert = (rows: any) => {
          insertCalls.push(rows);
          log.push({ method: 'insert', args: [rows] });
          return createQuery(log, {
            data: (Array.isArray(rows) ? rows : [rows]).map((row: any, index: number) => ({
              id: `seeded-${index}`,
              created_at: '2026-10-18T00:00:00.000Z',
              user_id: row.user_id,
              name: row.name,
              color: row.color,
            })),
            error: null,
          });
        };
        return chain;
      }
      return originalFrom(table);
    };

    const folders = await listFolders('user-1');

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toHaveLength(3);
    expect(folders).toHaveLength(3);
  });

  it('persists new folders in Supabase', async () => {
    const insertCalls: any[] = [];
    mockState.client = createFakeClient({});
    const originalFrom = mockState.client.from.bind(mockState.client);
    mockState.client.from = (table: string) => {
      if (table === 'conversation_folders') {
        const log = mockState.client.log;
        log.push({ method: 'from', args: [table] });
        const chain = createQuery(log, { data: null, error: null });
        chain.insert = (row: any) => {
          insertCalls.push(row);
          log.push({ method: 'insert', args: [row] });
          return createQuery(log, {
            data: {
              id: 'new-folder',
              name: row.name,
              color: row.color,
              created_at: '2026-10-18T00:00:00.000Z',
              user_id: row.user_id,
            },
            error: null,
          });
        }
        chain.select = () => chain;
        chain.single = () => chain;
        return chain;
      }
      return originalFrom(table);
    };

    const folder = await createFolder('  My Folder  ', '#ff0000', 'user-1');

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toMatchObject({
      name: 'My Folder',
      color: '#ff0000',
      user_id: 'user-1',
    });
    expect(folder.id).toBe('new-folder');
  });

  it('detaches conversations from a deleted folder', async () => {
    mockState.client = createFakeClient({
      tables: {
        conversations: { data: null, error: null },
        conversation_folders: { data: null, error: null },
      },
    });

    const ok = await deleteFolder('folder-1');

    expect(ok).toBe(true);
    const updates = callsFor(mockState.client.log, 'update');
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0].args[0]).toMatchObject({ folder_id: null });
  });

  it('blocks requests once the daily limit is reached', async () => {
    mockState.client = createFakeClient({
      rpc: () => ({ data: DAILY_REQUEST_LIMIT + 1, error: null }),
    });

    const usage = await checkAndIncrementUsage('user-1', DAILY_REQUEST_LIMIT);

    expect(usage.allowed).toBe(false);
    expect(usage.remaining).toBe(0);
    expect(usage.limit).toBe(DAILY_REQUEST_LIMIT);
  });

  it('allows requests while below the daily limit', async () => {
    mockState.client = createFakeClient({
      rpc: () => ({ data: 3, error: null }),
    });

    const usage = await checkAndIncrementUsage('user-1', DAILY_REQUEST_LIMIT);

    expect(usage.allowed).toBe(true);
    expect(usage.remaining).toBe(DAILY_REQUEST_LIMIT - 3);
  });

  it('falls back to read/upsert accounting when the RPC is unavailable', async () => {
    const upserts: any[] = [];
    mockState.client = createFakeClient({
      rpc: () => ({ data: null, error: { message: 'function does not exist' } }),
      tables: {
        usage_logs: { data: { request_count: 5, tokens_used: 120 }, error: null },
      },
    });
    const originalFrom = mockState.client.from.bind(mockState.client);
    mockState.client.from = (table: string) => {
      if (table === 'usage_logs') {
        const log = mockState.client.log;
        log.push({ method: 'from', args: [table] });
        const chain = createQuery(log, {
          data: { request_count: 5, tokens_used: 120 },
          error: null,
        });
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.maybeSingle = () => chain;
        chain.upsert = (row: any, options: any) => {
          upserts.push({ row, options });
          log.push({ method: 'upsert', args: [row, options] });
          return createQuery(log, { data: null, error: null });
        };
        return chain;
      }
      return originalFrom(table);
    };

    const usage = await checkAndIncrementUsage('user-1', DAILY_REQUEST_LIMIT);

    expect(usage.allowed).toBe(true);
    expect(usage.requestCount).toBe(6);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].row.request_count).toBe(6);
    expect(upserts[0].options.onConflict).toBe('user_id,date');
  });

  it('uses the quota of the tier when no limit is given', async () => {
    mockState.client = createFakeClient({
      rpc: () => ({ data: 3, error: null }),
    });

    // Without an explicit limit the tier of the account decides: a free
    // account may send 20 requests per day.
    const usage = await checkAndIncrementUsage('user-1');

    expect(usage.limit).toBe(20);
    expect(usage.remaining).toBe(17);
  });

  it('searches conversations and messages in the database', async () => {
    mockState.client = createFakeClient({
      tables: {
        conversations: {
          data: [
            {
              id: 'c1',
              title: 'Deployment Plan',
              selected_model: 'gpt-5.6-luna',
              selected_provider: 'radox',
              created_at: '2026-10-18T00:00:00.000Z',
              updated_at: '2026-10-18T01:00:00.000Z',
              user_id: 'user-1',
            },
          ],
          error: null,
        },
        messages: {
          data: [
            {
              id: 'm1',
              content: 'The deployment plan is ready for review',
              conversation_id: 'c2',
              conversations: {
                id: 'c2',
                title: 'Other',
                selected_model: 'gpt-5.6-luna',
                selected_provider: 'radox',
                created_at: '2026-10-18T00:00:00.000Z',
                updated_at: '2026-10-18T01:00:00.000Z',
                user_id: 'user-1',
              },
            },
          ],
          error: null,
        },
      },
    });

    const results = await searchConversations('deployment', 'user-1');

    expect(results).toHaveLength(2);
    expect(results[0].matchedIn).toBe('title');
    expect(results[1].matchedIn).toBe('message');
    expect(results[1].snippet).toContain('deployment plan');

    const ilikeCalls = callsFor(mockState.client.log, 'ilike');
    expect(ilikeCalls.length).toBe(2);
  });

  it('stores token usage alongside the message', async () => {
    const inserts: any[] = [];
    mockState.client = createFakeClient({});
    const originalFrom = mockState.client.from.bind(mockState.client);
    mockState.client.from = (table: string) => {
      if (table === 'messages') {
        const log = mockState.client.log;
        log.push({ method: 'from', args: [table] });
        const chain = createQuery(log, { data: null, error: null });
        chain.insert = (row: any) => {
          inserts.push(row);
          log.push({ method: 'insert', args: [row] });
          return createQuery(log, { data: null, error: null });
        };
        return chain;
      }
      return originalFrom(table);
    };

    await saveMessage(
      'c1',
      {
        id: 'm1',
        role: 'assistant',
        content: 'hello',
        tokensPrompt: 120,
        tokensCompletion: 45,
      },
      'user-1'
    );

    expect(inserts).toHaveLength(1);
    expect(inserts[0].tokens_prompt).toBe(120);
    expect(inserts[0].tokens_completion).toBe(45);
  });

  it('inserts provider keys instead of upserting them', async () => {
    const inserts: any[] = [];
    const upserts: any[] = [];
    mockState.client = createFakeClient({
      tables: {
        provider_settings: { data: [], error: null },
      },
    });
    const originalFrom = mockState.client.from.bind(mockState.client);
    mockState.client.from = (table: string) => {
      if (table === 'provider_settings') {
        const log = mockState.client.log;
        log.push({ method: 'from', args: [table] });
        const chain = createQuery(log, { data: [], error: null });
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.insert = (row: any) => {
          inserts.push(row);
          log.push({ method: 'insert', args: [row] });
          return createQuery(log, { data: null, error: null });
        };
        chain.upsert = (row: any) => {
          upserts.push(row);
          log.push({ method: 'upsert', args: [row] });
          return createQuery(log, { data: null, error: null });
        };
        return chain;
      }
      return originalFrom(table);
    };

    await addProviderApiKey('radox', 'rdx_test_key_123');

    expect(upserts).toHaveLength(0);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].provider).toBe('radox');
    expect(inserts[0].encrypted_api_key).toBeTruthy();
  });
});
