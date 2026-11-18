const express = require('express');
const {PrismaClient} = require('@prisma/client');
const router = express.Router();
const db = new PrismaClient();
const date = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? new Date(`${value}T00:00:00.000Z`) : null;
router.get('/', async (_req,res) => {
  try {res.json({success:true,contracts:await db.contract.findMany({include:{lines:true},orderBy:{startDate:'desc'}})});}
  catch(e){res.status(500).json({success:false,error:e.message});}
});
router.post('/', async (req,res) => {
  try {
    const {contractId,supplierId,startDate,endDate,valueCap,consumedValue=0,lines,source='PDF_MANUAL',comment} = req.body;
    const start=date(startDate), end=date(endDate);
    if (!contractId || !supplierId || !start || !end || start>end || !Array.isArray(lines) || !lines.length)
      return res.status(400).json({success:false,error:'Contract ID, supplier, valid dates and at least one item line required.'});
    const cap=Number(valueCap), consumed=Number(consumedValue);
    if (!Number.isFinite(cap)||cap<=0||!Number.isFinite(consumed)||consumed<0||consumed>cap)
      return res.status(400).json({success:false,error:'Invalid contract ceiling or consumed value.'});
    const supplier=await db.supplier.findUnique({where:{supplierId}});
    if (!supplier) return res.status(400).json({success:false,error:'Supplier does not exist.'});
    const clean=[];
    for (const line of lines) {
      const item=await db.item.findUnique({where:{itemCode:String(line.itemCode||'')}});
      if (!item || !Number.isFinite(Number(line.rate)) || Number(line.rate)<=0)
        return res.status(400).json({success:false,error:`Invalid item code or rate: ${line.itemCode}`});
      clean.push({itemCode:item.itemCode,description:String(line.description||item.description),uom:String(line.uom||item.uom),rate:Number(line.rate)});
    }
    const contract=await db.$transaction(async tx=>{
      const created=await tx.contract.create({data:{contractId:String(contractId).trim(),supplierId,startDate:start,endDate:end,valueCap:cap,consumedValue:consumed,source:String(source),lines:{create:clean}} ,include:{lines:true}});
      await tx.auditLog.create({data:{actor:'Buyer',action:'ADD_CONTRACT',entityId:`CONTRACT:${created.contractId}`,comment:String(comment||'Manual entry from signed contract'),details:{supplierId,source,lines:clean.length}}});
      return created;
    });
    res.status(201).json({success:true,contract});
  } catch(e) {res.status(e.code==='P2002'?409:500).json({success:false,error:e.code==='P2002'?'Contract ID already exists.':e.message});}
});
module.exports=router;
