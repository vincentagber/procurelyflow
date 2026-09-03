import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasPermission, requirePermission } from "./permissions.ts";

describe("RBAC & Capability Authorization Engine", () => {
  it("grants admin full access across all capabilities", () => {
    assert.equal(hasPermission(["admin"], "requisition.create"), true);
    assert.equal(hasPermission(["admin"], "approval_rules.manage"), true);
    assert.equal(hasPermission(["admin"], "invoice.approve_payment"), true);
    assert.equal(hasPermission(["admin"], "organization.manage"), true);
  });

  it("restricts requester from financial approval and payment actions", () => {
    assert.equal(hasPermission(["requester"], "requisition.create"), true);
    assert.equal(hasPermission(["requester"], "requisition.view_own"), true);
    assert.equal(hasPermission(["requester"], "approval.decide"), false);
    assert.equal(hasPermission(["requester"], "invoice.approve_payment"), false);
    assert.equal(hasPermission(["requester"], "accounting.export"), false);

    assert.throws(
      () => requirePermission(["requester"], "invoice.approve_payment"),
      /Forbidden: You do not have the required permission/,
    );
  });

  it("grants procurement officer proxy quote entry and PO creation permissions", () => {
    assert.equal(hasPermission(["procurement_officer"], "quote.enter_proxy"), true);
    assert.equal(hasPermission(["procurement_officer"], "purchase_order.create"), true);
    assert.equal(hasPermission(["procurement_officer"], "quote.compare"), true);
    assert.equal(hasPermission(["procurement_officer"], "organization.manage"), false);
  });

  it("grants finance role 3-way match and accounting export capabilities", () => {
    assert.equal(hasPermission(["finance"], "invoice.match"), true);
    assert.equal(hasPermission(["finance"], "invoice.approve_payment"), true);
    assert.equal(hasPermission(["finance"], "accounting.export"), true);
    assert.equal(hasPermission(["finance"], "rfq.create"), false);
  });
});
