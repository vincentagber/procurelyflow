import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeSupplierQuotes,
  scorePaymentTerms,
  classifyDeliverySpeed,
  RawQuoteInput,
} from "./quotationComparison";

describe("Automated Quotation Comparison & Side-by-Side Bid Analysis Engine", () => {
  it("evaluates payment terms working-capital scores accurately", () => {
    assert.equal(scorePaymentTerms("Net 60 days"), 10);
    assert.equal(scorePaymentTerms("Net 30 days invoice"), 9);
    assert.equal(scorePaymentTerms("Net 14 days"), 8);
    assert.equal(scorePaymentTerms("50% advance, 50% on site delivery"), 6);
    assert.equal(scorePaymentTerms("100% advance upfront payment"), 3);
  });

  it("classifies delivery speed categories from lead times", () => {
    assert.equal(classifyDeliverySpeed(3), "Fastest (<5 days)");
    assert.equal(classifyDeliverySpeed(7), "Standard (5-10 days)");
    assert.equal(classifyDeliverySpeed(14), "Extended (>10 days)");
    assert.equal(classifyDeliverySpeed(null), "Unspecified");
  });

  it("performs comprehensive side-by-side bid analysis across 3 supplier quotes", () => {
    const rawQuotes: RawQuoteInput[] = [
      {
        id: "quote-1",
        rfqId: "rfq-101",
        supplierId: "supp-dangote",
        currency: "NGN",
        subtotal: 4000000,
        vatAmount: 300000,
        deliveryCharge: 150000,
        totalAmount: 4450000,
        leadTimeDays: 4,
        paymentTerms: "Net 30 days",
        warrantyNote: "Standard Manufacturer Quality Warranty 12 Months",
        validityDays: 30,
        submittedAt: "2026-09-08T10:00:00Z",
        status: "submitted",
        supplier: {
          id: "supp-dangote",
          name: "Dangote Cement Plc",
          isCompliant: true,
          taxId: "24981720-0001",
          rating: 4.8,
          historicalPerformance: {
            totalFulfilledOrders: 18,
            totalFulfilledSpendNgn: 140000000,
            onTimeDeliveryRatePercent: 96,
            qualityAcceptanceRatePercent: 99,
            disputeRatePercent: 0,
          },
        },
        items: [
          {
            requisitionItemId: "item-cement-50kg",
            description: "Portland Cement (Grade 42.5R) 50kg Bags",
            quantity: 500,
            unitPrice: 8000,
            vatRate: 7.5,
            vatAmount: 300000,
          },
        ],
      },
      {
        id: "quote-2",
        rfqId: "rfq-101",
        supplierId: "supp-lafarge",
        currency: "NGN",
        subtotal: 4250000,
        vatAmount: 318750,
        deliveryCharge: 100000,
        totalAmount: 4668750,
        leadTimeDays: 7,
        paymentTerms: "50% Advance / 50% on Delivery",
        warrantyNote: "6 Months Replacement Warranty",
        validityDays: 14,
        submittedAt: "2026-09-08T12:30:00Z",
        status: "submitted",
        supplier: {
          id: "supp-lafarge",
          name: "Lafarge Africa Building Supplies",
          isCompliant: true,
          taxId: "19283746-0002",
          rating: 4.5,
          historicalPerformance: {
            totalFulfilledOrders: 8,
            totalFulfilledSpendNgn: 48000000,
            onTimeDeliveryRatePercent: 92,
            qualityAcceptanceRatePercent: 97,
            disputeRatePercent: 1,
          },
        },
        items: [
          {
            requisitionItemId: "item-cement-50kg",
            description: "Portland Cement (Grade 42.5R) 50kg Bags",
            quantity: 500,
            unitPrice: 8500,
            vatRate: 7.5,
            vatAmount: 318750,
          },
        ],
      },
      {
        id: "quote-3",
        rfqId: "rfq-101",
        supplierId: "supp-bua",
        currency: "NGN",
        subtotal: 3900000,
        vatAmount: 292500,
        deliveryCharge: 350000,
        totalAmount: 4542500,
        leadTimeDays: 12, // Slow delivery
        paymentTerms: "100% advance upfront payment",
        warrantyNote: "No warranty on delivery transit",
        validityDays: 7,
        submittedAt: "2026-09-08T14:15:00Z",
        status: "submitted",
        supplier: {
          id: "supp-bua",
          name: "BUA Direct Merchants",
          isCompliant: false, // Non-compliant TIN
          taxId: null,
          rating: 3.8,
          historicalPerformance: {
            totalFulfilledOrders: 2,
            totalFulfilledSpendNgn: 12000000,
            onTimeDeliveryRatePercent: 75,
            qualityAcceptanceRatePercent: 88,
            disputeRatePercent: 5,
          },
        },
        items: [
          {
            requisitionItemId: "item-cement-50kg",
            description: "Portland Cement (Grade 42.5R) 50kg Bags",
            quantity: 500,
            unitPrice: 7800, // Cheapest unit price, but high delivery charge and non-compliant
            vatRate: 7.5,
            vatAmount: 292500,
          },
        ],
      },
    ];

    const analysis = analyzeSupplierQuotes({
      rfqId: "rfq-101",
      rfqReference: "RFQ-2026-0042",
      requisitionTitle: "Dangote Portland Cement (Grade 42.5R) — 500 Bags",
      siteProjectName: "Lekki Coastal Highway Tower A",
      neededByDate: "2026-09-15T00:00:00Z",
      closesAt: "2026-09-10T17:00:00Z",
      totalInvitedCount: 4,
      rawQuotes,
      requisitionItems: [
        {
          id: "item-cement-50kg",
          description: "Portland Cement (Grade 42.5R) 50kg Bags",
          quantity: 500,
          unit: "bags",
          estimatedUnitPrice: 8500,
        },
      ],
    });

    // 1. General Summary
    assert.equal(analysis.totalQuotesReceived, 3);
    assert.equal(analysis.totalInvitedSuppliers, 4);
    assert.equal(analysis.responseRatePercent, 75);

    // 2. Line Item Pricing & Lowest Price Detection
    assert.equal(analysis.lineItems.length, 1);
    const cementRow = analysis.lineItems[0]!;
    assert.equal(cementRow.lowestUnitPrice, 7800);
    assert.equal(cementRow.highestUnitPrice, 8500);
    assert.equal(cementRow.lowestSupplierId, "supp-bua");
    assert.equal(cementRow.byQuote["quote-3"]!.isLowestPrice, true);
    assert.equal(cementRow.byQuote["quote-1"]!.isLowestPrice, false);

    // 3. Landed Cost Calculation (Base + VAT + Delivery)
    const quoteDangote = analysis.quotes.find((q) => q.id === "quote-1")!;
    const quoteLafarge = analysis.quotes.find((q) => q.id === "quote-2")!;
    const quoteBua = analysis.quotes.find((q) => q.id === "quote-3")!;

    // Dangote: 4,000,000 + 300,000 + 150,000 = 4,450,000 (Lowest Landed Cost!)
    assert.equal(quoteDangote.totalLandedCost, 4450000);
    assert.equal(quoteDangote.isLowestLandedCost, true);
    assert.equal(quoteDangote.landedCostRank, 1);
    assert.equal(quoteDangote.landedCostVarianceVsLowest, 0);

    // BUA: 3,900,000 + 292,500 + 350,000 = 4,542,500
    assert.equal(quoteBua.totalLandedCost, 4542500);
    assert.equal(quoteBua.landedCostRank, 2);
    assert.equal(quoteBua.landedCostVarianceVsLowest, 92500);

    // Lafarge: 4,250,000 + 318,750 + 100,000 = 4,668,750
    assert.equal(quoteLafarge.totalLandedCost, 4668750);
    assert.equal(quoteLafarge.landedCostRank, 3);
    assert.equal(quoteLafarge.landedCostVarianceVsLowest, 218750);

    // 4. Multi-Criteria Scoring & Recommended Award
    // BUA is non-compliant and has poor terms/extended lead time
    assert.equal(quoteBua.isCompliant, false);
    assert.equal(quoteDangote.isCompliant, true);

    // Dangote should be the recommended award
    assert.equal(analysis.recommendedQuoteId, "quote-1");
    assert.equal(analysis.recommendedSupplierName, "Dangote Cement Plc");
    assert.equal(quoteDangote.isRecommended, true);
    assert.equal(quoteDangote.recommendationRank, 1);
    assert.ok(quoteDangote.commercialScore > quoteLafarge.commercialScore);
    assert.ok(quoteDangote.commercialScore > quoteBua.commercialScore);

    // 5. Executive Rationale & Savings
    assert.ok(analysis.recommendationRationale.includes("Dangote Cement Plc"));
    assert.ok(analysis.recommendationRationale.includes("lowest total landed cost"));
    assert.ok(analysis.totalPotentialCostAvoidance > 0);
  });
});
