
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const db = new PrismaClient();

const ALLOWED_ROUTES = [
  'CONTRACT_PO',
  'EMERGENCY_PO',
  'SPOT_PO',
  'RFQ',
  'RFP',
  'NEW_ITEM_SOURCING',
  'CAPEX_SOURCING'
];

// Save an approval, rejection or override
router.post('/review', async (req, res) => {
  try {
    const {
      prNo,
      prLine,
      action,
      comment,
      route,
      supplierId,
      originalDecision
    } = req.body;

    const validActions = ['APPROVE', 'REJECT', 'OVERRIDE'];

    if (!prNo || !Number.isInteger(Number(prLine)) ||
        !validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Valid PR number, line and action are required.'
      });
    }

    if (action !== 'APPROVE' &&
        (!comment || !comment.trim())) {
      return res.status(400).json({
        success: false,
        error: 'A comment is required for rejection or override.'
      });
    }

    if (action === 'OVERRIDE' && !ALLOWED_ROUTES.includes(route)) {
      return res.status(400).json({
        success: false,
        error: 'Select a valid procurement route.'
      });
    }

    if (action === 'OVERRIDE' && supplierId) {
      const supplier = await db.supplier.findUnique({
        where: { supplierId }
      });

      if (!supplier || supplier.status.toUpperCase() !== 'ACTIVE') {
        return res.status(400).json({
          success: false,
          error: 'Override supplier must be active.'
        });
      }
    }

    const entityId = `${prNo}:${Number(prLine)}`;
    const stored = await db.procurementDecision.findUnique({
      where: { prNo_prLine: { prNo, prLine: Number(prLine) } }
    });
    if (!stored) return res.status(404).json({ success: false, error: 'No persisted procurement decision found for this PR. Process it through chat first.' });

    const effectiveRoute = action === 'OVERRIDE' ? route : stored.route;
    const effectiveSupplier = action === 'OVERRIDE' && supplierId ? supplierId : stored.supplierId;
    const documentType = ['CONTRACT_PO','EMERGENCY_PO','SPOT_PO'].includes(effectiveRoute) ? 'PO' :
      ['RFQ','RFP'].includes(effectiveRoute) ? effectiveRoute : 'SOURCING_REQUEST';
    if (action !== 'REJECT' && documentType === 'PO' && !effectiveSupplier)
      return res.status(400).json({ success:false, error:'A PO requires an eligible supplier.' });
    if (action !== 'REJECT' && effectiveSupplier) {
      const candidate = await db.supplier.findUnique({where:{supplierId:effectiveSupplier}});
      if (!candidate || candidate.status.toUpperCase() !== 'ACTIVE')
        return res.status(400).json({success:false,error:'PO supplier must be Active.'});
    }

    const result = await db.$transaction(async tx => {
      // Serialize approval for this PR so two simultaneous clicks cannot create duplicates.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${entityId}))`;
      const existing = await tx.procurementDocument.findUnique({where:{prNo_prLine:{prNo,prLine:Number(prLine)}}});
      if (action === 'REJECT' && existing)
        throw Object.assign(new Error('An issued procurement document already exists; rejection cannot cancel it.'),{status:409});
      if (action === 'OVERRIDE' && existing)
        throw Object.assign(new Error('Cannot override after a procurement document has been issued.'),{status:409});
      let document = existing;
      if (action !== 'REJECT' && !document) {
        const sequence = await tx.$queryRaw`SELECT nextval('procurement_document_seq')::text AS value`;
        const number = String(sequence[0].value).padStart(6,'0');
        document = await tx.procurementDocument.create({data:{
          documentNo:`${documentType}-${number}`, documentType, route:effectiveRoute,
          prNo,prLine:Number(prLine),groupId:stored.groupId,supplierId:effectiveSupplier || null,
          unitPrice:stored.unitPrice,groupValueInr:stored.groupValueInr,
          policyVersion:stored.policyVersion,createdBy:String(req.body.actor||'Buyer').slice(0,100)
        }});
      }
      const audit = await tx.auditLog.create({data:{
        actor:String(req.body.actor||'Buyer').slice(0,100), action, entityId,
        comment:comment?.trim() || null,
        details:{prNo,prLine:Number(prLine),originalDecision:stored.route,
          overriddenRoute:action==='OVERRIDE'?route:null,
          overriddenSupplier:action==='OVERRIDE'?supplierId||null:null,
          documentNo:document?.documentNo||null}
      }});
      return {audit,document};
    });
    res.json({success:true,message:result.document ? `${action} recorded; ${result.document.documentNo} created or already exists.` : `${action} recorded successfully`,...result});
  } catch (error) {
    console.error(error);

    res.status(error.status || 500).json({
      success: false,
      error: error.message
    });
  }
});

// List persisted downstream documents
router.get('/documents', async (_req,res) => {
  try { res.json({success:true,documents:await db.procurementDocument.findMany({orderBy:{createdAt:'desc'},take:200})}); }
  catch(e) {res.status(500).json({success:false,error:e.message});}
});

// Fetch latest review state and full audit history
router.get('/reviews', async (_req, res) => {
  try {
    const audits = await db.auditLog.findMany({
      where: {
        action: {
          in: ['APPROVE', 'REJECT', 'OVERRIDE']
        }
      },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' }
      ]
    });

    const latest = {};

    for (const audit of audits) {
      if (!latest[audit.entityId]) {
        latest[audit.entityId] = audit;
      }
    }

    res.json({
      success: true,
      latest,
      audits
    });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
