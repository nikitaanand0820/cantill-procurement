require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const dir = path.resolve(__dirname, '../../data');
function read(file) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  const result = Papa.parse(text, {header:true, skipEmptyLines:true});
  if (result.errors.length) throw new Error(JSON.stringify(result.errors));
  return result.data;
}
const date = s => new Date(s+'T00:00:00Z');
async function main() {
  for(const x of read('master_data/item_master.csv')) await db.item.upsert({where:{itemCode:x.item_code},update:{},create:{itemCode:x.item_code,description:x.description,uom:x.uom,category:x.category,itemType:x.item_type,standardPrice:x.standard_price}});
  for(const x of read('master_data/supplier_master.csv')) await db.supplier.upsert({where:{supplierId:x.supplier_id},update:{},create:{supplierId:x.supplier_id,name:x.name,city:x.city,categories:x.categories,status:x.status,onTimePct:Number(x.on_time_pct),qualityRating:Number(x.quality_rating)}});
  for(const x of read('master_data/plants.csv')) await db.plant.upsert({where:{plant:x.plant},update:{},create:{plant:x.plant,name:x.name}});
  await db.pOHistory.deleteMany();
  for(const x of read('master_data/po_history.csv')) await db.pOHistory.create({data:{poNumber:x.po_number,poDate:date(x.po_date),supplierId:x.supplier_id,itemCode:x.item_code,quantity:x.quantity,uom:x.uom,unitPrice:x.unit_price,plant:x.plant,deliveredOnTime:['true','yes','1','y'].includes(String(x.delivered_on_time).toLowerCase())}});
  for(const x of read('contracts/contract_register.csv')) await db.contract.upsert({where:{contractId:x.contract_id},update:{},create:{contractId:x.contract_id,supplierId:x.supplier_id,startDate:date(x.start_date),endDate:date(x.end_date),valueCap:x.value_cap,consumedValue:x.consumed_value}});
  await db.contractLine.deleteMany();
  for(const x of read('contracts/contract_lines.csv')) await db.contractLine.create({data:{contractId:x.contract_id,itemCode:x.item_code,description:x.description,uom:x.uom,rate:x.rate}});
  console.log('Imported item, supplier, plant, PO history, contract register and contract lines.');
  console.log('PDF-only contracts must still be verified and imported separately.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
