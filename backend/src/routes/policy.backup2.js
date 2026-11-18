const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const db = new PrismaClient();

const CONDITIONS = new Set(['CAPEX','ELIGIBLE_CONTRACT','EMERGENCY_WITH_HISTORY','LOW_VALUE_WITH_HISTORY','BELOW_THRESHOLD','AT_OR_ABOVE_THRESHOLD']);
const ROUTES = new Set(['CAPEX_SOURCING','CONTRACT_PO','EMERGENCY_PO','SPOT_PO','RFQ','RFP','NEW_ITEM_SOURCING']);
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const nonNegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function validateRules(rules) {
  const errors = [];
  if (!isObject(rules)) return ['Policy rules must be a JSON object.'];
  if (!Array.isArray(rules.decisions) || !rules.decisions.length) errors.push('decisions must be a nonempty array.');
  else {
    rules.decisions.forEach((rule, i) => {
      const label = `decisions[${i}]`;
      if (!isObject(rule)) { errors.push(`${label} must be an object.`); return; }
      if (!CONDITIONS.has(rule.condition)) errors.push(`${label}.condition is unsupported.`);
      if (!ROUTES.has(rule.route)) errors.push(`${label}.route is unsupported.`);
      if (typeof rule.outcome !== 'string' || !rule.outcome.trim()) errors.push(`${label}.outcome is required.`);
      if (rule.clause === undefined || rule.clause === null || String(rule.clause).trim() === '') errors.push(`${label}.clause is required.`);
      for (const field of ['maxValueInclusive','maxValueExclusive','minValueInclusive','suggestions']) {
        if (rule[field] !== undefined && !nonNegative(rule[field])) errors.push(`${label}.${field} must be a nonnegative number.`);
      }
      if (rule.condition === 'EMERGENCY_WITH_HISTORY' && !nonNegative(rule.maxValueInclusive)) errors.push(`${label}.maxValueInclusive is required.`);
      if (['LOW_VALUE_WITH_HISTORY','BELOW_THRESHOLD'].includes(rule.condition) && !nonNegative(rule.maxValueExclusive)) errors.push(`${label}.maxValueExclusive is required.`);
      if (rule.condition === 'AT_OR_ABOVE_THRESHOLD' && !nonNegative(rule.minValueInclusive)) errors.push(`${label}.minValueInclusive is required.`);
    });
    const conditions = rules.decisions.map(r => r?.condition);
    if (!conditions.includes('BELOW_THRESHOLD') || !conditions.includes('AT_OR_ABOVE_THRESHOLD')) errors.push('Both BELOW_THRESHOLD and AT_OR_ABOVE_THRESHOLD rules are required.');
    const below = rules.decisions.find(r => r?.condition === 'BELOW_THRESHOLD');
    const above = rules.decisions.find(r => r?.condition === 'AT_OR_ABOVE_THRESHOLD');
    if (below && above && below.maxValueExclusive !== above.minValueInclusive) errors.push('RFQ and RFP thresholds must meet without a gap or overlap.');
  }
  for (const [section, fields] of Object.entries({clubbing:['creationWindowDays','needByToleranceDays'],consolidation:['windowHours'],supplierRanking:['historyWindowDays']})) {
    if (!isObject(rules[section])) { errors.push(`${section} must be an object.`); continue; }
    for (const field of fields) if (!nonNegative(rules[section][field])) errors.push(`${section}.${field} must be a nonnegative number.`);
  }
  return errors;
}
function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === value ? date : null;
}

router.get('/versions', async (_req,res) => {
  try { res.json({success:true,versions:await db.policyVersion.findMany({orderBy:{id:'desc'}})}); }
  catch(e) { res.status(500).json({success:false,error:e.message}); }
});
router.get('/active', async (_req,res) => {
  try { res.json({success:true,policy:await db.policyVersion.findFirst({where:{status:'ACTIVE'},orderBy:{id:'desc'}})}); }
  catch(e) { res.status(500).json({success:false,error:e.message}); }
});
router.get('/audits', async (_req,res) => {
  try { res.json({success:true,audits:await db.auditLog.findMany({where:{entityId:{startsWith:'POLICY:'}},orderBy:{createdAt:'desc'},take:100})}); }
  catch(e) { res.status(500).json({success:false,error:e.message}); }
});
router.post('/validate', (req,res) => {
  const errors=validateRules(req.body.rules);
  res.status(errors.length?400:200).json({success:!errors.length,errors});
});
router.post('/versions', async (req,res) => {
  try {
    const {version,effectiveFrom,rules,comment}=req.body;
    const date=parseDate(effectiveFrom);
    const errors=validateRules(rules);
    if (!String(version||'').trim()) errors.push('Version is required.');
    if (!date) errors.push('Valid YYYY-MM-DD effective date is required.');
    if (!String(comment||'').trim()) errors.push('Justification is required.');
    if (errors.length) return res.status(400).json({success:false,error:errors.join(' '),errors});
    const policy=await db.$transaction(async tx => {
      const created=await tx.policyVersion.create({data:{version:String(version).trim(),effectiveFrom:date,status:'DRAFT',rules}});
      await tx.auditLog.create({data:{actor:'Buyer',action:'CREATE_POLICY_VERSION',entityId:`POLICY:${created.version}`,comment:comment.trim(),details:{version:created.version,effectiveFrom}}});
      return created;
    });
    res.status(201).json({success:true,policy});
  } catch(e) { res.status(e.code==='P2002'?409:500).json({success:false,error:e.code==='P2002'?'This policy version already exists.':e.message}); }
});
router.post('/versions/:id/activate', async (req,res) => {
  try {
    const id=Number(req.params.id);
    const comment=String(req.body?.comment||'').trim();
    const approvedBy=String(req.body?.approvedBy||'').trim();
    if (!Number.isInteger(id)||id<=0||!comment||!approvedBy) return res.status(400).json({success:false,error:'Valid policy ID, approver name, and approval justification are required.'});
    const policy=await db.$transaction(async tx => {
      // Serialize competing activations on PostgreSQL.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(927431)`;
      const target=await tx.policyVersion.findUnique({where:{id}});
      if (!target) throw Object.assign(new Error('Policy version not found.'),{status:404});
      if (target.status!=='DRAFT') throw Object.assign(new Error('Only DRAFT versions can be activated.'),{status:400});
      const errors=validateRules(target.rules);
      if (errors.length) throw Object.assign(new Error(`Invalid policy: ${errors.join(' ')}`),{status:400});
      const previous=await tx.policyVersion.findMany({where:{status:'ACTIVE'},select:{version:true}});
      await tx.policyVersion.updateMany({where:{status:'ACTIVE'},data:{status:'SUPERSEDED'}});
      const updated=await tx.policyVersion.update({where:{id},data:{status:'ACTIVE'}});
      await tx.auditLog.create({data:{actor:approvedBy,action:'ACTIVATE_POLICY_VERSION',entityId:`POLICY:${updated.version}`,comment,details:{version:updated.version,previousActiveVersions:previous.map(p=>p.version),effectiveFrom:updated.effectiveFrom.toISOString().slice(0,10)}}});
      return updated;
    });
    res.json({success:true,policy,message:`Policy ${policy.version} activated. New processing runs will use it.`});
  } catch(e) { res.status(e.status||500).json({success:false,error:e.message}); }
});
module.exports=router;
