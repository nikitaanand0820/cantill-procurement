const express = require('express');
const { PrismaClient } = require('@prisma/client');
const Papa = require('papaparse');
const { rankSuppliers } = require('../services/decisionEngine');

const router = express.Router();
const db = new PrismaClient();

router.get('/export', async (req, res) => {
  try {
    const asOf = String(
      req.query.asOf || new Date().toISOString().slice(0, 10)
    );

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(asOf) ||
      Number.isNaN(Date.parse(asOf)) ||
      new Date(asOf).toISOString().slice(0, 10) !== asOf
    ) {
      return res.status(400).json({
        success: false,
        error: 'Valid asOf date required: YYYY-MM-DD'
      });
    }

    const [items, suppliers, history, contracts, policy] =
      await Promise.all([
        db.item.findMany({ orderBy: { itemCode: 'asc' } }),
        db.supplier.findMany(),
        db.pOHistory.findMany(),
        db.contract.findMany({ include: { lines: true } }),
        db.policyVersion.findFirst({
          where: {
            status: { in: ['ACTIVE', 'SUPERSEDED'] },
            effectiveFrom: {
              lte: new Date(asOf + 'T23:59:59.999Z')
            }
          },
          orderBy: [
            { effectiveFrom: 'desc' },
            { id: 'desc' }
          ]
        })
      ]);

    if (!policy) {
      return res.status(400).json({
        success: false,
        error: 'No approved policy effective on this date'
      });
    }

    const rows = [];

    for (const item of items) {
      const ranked = rankSuppliers(
        item.itemCode,
        asOf + 'T23:59:59.999Z',
        item,
        suppliers,
        history,
        contracts,
        policy.rules
      ).slice(0, 3);

      ranked.forEach((supplier, index) => {
        rows.push({
          item_code: item.itemCode,
          rank: index + 1,
          supplier_id: supplier.supplier_id,
          reference_price: supplier.reference_price ?? ''
        });
      });
    }

    const csv = Papa.unparse({
      fields: [
        'item_code',
        'rank',
        'supplier_id',
        'reference_price'
      ],
      data: rows
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="supplier-ranking-${asOf}.csv"`
    );

    return res.status(200).send(csv);

  } catch (error) {
    console.error('Supplier ranking export error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
