
const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const db = new PrismaClient();

const REQUIRED = [
  ['description', 'What item do you need?'],
  ['quantity', 'How many units do you need?'],
  ['uom', 'What is the unit of measurement (pieces, kg, boxes, etc.)?'],
  ['plant', 'Which plant needs the item?'],
  ['needByDate', 'When do you need it? Please use YYYY-MM-DD.'],
  ['urgency', 'Is this a NORMAL or EMERGENCY request?'],
  ['requester', 'What is your name?'],
  ['department', 'Which department are you from?']
];

function nextQuestion(draft) {
  return REQUIRED.find(([field]) => {
    const value = draft[field];
    return value === undefined || value === null || value === '';
  });
}

function extractDetails(message, existing = {}) {
  const draft = { ...existing };
  const text = String(message || '').trim();

  // Examples: "20 safety helmets", "I need 15 boxes of gloves"
  const itemMatch = text.match(
    /(?:i need|need|request|order|buy)\s+(\d+(?:\.\d+)?)\s+(?:(pieces?|pcs?|units?|boxes?|kg|litres?|liters?)\s+(?:of\s+)?)?(.+?)(?:\s+for\s+(?:our\s+|the\s+)?[\w\s-]+\s+plant|\s+by\s+\d{4}-\d{2}-\d{2}|[.!]|$)/i
  );

  if (itemMatch) {
    draft.quantity = Number(itemMatch[1]);
    draft.uom = itemMatch[2] || draft.uom || 'pcs';
    draft.description = itemMatch[3].trim();
  }

  const plantMatch = text.match(
    /(?:for|at|in)\s+(?:our\s+|the\s+)?([a-z][a-z\s-]*?)\s+plant\b/i
  );

  if (plantMatch) {
    draft.plant = plantMatch[1].trim();
  }

  const dateMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);

  if (dateMatch) {
    draft.needByDate = dateMatch[1];
  }

  if (/\bemergency\b/i.test(text)) {
    draft.urgency = 'EMERGENCY';
  } else if (/\bnormal\b/i.test(text)) {
    draft.urgency = 'NORMAL';
  }

  return draft;
}

// Conversational intake: extract fields and ask follow-up questions
router.post('/message', async (req, res) => {
  try {
    const { message, draft = {} } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Please enter a message.'
      });
    }

    const updated = extractDetails(message, draft);

const missingBefore = nextQuestion(draft);

if (missingBefore && !updated[missingBefore[0]]) {
  const field = missingBefore[0];
  const answer = message.trim();

  if (field === 'quantity') {
    updated.quantity = Number(answer);
  } else if (field === 'urgency') {
    updated.urgency = answer.toUpperCase();
  } else {
    updated[field] = answer;
  }
}
    const missing = nextQuestion(updated);

    return res.json({
      success: true,
      draft: updated,
      complete: !missing,
      reply: missing
        ? missing[1]
        : 'I have all the required details. Please review and confirm your purchase request.'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create a purchase request after employee confirmation
router.post('/submit', async (req, res) => {
  try {
    const draft = req.body.draft || {};
    const missing = nextQuestion(draft);

    if (missing) {
      return res.status(400).json({
        success: false,
        error: `Missing field: ${missing[0]}`
      });
    }

    const quantity = Number(draft.quantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Quantity must be greater than zero.'
      });
    }

    const dateText = String(draft.needByDate);
    const needByDate = new Date(`${dateText}T00:00:00.000Z`);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dateText) ||
      Number.isNaN(needByDate.getTime()) ||
      needByDate.toISOString().slice(0, 10) !== dateText
    ) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid date in YYYY-MM-DD format.'
      });
    }

    if (!['NORMAL', 'EMERGENCY'].includes(
      String(draft.urgency).toUpperCase()
    )) {
      return res.status(400).json({
        success: false,
        error: 'Urgency must be NORMAL or EMERGENCY.'
      });
    }

    // Match an existing plant
    const plants = await db.plant.findMany();

    const plant = plants.find(p =>
      p.plant.toLowerCase() === String(draft.plant).toLowerCase() ||
      p.name.toLowerCase() === String(draft.plant).toLowerCase()
    );

    if (!plant) {
      return res.status(400).json({
        success: false,
        error: 'Plant not found. Please use an existing plant name or code.'
      });
    }

    // Generate a unique PR number using a database sequence
    const created = await db.$transaction(async tx => {
      const sequence = await tx.$queryRaw`
        SELECT nextval('chat_pr_number_seq') AS id
      `;

      const id = Number(sequence[0].id);
      const prNo = `CHAT-PR-${String(id).padStart(6, '0')}`;

      const pr = await tx.purchaseRequestLine.create({
        data: {
          prNo,
          prLine: 1,
          createdAt: new Date(),
          requester: String(draft.requester).trim(),
          department: String(draft.department).trim(),
          plant: plant.plant,
          itemCode: null,
          description: String(draft.description).trim(),
          quantity,
          uom: String(draft.uom).trim(),
          estimatedUnitPrice: null,
          needByDate,
          urgency: String(draft.urgency).toUpperCase()
        }
      });

      await tx.auditLog.create({
        data: {
          actor: pr.requester,
          action: 'CREATE_PR',
          entityId: `${pr.prNo}:${pr.prLine}`,
          comment: 'Created through employee chat intake',
          details: {
            description: pr.description,
            quantity,
            plant: pr.plant,
            urgency: pr.urgency
          }
        }
      });

      return pr;
    });

    return res.json({
      success: true,
      message: 'Purchase request created successfully.',
      prNo: created.prNo,
      prLine: created.prLine
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
