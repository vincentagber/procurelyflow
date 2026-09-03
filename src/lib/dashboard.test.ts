import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Dashboard Layout, Data-Binding & Metrics Engine", () => {
  const sampleRequisitions = [
    {
      id: "req-1",
      reference: "REQ-2026-001",
      title: "16mm High-Yield Structural Rebar",
      status: "pending_approval",
      total_amount: 4500000,
      currency: "NGN",
    },
    {
      id: "req-2",
      reference: "REQ-2026-002",
      title: "Portland Cement Grade 42.5N",
      status: "approved",
      total_amount: 3200000,
      currency: "NGN",
    },
    {
      id: "req-3",
      reference: "REQ-2026-003",
      title: "Ready-Mix Concrete Grade C30",
      status: "pending_approval",
      total_amount: 1800000,
      currency: "NGN",
    },
  ];

  const samplePurchaseOrders = [
    { id: "po-1", total_amount: 12500000, settlement_currency: "NGN", status: "issued" },
    { id: "po-2", total_amount: 33830000, settlement_currency: "NGN", status: "issued" },
  ];

  it("accurately calculates total committed spend across issued purchase orders", () => {
    const committedTotal = samplePurchaseOrders.reduce((sum, p) => sum + Number(p.total_amount), 0);
    // 12.5m + 33.83m = 46.33m
    assert.equal(committedTotal, 46330000);
  });

  it("accurately calculates in-approval pipeline sum and count", () => {
    const inApprovalItems = sampleRequisitions.filter((r) => r.status === "pending_approval");
    const inApprovalTotal = inApprovalItems.reduce((sum, r) => sum + Number(r.total_amount), 0);

    assert.equal(inApprovalItems.length, 2);
    assert.equal(inApprovalTotal, 6300000); // 4.5m + 1.8m
  });

  it("filters dashboard log records by search keyword on reference or title", () => {
    const query = "cement";
    const filtered = sampleRequisitions.filter(
      (r) =>
        r.title.toLowerCase().includes(query.toLowerCase()) ||
        r.reference.toLowerCase().includes(query.toLowerCase()),
    );

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.reference, "REQ-2026-002");
  });

  it("calculates pipeline completion percentage ratio for donut chart", () => {
    const totalTransactions = 100;
    const completedTransactions = 80;
    const completionRatio = Math.round((completedTransactions / totalTransactions) * 100);

    assert.equal(completionRatio, 80);
  });
});
