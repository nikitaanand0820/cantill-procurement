require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const app = express();
app.use(cors());
app.use(express.json());
app.get('/api/health', (_req,res)=>res.json({success:true,message:'Cantill Procurement Backend Running'}));
app.get('/api/summary', async (_req,res)=>{
 try { const [items,suppliers,plants,contracts,history] = await Promise.all([db.item.count(),db.supplier.count(),db.plant.count(),db.contract.count(),db.pOHistory.count()]);res.json({items,suppliers,plants,contracts,history}); }
 catch(e){res.status(500).json({error:'Database not ready',details:e.message})}
});
app.get('/api/items', async (_req,res)=>{try{res.json(await db.item.findMany({take:100,orderBy:{itemCode:'asc'}}))}catch(e){res.status(500).json({error:e.message})}});


const multer = require('multer');
const { processBatch } = require('./services/decisionEngine');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

app.post('/api/process-batch', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Please upload a CSV file.'
      });
    }

    // Explicit version is for reproducible blind-test runs; otherwise
    // use the most recently effective approved policy as of today.
    const requestedVersion = String(req.query.policyVersion || '').trim();
    const asOf = String(req.query.asOf || new Date().toISOString().slice(0, 10));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) ||
        Number.isNaN(Date.parse(asOf)) ||
        new Date(asOf).toISOString().slice(0, 10) !== asOf) {
      return res.status(400).json({ success: false, error: 'asOf must be YYYY-MM-DD.' });
    }
    const policyWhere = requestedVersion
      ? { version: requestedVersion, status: { in: ['ACTIVE', 'SUPERSEDED'] } }
      : { status: { in: ['ACTIVE', 'SUPERSEDED'] },
          effectiveFrom: { lte: new Date(`${asOf}T23:59:59.999Z`) } };

    const [items, suppliers, contracts, history, policy] =
      await Promise.all([
        db.item.findMany(),
        db.supplier.findMany(),
        db.contract.findMany({ include: { lines: true } }),
        db.pOHistory.findMany(),
        db.policyVersion.findFirst({
          where: policyWhere,
          orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }]
        })
      ]);

    if (!policy) {
      return res.status(400).json({
        success: false,
        error: requestedVersion ? 'Requested approved policy version not found.' : 'No approved policy effective on the selected date.'
      });
    }

    const result = processBatch(
      req.file.buffer.toString('utf8'),
      { items, suppliers, contracts, history },
      policy
    );

    return res.json({
      success: true,
      summary: result.summary,
      rows: result.rows,
      purchaseOrders: result.purchaseOrders,
      csv: result.csv,
      supplierRankingCsv: result.supplierRankingCsv
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
const contractRoutes = require('./routes/contracts');
app.use('/api/contracts',contractRoutes);
const buyerRoutes = require('./routes/buyer');
app.use('/api/buyer', buyerRoutes);
const chatRoutes = require('./routes/chat');
app.use('/api/chat', chatRoutes);
const policyRoutes = require('./routes/policy');
app.use('/api/policy', policyRoutes);
const port=Number(process.env.PORT||5000);
const chatProcessingRoutes = require('./routes/chatProcessing');
app.use('/api/chat', chatProcessingRoutes);
app.use('/api/supplier-ranking', require('./routes/supplierRanking'));
app.listen(port,()=>console.log(`API listening at http://localhost:${port}`));
