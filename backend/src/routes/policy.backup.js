
const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const db = new PrismaClient();

// View all policy versions
router.get('/versions', async (_req, res) => {
  try {
    const versions = await db.policyVersion.findMany({
      orderBy: { id: 'desc' }
    });

    res.json({ success: true, versions });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// View the active policy
router.get('/active', async (_req, res) => {
  try {
    const policy = await db.policyVersion.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { effectiveFrom: 'desc' }
    });

    res.json({ success: true, policy });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create a new draft policy version
router.post('/versions', async (req, res) => {
  try {
    const { version, effectiveFrom, rules, comment } = req.body;

    if (!version || !effectiveFrom ||
        !rules || typeof rules !== 'object' ||
        Array.isArray(rules) ||
        !comment?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Version, date, rules object and justification are required.'
      });
    }

    const date = new Date(`${effectiveFrom}T00:00:00.000Z`);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) ||
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== effectiveFrom
    ) {
      return res.status(400).json({
        success: false,
        error: 'Use a valid YYYY-MM-DD effective date.'
      });
    }

    const policy = await db.$transaction(async tx => {
      const created = await tx.policyVersion.create({
        data: {
          version: String(version).trim(),
          effectiveFrom: date,
          status: 'DRAFT',
          rules
        }
      });

      await tx.auditLog.create({
        data: {
          actor: 'Buyer',
          action: 'CREATE_POLICY_VERSION',
          entityId: `POLICY:${created.version}`,
          comment: comment.trim(),
          details: {
            version: created.version,
            effectiveFrom
          }
        }
      });

      return created;
    });

    res.status(201).json({ success: true, policy });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
