import { createClient } from '@supabase/supabase-js';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({ requireUser: async () => ({ id: 'owner' }) }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => createClient('https://supabase.test', 'test-key') }));

import { GET as getLobby } from '@/app/api/projects/route';
import { GET as getProject, PATCH as patchProject, PUT as saveProject } from '@/app/api/projects/[id]/route';
import { createProjectData } from '@/lib/project-data';
import { projectFinancialSummary } from '@/lib/projects/project-summary';
import { summarizeSettlements, updateSettlementBatch, withdrawSettlementInvoice } from '@/lib/projects/settlement-logic';
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
    if (select.includes('payload_version:')) return json(rows.map(({ project_data, ...row }) => ({ ...row, payload_version: project_data.syncVersion, archived_at: project_data.archivedAt })));
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
  expect(sourceQueries).toEqual([`eq.${firstId}`, `in.(${firstId})`]);
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

it('直接存檔也無法覆寫已請款金額，撤回請款後才可更正', async () => {
  const { first } = mockPostgrest();
  const save = (project: ProjectData) => saveProject(new Request(request(firstId), { method: 'PUT', body: JSON.stringify(project) }), context(firstId));
  const altered = { ...first, settlementBatches: [{ ...first.settlementBatches[0], adjustment: 500 }] };
  expect((await save(altered)).status).toBe(422);
  expect((await save({ ...first, settlementBatches: [] })).status).toBe(422);

  const response = await save(withdrawSettlementInvoice(first, first.settlementBatches[0].id));
  expect(response.ok).toBe(true);
  const draft: ProjectData = await response.json();
  expect(draft.settlementBatches[0]).toMatchObject({ status: 'draft', total: 1500, withdrawnInvoices: [{ amount: 1500, invoiceNumber: '發票 A' }] });
  const updated = await save(updateSettlementBatch(draft, draft.settlementBatches[0].id, { adjustment: 500 }));
  expect(updated.ok).toBe(true);
  expect((await updated.json()).settlementBatches[0].total).toBe(2000);
});

it('逾期金額只加總已請款且超過期限的月份', () => {
  const [invoice] = fixture(firstId, '發票 A', 1500).settlementBatches;
  expect(summarizeSettlements([
    invoice,
    { ...invoice, total: 400, status: 'draft' },
    { ...invoice, total: 700, status: 'paid' },
    { ...invoice, total: 900, dueDate: '2026-11-18' },
  ], '2026-11-18')).toEqual({ draft: 400, invoiced: 2400, paid: 700, overdue: 1500 });
});

it('歸檔及恢復都保留月結和跨專案應收', async () => {
  mockPostgrest();
  const archive = (archived: boolean) => patchProject(new Request(request(firstId), { method: 'PATCH', body: JSON.stringify({ archived }) }), context(firstId));
  const archived = await archive(true);
  expect(archived.ok).toBe(true);
  expect(await archived.json()).toMatchObject({ archivedAt: expect.any(String) });
  const projects: ProjectListItem[] = await (await getLobby()).json();
  expect(projects.find((project) => project.id === firstId)).toMatchObject({ archivedAt: expect.any(String), outstandingReceivable: 1500, receivableItems: [{ amount: 1500 }] });
  const restored = await archive(false);
  expect(restored.ok).toBe(true);
  expect(await restored.json()).toMatchObject({ archivedAt: null });
  const persisted: ProjectData = await (await getProject(request(firstId), context(firstId))).json();
  expect(persisted.archivedAt).toBeUndefined();
  expect(persisted.settlementBatches[0]).toMatchObject({ total: 1500, status: 'invoiced' });
});
