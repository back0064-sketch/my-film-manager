import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { buildRestoreSql } from '@/lib/backups/restore-sql';
import { createProjectData } from '@/lib/project-data';
import { closeSettlementMonth, deliveriesMissingDate, settlementCandidates, updateSettlementBatch } from '@/lib/projects/settlement-logic';
import { addTaskToProject, updateTaskInProject } from '@/lib/projects/task-logic';
import { buildReceivableItems } from '@/lib/projects/work-command';
import type { ProjectData } from '@/types/project';

const ownerId = '00000000-0000-4000-8000-000000000001';
const clientId = '00000000-0000-4000-8000-000000000002';
const firstId = '00000000-0000-4000-8000-000000000003';
const secondId = 'legacy-project';
const now = '2026-12-01T04:00:00Z';

function addDelivery(project: ProjectData, title: string, amount: number, deliveredAt?: string) {
  const next = addTaskToProject(project, title, 'Scripting', '待收素材', 'income', amount);
  const task = next.tasks.find((item) => item.title === title)!;
  const delivered = updateTaskInProject(next, task.id, { status: '已交付', deliveredAt });
  // Simulate a legacy row written before automatic delivery timestamps existed.
  return deliveredAt ? delivered : updateTaskInProject(delivered, task.id, { deliveredAt: undefined });
}

it('從獨立 SQL 備份還原同一客戶的兩個專案，並逐支對帳', async () => {
  const first = addDelivery(createProjectData(firstId, '品牌影片 A', 'shortVideoEditing'), '跨月交付', 1200, '2026-10-31T16:30:00Z');
  const second = addDelivery(createProjectData(secondId, '品牌影片 B', 'shortVideoEditing'), '十月交付', 2800, '2026-10-31T15:59:00Z');
  const withLegacy = addDelivery(second, '缺交付日的舊片', 900);
  expect(settlementCandidates(first, '2026-10')).toEqual([]);
  expect(settlementCandidates(withLegacy, '2026-11')).toEqual([]);
  expect(deliveriesMissingDate(withLegacy).map((task) => task.title)).toEqual(['缺交付日的舊片']);
  const legacyId = deliveriesMissingDate(withLegacy)[0].id;
  const withConfirmedDate = updateTaskInProject(withLegacy, legacyId, { deliveredAt: '2026-11-20' });
  expect(settlementCandidates(withConfirmedDate, '2026-11').map((task) => task.id)).toEqual([legacyId]);

  const draftA = closeSettlementMonth(first, '2026-11', now);
  const invoiceA = updateSettlementBatch(draftA, draftA.settlementBatches[0].id, { status: 'invoiced', invoiceNumber: 'A-11' }, now);
  const draftB = closeSettlementMonth(withLegacy, '2026-10', now);
  const paidB = updateSettlementBatch(draftB, draftB.settlementBatches[0].id, { status: 'paid', invoiceNumber: 'B-10' }, now);

  const restoreSql = buildRestoreSql({
    projects: [invoiceA, paidB].map((project) => ({ id: project.id, name: project.name, owner_id: ownerId, client_id: clientId, updated_at: now, project_data: project })),
    clients: [{ id: clientId, owner_id: ownerId, name: "測試客戶's 公司", contact_name: null, contact_email: null, contact_phone: null, notes: '測試\n備註', created_at: now, updated_at: now }],
  });
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role;
      create schema auth; create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;`);
    await db.query('insert into auth.users (id) values ($1)', [ownerId]);
    await db.exec(readFileSync('supabase/schema.sql', 'utf8'));
    await db.exec('alter table public.film_projects alter column id type text using id::text');
    await db.exec(restoreSql);
    await db.exec(readFileSync('supabase/migrations/20260917023844_normalize_project_data.sql', 'utf8'));

    const { rows } = await db.query<{ client_id: string; project_data: ProjectData }>('select client_id, project_data from film_projects order by id');
    expect(rows.map((row) => row.client_id)).toEqual([clientId, clientId]);
    expect(rows[0].project_data.settlementBatches[0]).toMatchObject({ month: '2026-11', total: 1200, status: 'invoiced', invoiceNumber: 'A-11', items: [{ title: '跨月交付', unitPrice: 1200 }] });
    expect(rows[1].project_data.settlementBatches[0]).toMatchObject({ month: '2026-10', total: 2800, status: 'paid', invoiceNumber: 'B-10', items: [{ title: '十月交付', unitPrice: 2800 }] });
    expect(rows[0].project_data.tasks.find((task) => task.title === '跨月交付')?.archivedAt).toBe(now);
    expect(buildReceivableItems(rows[0].project_data)).toMatchObject([{ invoiceNumber: 'A-11', source: 'batch', amount: 1200 }]);
    expect(buildReceivableItems(rows[1].project_data).map((item) => item.amount)).toEqual([900]);
    expect((await db.query('select count(*)::int as count from project_settlement_items')).rows).toEqual([{ count: 2 }]);
    await expect(db.exec(restoreSql)).rejects.toThrow(/duplicate key/);
    await db.exec('rollback');
    expect((await db.query('select count(*)::int as count from film_projects')).rows).toEqual([{ count: 2 }]);
  } finally {
    await db.close();
  }
}, 15_000);
