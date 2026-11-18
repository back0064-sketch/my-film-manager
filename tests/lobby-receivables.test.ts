import { createClient } from '@supabase/supabase-js';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({ requireUser: async () => ({ id: 'owner' }) }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => createClient('https://supabase.test', 'test-key') }));

import { GET as getLobby } from '@/app/api/projects/route';
import { GET as getProject, PUT as saveProject } from '@/app/api/projects/[id]/route';
import { createProjectData } from '@/lib/project-data';
import { projectFinancialSummary } from '@/lib/projects/project-summary';
import { updateSettlementBatch } from '@/lib/projects/settlement-logic';
import { receivableUrgency } from '@/lib/projects/work-command';
import type { ProjectData, ProjectListItem } from '@/types/project';

const version = '2026-11-01T00:00:00.000Z';
const firstId = '00000000-0000-4000-8000-000000000001';
const secondId = '00000000-0000-4000-8000-000000000002';
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (id: string) => new Request(`https://example.test/api/projects/${id}`);

function fixture(id: string, name: string, amount: number): ProjectData {
  return { ...createProjectData(id, name, 'shortVideoEditing'), syncVersion: version, settlementBatches: [{
    id: 'same-batch-id', month: '2026-10', items: [{ taskId: 'clip', title: '短片', unitPrice: amount, deliveredAt: '2026-10-31' }],
    subtotal: amount, adjustment: 0, total: amount, status: 'invoiced', dueDate: '2026-11-10', invoiceNumber: name, createdAt: version,
  }] };
}

function mockPostgrest({ truncateBatches = false } = {}) {
  const first = fixture(firstId, '發票 A', 1500);
  const second = fixture(secondId, '發票 B', 2400);
  const rows = [first, second].map((project) => ({ id: project.id, name: project.name, client_id: 'same-client', clients: { name: '同一客戶' }, updated_at: version, project_data: project }));
  // Existing projections stay on the old version when the write's RPC fails.
  const projection = rows.map((row) => ({ project_id: row.id, batch_id: 'same-batch-id', month: '2026-10', total: row.project_data.settlementBatches[0].total, status: 'invoiced', invoice_number: row.name, due_date: '2026-11-10', source_project_updated_at: version }));
  const sourceQueries: (string | null)[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
    const { pathname, searchParams } = new URL(input);
    const idFilter = searchParams.get('id');
    const json = (items: unknown[], count = items.length) => Response.json(items, { headers: { 'Content-Range': `*/${count}` } });
    if (pathname.endsWith('/rpc/normalize_project_data')) return Response.json({ message: 'projection delayed', code: '42P01' }, { status: 404 });
    expect(searchParams.get('owner_id')).toBe('eq.owner');
    if (pathname.endsWith('/project_tasks')) return json([]);
    if (pathname.endsWith('/project_settlement_batches')) return json(truncateBatches ? projection.slice(0, 1) : projection, projection.length);
    if (init?.method === 'PATCH') {
      const row = rows.find((item) => idFilter === `eq.${item.id}`)!;
      expect(searchParams.get('updated_at')).toBe(`eq.${row.updated_at}`);
      Object.assign(row, JSON.parse(String(init.body)));
      return json([row]);
    }
    const select = searchParams.get('select') ?? '';
    if (select.includes('payload_version:')) return json(rows.map(({ project_data, ...row }) => ({ ...row, payload_version: project_data.syncVersion })));
    sourceQueries.push(idFilter);
    const selected = idFilter ? rows.filter((row) => idFilter.includes(row.id)) : rows;
    return json(selected);
  }));
  return { first, sourceQueries };
}

afterEach(() => vi.unstubAllGlobals());

it('入帳後即使摘要更新失敗，專案、大廳和追款清單也只列另一案逾期', async () => {
  const { first, sourceQueries } = mockPostgrest();
  const initial = await getLobby();
  expect(await initial.json()).toMatchObject([{ outstandingReceivable: 1500 }, { outstandingReceivable: 2400 }]);
  expect(sourceQueries).toEqual([]);

  const paid = updateSettlementBatch(first, 'same-batch-id', { status: 'paid' });
  const save = await saveProject(new Request(request(firstId), { method: 'PUT', body: JSON.stringify(paid) }), context(firstId));
  expect(save.ok).toBe(true);
  const lobby = await getLobby();
  const projects: ProjectListItem[] = await lobby.json();
  expect(sourceQueries).toEqual([`in.(${firstId})`]);
  const details: ProjectData = await (await getProject(request(firstId), context(firstId))).json();
  expect(details.settlementBatches[0].status).toBe('paid');
  expect(projects).toMatchObject([
    { id: firstId, outstandingReceivable: projectFinancialSummary(details).outstandingReceivable, receivableItems: [] },
    { id: secondId, outstandingReceivable: 2400, clientName: '同一客戶' },
  ]);
  const receivables = projects.flatMap((project) => project.receivableItems ?? []);
  expect(receivables).toMatchObject([{ projectId: secondId, invoiceNumber: '發票 B', amount: 2400 }]);
  expect(receivableUrgency(receivables[0], '2026-11-18')).toBe('overdue');
});

it('摘要被資料庫筆數上限截斷時，使用完整來源重算', async () => {
  const { sourceQueries } = mockPostgrest({ truncateBatches: true });
  const response = await getLobby();
  expect(await response.json()).toMatchObject([{ outstandingReceivable: 1500 }, { outstandingReceivable: 2400 }]);
  expect(sourceQueries).toEqual([null]);
});
