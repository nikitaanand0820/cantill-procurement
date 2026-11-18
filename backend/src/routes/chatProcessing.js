
const express = require('express');
const Papa = require('papaparse');
const { PrismaClient } = require('@prisma/client');
const { processBatch } = require('../services/decisionEngine');

const router = express.Router();
const db = new PrismaClient();

const toNumber = value =>
  value == null ? '' : Number(value);

// Convert a chat PR into the CSV format used by the decision engine
function toCsvRow(pr) {
  return {
    pr_no: pr.prNo,
    pr_line: pr.prLine,
    created_at: pr.createdAt.toISOString(),
    requester: pr.requester,
    department: pr.department,
    plant: pr.plant,
    item_code: pr.itemCode || '',
    description: pr.description,
    quantity: Number(pr.quantity),
    uom: pr.uom,
    estimated_unit_price: toNumber(pr.estimatedUnitPrice),
    need_by_date: pr.needByDate.toISOString().slice(0, 10),
    urgency: pr.urgency
  };
}

// Safely convert optional numbers for Prisma Decimal fields
function nullableDecimal(value) {
  if (
    value === '' ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? String(value) : null;
}

// Convert a saved decision into the dashboard's expected format
function toDecisionRow(record) {
  return {
    pr_no: record.prNo,
    pr_line: record.prLine,
    resolved_item_code: record.resolvedItemCode || '',
    group_id: record.groupId || '',
    po_id: record.poId || '',
    decision: record.decision,
    route: record.route,
    supplier_id: record.supplierId || '',
    unit_price: record.unitPrice?.toString() || '',
    group_value_inr:
      record.groupValueInr?.toString() || '',
    suggested_supplier_ids:
      record.suggestedSupplierIds || '',
    policy_version: record.policyVersion,
    reason: record.reason
  };
}

// POST /api/chat/process
// Process chat-created PRs and permanently save their decisions
router.post('/process', async (req, res) => {
  try {
    const { prNo } = req.body || {};

    if (
      typeof prNo !== 'string' ||
      !/^CHAT-PR-\d+$/.test(prNo)
    ) {
      return res.status(400).json({
        success: false,
        error: 'A valid chat PR number is required.'
      });
    }

    // Retrieve the chat PR from Neon
    const requests = await db.purchaseRequestLine.findMany({
      where: { prNo },
      orderBy: { prLine: 'asc' }
    });

    if (!requests.length) {
      return res.status(404).json({
        success: false,
        error: 'Purchase request not found.'
      });
    }

    // Load procurement master data and the active policy
    const [items, suppliers, history, contracts, policy] =
      await Promise.all([
        db.item.findMany(),
        db.supplier.findMany(),
        db.pOHistory.findMany(),
        db.contract.findMany({
          include: { lines: true }
        }),
        db.policyVersion.findFirst({
          where: { status: 'ACTIVE' },
          orderBy: { effectiveFrom: 'desc' }
        })
      ]);

    if (!policy) {
      return res.status(400).json({
        success: false,
        error: 'No active procurement policy found.'
      });
    }

    // Convert chat PRs to CSV for the existing decision engine
    const csvText = Papa.unparse(requests.map(toCsvRow));

    // Run the procurement decision engine
    const result = processBatch(
      csvText,
      { items, suppliers, history, contracts },
      policy
    );

    // SAVE ALL CALCULATED DECISIONS TO NEON POSTGRESQL
    if (result.rows.length > 0) {
      await db.$transaction(
        result.rows.map(row => {
          const decisionData = {
            resolvedItemCode:
              row.resolved_item_code || null,

            groupId:
              row.group_id || null,

            poId:
              row.po_id || null,

            decision:
              row.decision,

            route:
              row.route,

            supplierId:
              row.supplier_id || null,

            unitPrice:
              nullableDecimal(row.unit_price),

            groupValueInr:
              nullableDecimal(row.group_value_inr),

            suggestedSupplierIds:
              row.suggested_supplier_ids || null,

            policyVersion:
              row.policy_version || policy.version,

            reason:
              row.reason || ''
          };

          // Upsert avoids duplicate records when reprocessing a PR
          return db.procurementDecision.upsert({
            where: {
              prNo_prLine: {
                prNo: row.pr_no,
                prLine: Number(row.pr_line)
              }
            },

            update: decisionData,

            create: {
              prNo: row.pr_no,
              prLine: Number(row.pr_line),
              ...decisionData
            }
          });
        })
      );
    }

    console.log(
      `Saved ${result.rows.length} procurement decision(s) for ${prNo}`
    );

    // Return the same response expected by ChatIntake.jsx
    return res.json({
      success: true,
      prNo,
      summary: result.summary,
      rows: result.rows,
      purchaseOrders: result.purchaseOrders,
      supplierRanking: result.supplierRanking,
      csv: result.csv,
      supplierRankingCsv: result.supplierRankingCsv
    });

  } catch (error) {
    console.error('Chat PR processing failed:', error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/chat/decisions
// Retrieve previously saved chat procurement decisions
router.get('/decisions', async (req, res) => {
  try {
    const decisions =
      await db.procurementDecision.findMany({
        where: {
          prNo: {
            startsWith: 'CHAT-PR-'
          }
        },

        orderBy: [
          { createdAt: 'desc' },
          { prLine: 'asc' }
        ]
      });

    const rows = decisions.map(toDecisionRow);

    return res.json({
      success: true,
      count: rows.length,
      rows
    });

  } catch (error) {
    console.error(
      'Failed to retrieve saved decisions:',
      error
    );

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
