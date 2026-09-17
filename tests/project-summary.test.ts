import { describe, expect, it } from "vitest";
import { createProjectData } from "@/lib/project-data";
import { projectFinancialSummary } from "@/lib/projects/project-summary";

describe("專案大廳財務摘要", () => {
  it("月結批次與其關聯收入不會重複計算", () => {
    const project = createProjectData(
      "project-id",
      "長期專案",
      "shortVideoEditing",
    );
    project.tasks.push({
      id: "income-1",
      moduleId: "Finance",
      title: "影片收入",
      status: "待請款",
      transactionType: "income",
      amount: 1500,
      isPaid: false,
      settlementBatchId: "batch-1",
      updatedAt: "2026-09-30T00:00:00.000Z",
    });
    project.settlementBatches.push({
      id: "batch-1",
      month: "2026-09",
      items: [
        {
          taskId: "video-1",
          title: "影片",
          unitPrice: 1500,
          deliveredAt: "2026-09-20T00:00:00.000Z",
        },
      ],
      subtotal: 1500,
      adjustment: -100,
      total: 1400,
      status: "invoiced",
      createdAt: "2026-09-30T00:00:00.000Z",
    });

    expect(projectFinancialSummary(project).outstandingReceivable).toBe(1400);
  });

  it("未納入月結的收入仍會列入待收", () => {
    const project = createProjectData("project-id", "一般專案");
    project.tasks.push({
      id: "income-1",
      moduleId: "Finance",
      title: "訂金",
      status: "待請款",
      transactionType: "income",
      amount: 5000,
      isPaid: false,
      updatedAt: "2026-09-01T00:00:00.000Z",
    });

    expect(projectFinancialSummary(project).outstandingReceivable).toBe(5000);
  });
});
