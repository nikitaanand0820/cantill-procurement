
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

const rules = {
  document: 'CORVO-PROC-POL-04',
  currency: 'INR',
  plants: ['PUN1', 'CHK1'],
  itemMatching: {
    newItemRoute: 'NEW_ITEM_SOURCING',
    newItemsClubbed: false
  },
  clubbing: {
    creationWindowDays: 14,
    needByToleranceDays: 7,
    sameItem: true,
    samePlant: true,
    anchor: 'FIRST_LINE'
  },
  valuation: {
    priority: ['CONTRACT_RATE', 'LATEST_PO_365_DAYS', 'STANDARD_PRICE']
  },
  contracts: {
    activeSupplierOnly: true,
    requireAvailableCeiling: true,
    selection: 'LOWEST_ELIGIBLE_RATE'
  },
  supplierRanking: {
    historyWindowDays: 548,
    referencePrice: 'LATEST_SUPPLIER_PO_OR_CONTRACT'
  },
  decisions: [
    { clause: '5.1', condition: 'CAPEX', route: 'CAPEX_SOURCING', outcome: 'SOURCING_REQUEST', suggestions: 5 },
    { clause: '5.2', condition: 'ELIGIBLE_CONTRACT', route: 'CONTRACT_PO', outcome: 'PO' },
    { clause: '5.3', condition: 'EMERGENCY_WITH_HISTORY', maxValueInclusive: 500000, route: 'EMERGENCY_PO', outcome: 'PO' },
    { clause: '5.4', condition: 'LOW_VALUE_WITH_HISTORY', maxValueExclusive: 200000, route: 'SPOT_PO', outcome: 'PO' },
    { clause: '5.5', condition: 'BELOW_THRESHOLD', maxValueExclusive: 1000000, route: 'RFQ', outcome: 'SOURCING_REQUEST', suggestions: 3 },
    { clause: '5.6', condition: 'AT_OR_ABOVE_THRESHOLD', minValueInclusive: 1000000, route: 'RFP', outcome: 'SOURCING_REQUEST', suggestions: 5 }
  ],
  consolidation: {
    windowHours: 24,
    sameSupplier: true,
    samePlant: true,
    sameRoute: true
  },
  excludeSupplierStatuses: ['Blocked', 'Inactive']
};

async function main() {
  const result = await db.policyVersion.upsert({
    where: { version: '5.0' },
    update: {
      effectiveFrom: new Date('2026-04-01T00:00:00Z'),
      status: 'ACTIVE',
      rules
    },
    create: {
      version: '5.0',
      effectiveFrom: new Date('2026-04-01T00:00:00Z'),
      status: 'ACTIVE',
      rules
    }
  });

  console.log('Policy v5.0 saved successfully. ID:', result.id);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
