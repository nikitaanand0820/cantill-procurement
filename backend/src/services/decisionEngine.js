
const Papa = require('papaparse');

const DAY = 86400000;
const HOUR = 3600000;

const num = value => Number(value ?? 0);

const timestamp = value => {
  if (value instanceof Date) return value.getTime();
  const s = String(value || '').trim().replace(' ', 'T');
  return Date.parse(
    s.endsWith('Z') || /[+-]\d\d:\d\d$/.test(s)
      ? s
      : s + 'Z'
  );
};

const norm = value =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const normalizeDescription = norm;

const daysBetween = (a, b) =>
  Math.abs(timestamp(a) - timestamp(b)) / DAY;

const withinPast = (when, asOf, days) =>
  timestamp(when) <= timestamp(asOf) &&
  timestamp(when) >= timestamp(asOf) - days * DAY;

const active = supplier =>
  supplier &&
  String(supplier.status).toLowerCase() === 'active';

// 1. Parse CSV and validate PR lines
function parseBatch(csvText) {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
    bom: true
  });

  if (parsed.errors.length) {
    throw new Error(parsed.errors[0].message);
  }

  const required = [
    'pr_no', 'pr_line', 'created_at', 'plant',
    'description', 'quantity', 'need_by_date', 'urgency'
  ];

  for (const col of required) {
    if (!parsed.meta.fields.includes(col)) {
      throw new Error(`Missing CSV column: ${col}`);
    }
  }

  return parsed.data.map((r, i) => {
    const quantity = Number(r.quantity);

    const price = r.estimated_unit_price?.trim()
      ? Number(r.estimated_unit_price)
      : null;

    const issues = [];

    if (
      !r.quantity?.trim() ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      issues.push('Invalid quantity');
    }

    if (
      !r.pr_no?.trim() ||
      !Number.isInteger(Number(r.pr_line)) ||
      Number(r.pr_line) < 1
    ) {
      issues.push('Invalid PR identifier');
    }

    if (!Number.isFinite(timestamp(r.created_at))) {
      issues.push('Invalid creation date');
    }

    if (!Number.isFinite(timestamp(r.need_by_date))) {
      issues.push('Invalid need-by date');
    }

    if (
      price !== null &&
      (!Number.isFinite(price) || price < 0)
    ) {
      issues.push('Invalid estimated price');
    }

    return {
      ...r,
      pr_line: Number(r.pr_line),
      quantity,
      estimated_unit_price: price,
      item_code: r.item_code?.trim() || null,
      urgency: r.urgency?.trim() || 'Normal',
      validation_error: issues.length
        ? `${issues.join('; ')} on CSV row ${i + 2}`
        : null
    };
  });
}

// 2. Match PR lines with item master
function matchItems(rows, items) {
  const byCode = new Map(
    items.map(i => [i.itemCode.toUpperCase(), i])
  );

  const byDescription = new Map(
    items.map(i => [norm(i.description), i])
  );

  return rows.map(r => {
    if (r.validation_error) {
      return {
        ...r,
        resolved_item_code: null,
        matched_item: null,
        new_item: false
      };
    }

    let item = r.item_code
      ? byCode.get(r.item_code.toUpperCase())
      : null;

    if (!item) {
      item = byDescription.get(norm(r.description));
    }

    // Conservative token-based description matching
    if (!item) {
      const tokens = norm(r.description)
        .split(' ')
        .filter(Boolean);

      const candidates = items.filter(i => {
        const master = norm(i.description)
          .split(' ')
          .filter(Boolean);

        return (
          tokens.length >= 2 &&
          tokens.length === master.length &&
          tokens.every(t => master.includes(t))
        );
      });

      if (candidates.length === 1) {
        item = candidates[0];
      }
    }

    return {
      ...r,
      resolved_item_code: item?.itemCode || null,
      matched_item: item || null,
      new_item: !item
    };
  });
}

// 3. Club PR lines into requirements
function clubRequirements(rows, policy = {}) {
  const creationDays = num(
    policy.clubbing?.creationWindowDays ?? 14
  );

  const needDays = num(
    policy.clubbing?.needByToleranceDays ?? 7
  );

  const sorted = [...rows].sort((a, b) =>
    timestamp(a.created_at) - timestamp(b.created_at) ||
    String(a.pr_no).localeCompare(String(b.pr_no)) ||
    a.pr_line - b.pr_line
  );

  const groups = [];

  for (const row of sorted) {
    let group = null;

    if (!row.validation_error && row.resolved_item_code) {
      group = groups.find(g =>
        g.item_code === row.resolved_item_code &&
        g.plant === row.plant &&
        timestamp(row.created_at) >= timestamp(g.created_at) &&
        timestamp(row.created_at) - timestamp(g.created_at)
          <= creationDays * DAY &&
        daysBetween(row.need_by_date, g.need_by_date)
          <= needDays
      );
    }

    if (group) {
      group.lines.push(row);
      group.total_quantity += row.quantity;

      if (
        String(row.urgency).toLowerCase() === 'emergency'
      ) {
        group.urgency = 'Emergency';
      }
    } else {
      groups.push({
        group_id:
          `GRP-${String(groups.length + 1).padStart(4, '0')}`,
        lines: [row],
        item_code: row.resolved_item_code,
        item: row.matched_item,
        plant: row.plant,
        total_quantity: row.quantity,
        created_at: row.created_at,
        need_by_date: row.need_by_date,
        urgency: row.urgency
      });
    }
  }

  return groups;
}

// 4. Rank eligible suppliers
function rankSuppliers(
  itemCode,
  asOf,
  item,
  suppliers,
  history,
  contracts,
  policy = {}
) {
  if (!itemCode) return [];

  const window = num(
    policy.supplierRanking?.historyWindowDays ?? 548
  );

  const eligible = suppliers.filter(active);

  const scored = eligible.map(s => {
    const purchases = history
      .filter(h =>
        h.itemCode === itemCode &&
        h.supplierId === s.supplierId &&
        withinPast(h.poDate, asOf, window)
      )
      .sort((a, b) =>
        timestamp(b.poDate) - timestamp(a.poDate)
      );

    const contractMatches = contracts
      .filter(c =>
        c.supplierId === s.supplierId &&
        timestamp(c.startDate) <= timestamp(asOf) &&
        c.lines.some(l => l.itemCode === itemCode)
      )
      .sort((a, b) =>
        timestamp(b.startDate) - timestamp(a.startDate)
      );

    const preferred =
      purchases.length > 0 || contractMatches.length > 0;

    const categoryMatch = String(s.categories || '')
      .toLowerCase()
      .split(/[,;|]/)
      .map(x => x.trim())
      .includes(String(item?.category || '').toLowerCase());

    if (!preferred && !categoryMatch) return null;

    const reference = purchases.length
      ? num(purchases[0].unitPrice)
      : contractMatches.length
        ? num(
            contractMatches[0].lines.find(
              l => l.itemCode === itemCode
            ).rate
          )
        : null;

    const recency = purchases.length
      ? Math.max(
          0,
          1 -
          (timestamp(asOf) - timestamp(purchases[0].poDate)) /
          (window * DAY)
        )
      : 0;

    const score =
      (preferred ? 10000 : 0) +
      Math.min(purchases.length, 100) * 30 +
      recency * 100 +
      (contractMatches.length ? 60 : 0) +
      num(s.onTimePct) * 2 +
      num(s.qualityRating) * 20;

    return {
      supplier_id: s.supplierId,
      reference_price: reference,
      score,
      preferred
    };
  }).filter(Boolean);

  return scored.sort((a, b) =>
    b.score - a.score ||
    a.supplier_id.localeCompare(b.supplier_id)
  );
}

// 5. Select cheapest eligible contract
function chooseContract(
  group,
  contracts,
  suppliersById,
  consumed
) {
  const asOf = group.created_at;
  const candidates = [];
  const applicable = [];

  for (const contract of contracts) {
    if (!active(suppliersById.get(contract.supplierId))) {
      continue;
    }

    if (
      timestamp(contract.startDate) > timestamp(asOf) ||
      timestamp(contract.endDate) < timestamp(asOf)
    ) {
      continue;
    }

    for (const line of contract.lines) {
      if (
        line.itemCode !== group.item_code ||
        (
          group.item?.uom &&
          norm(line.uom) !== norm(group.item.uom)
        )
      ) {
        continue;
      }

      const value =
        group.total_quantity * num(line.rate);

      const candidate = {
        contract,
        rate: num(line.rate),
        value
      };

      applicable.push(candidate);

      const used =
        num(contract.consumedValue) +
        (consumed.get(contract.contractId) || 0);

      if (
        used + value <= num(contract.valueCap) + 1e-7
      ) {
        candidates.push(candidate);
      }
    }
  }

  const sort = (a, b) =>
    a.rate - b.rate ||
    a.contract.contractId.localeCompare(
      b.contract.contractId
    );

  candidates.sort(sort);
  applicable.sort(sort);

  return {
    selected: candidates[0] || null,
    cheapestApplicable: applicable[0] || null
  };
}

// 6. Find latest historical PO
function latestItemPO(
  itemCode,
  asOf,
  history,
  window = 365
) {
  return history
    .filter(h =>
      h.itemCode === itemCode &&
      withinPast(h.poDate, asOf, window)
    )
    .sort((a, b) =>
      timestamp(b.poDate) - timestamp(a.poDate)
    )[0] || null;
}

// 7. Apply policy rules in order
function applyDecision(group, data, policy, consumed) {
  const { suppliers, contracts, history } = data;

  const suppliersById = new Map(
    suppliers.map(s => [s.supplierId, s])
  );

  if (group.lines[0].validation_error) {
    return {
      route: 'NOT_PROCESSED',
      decision: 'NOT_PROCESSED',
      reason: group.lines[0].validation_error,
      supplier_id: '',
      unit_price: null,
      group_value_inr: null,
      suggested_supplier_ids: '',
      reference: '',
      clause: ''
    };
  }

  if (!group.item_code) {
    const price =
      group.lines[0].estimated_unit_price;

    return {
      route: 'NEW_ITEM_SOURCING',
      decision: 'SOURCING_REQUEST',
      reason:
        'No unambiguous item-master match; sourcing required',
      supplier_id: '',
      unit_price: price,
      group_value_inr:
        price === null
          ? null
          : price * group.total_quantity,
      suggested_supplier_ids: '',
      reference: '',
      clause: '1'
    };
  }

  const ranking = rankSuppliers(
    group.item_code,
    group.created_at,
    group.item,
    suppliers,
    history,
    contracts,
    policy
  );

  const contract = chooseContract(
    group,
    contracts,
    suppliersById,
    consumed
  );

  const recent = latestItemPO(
    group.item_code,
    group.created_at,
    history
  );

  const rate =
    contract.selected?.rate ??
    contract.cheapestApplicable?.rate ??
    (recent
      ? num(recent.unitPrice)
      : num(group.item.standardPrice));

  const value = group.total_quantity * rate;

  const isCapex =
    String(group.item.itemType).toLowerCase() === 'capex';

  const hasActiveRecentSupplier = history.some(h =>
    h.itemCode === group.item_code &&
    active(suppliersById.get(h.supplierId)) &&
    withinPast(h.poDate, group.created_at, 365)
  );

  let chosen = null;

  for (const rule of policy.decisions || []) {
    const condition = rule.condition;

    const matches =
      condition === 'CAPEX'
        ? isCapex
        : condition === 'ELIGIBLE_CONTRACT'
          ? !!contract.selected
          : condition === 'EMERGENCY_WITH_HISTORY'
            ? (
                String(group.urgency).toLowerCase() ===
                  'emergency' &&
                hasActiveRecentSupplier &&
                value <= num(
                  rule.maxValueInclusive ?? 500000
                )
              )
            : condition === 'LOW_VALUE_WITH_HISTORY'
              ? (
                  hasActiveRecentSupplier &&
                  value < num(
                    rule.maxValueExclusive ?? 200000
                  )
                )
              : condition === 'BELOW_THRESHOLD'
                ? value < num(
                    rule.maxValueExclusive ?? 1000000
                  )
                : condition === 'AT_OR_ABOVE_THRESHOLD'
                  ? value >= num(
                      rule.minValueInclusive ?? 1000000
                    )
                  : false;

    if (matches) {
      chosen = rule;
      break;
    }
  }

  if (!chosen) {
    return {
      route: 'NOT_PROCESSED',
      decision: 'NOT_PROCESSED',
      reason: 'No matching policy rule',
      supplier_id: '',
      unit_price: rate,
      group_value_inr: value,
      suggested_supplier_ids: '',
      reference: '',
      clause: ''
    };
  }

  const route = chosen.route;
  const isPO = chosen.outcome === 'PO';

  let supplierId = '';
  let unitPrice = rate;
  let reference = '';

  if (route === 'CONTRACT_PO') {
    supplierId = contract.selected.contract.supplierId;
    unitPrice = contract.selected.rate;
    reference = contract.selected.contract.contractId;

    consumed.set(
      reference,
      (consumed.get(reference) || 0) +
      contract.selected.value
    );
  } else if (isPO) {
    const candidates = ranking.filter(s =>
      history.some(h =>
        h.itemCode === group.item_code &&
        h.supplierId === s.supplier_id &&
        withinPast(h.poDate, group.created_at, 365)
      )
    );

    const supplier = candidates[0];

    if (!supplier) {
      return {
        route: 'NOT_PROCESSED',
        decision: 'NOT_PROCESSED',
        reason:
          'No eligible supplier with 365-day PO history',
        supplier_id: '',
        unit_price: rate,
        group_value_inr: value,
        suggested_supplier_ids: '',
        reference: '',
        clause: chosen.clause
      };
    }

    supplierId = supplier.supplier_id;
    unitPrice = supplier.reference_price ?? rate;

    reference =
      latestItemPO(
        group.item_code,
        group.created_at,
        history.filter(
          h => h.supplierId === supplierId
        )
      )?.poNumber || '';
  }

  const suggestions = isPO
    ? []
    : ranking.slice(
        0,
        num(chosen.suggestions ?? 0)
      );

  const valuationSource = contract.selected
    ? 'eligible contract'
    : contract.cheapestApplicable
      ? 'contract rate (ceiling exhausted)'
      : recent
        ? 'latest item PO within 365 days'
        : 'item standard price';

  return {
    route,
    decision: isPO ? 'PO' : 'SOURCING_REQUEST',
    supplier_id: supplierId,
    unit_price: unitPrice,
    group_value_inr:
      group.total_quantity * unitPrice,
    suggested_supplier_ids:
      suggestions.map(s => s.supplier_id).join(';'),
    reference,
    clause: chosen.clause,
    reason:
      `Policy ${chosen.clause}: ${route}; ` +
      `valuation ${valuationSource}; ` +
      `reference ${reference || 'none'}`
  };
}

// 8. Required CSV output columns
const OUTPUT_COLUMNS = [
  'pr_no',
  'pr_line',
  'resolved_item_code',
  'group_id',
  'po_id',
  'decision',
  'route',
  'supplier_id',
  'unit_price',
  'group_value_inr',
  'suggested_supplier_ids',
  'policy_version',
  'reason'
];

// 9. Process complete batch
function processBatch(csvText, data, policyRecord) {
  const policy =
    policyRecord?.rules || policyRecord || {};

  const version =
    policyRecord?.version || 'unknown';

  const rows = matchItems(
    parseBatch(csvText),
    data.items
  );

  const groups = clubRequirements(rows, policy);

  const consumed = new Map();
  const pos = [];
  const output = [];
  const rankingOutput = [];

  for (const group of groups) {
    const result = applyDecision(
      group,
      data,
      policy,
      consumed
    );

    let poId = '';

    if (result.decision === 'PO') {
      const windowHours = num(
        policy.consolidation?.windowHours ?? 24
      );

      let po = pos.find(p =>
        p.supplier_id === result.supplier_id &&
        p.plant === group.plant &&
        p.route === result.route &&
        timestamp(group.created_at) >=
          timestamp(p.created_at) &&
        timestamp(group.created_at) -
          timestamp(p.created_at) <=
          windowHours * HOUR
      );

      if (!po) {
        po = {
          po_id:
            `PO-${String(pos.length + 1).padStart(5, '0')}`,
          supplier_id: result.supplier_id,
          plant: group.plant,
          route: result.route,
          created_at: group.created_at,
          group_ids: []
        };

        pos.push(po);
      }

      po.group_ids.push(group.group_id);
      poId = po.po_id;
    }

    for (const row of group.lines) {
      output.push({
        pr_no: row.pr_no,
        pr_line: row.pr_line,
        resolved_item_code:
          row.resolved_item_code || '',
        group_id: group.group_id,
        po_id: poId,
        decision: result.decision,
        route: result.route,
        supplier_id: result.supplier_id,
        unit_price: result.unit_price ?? '',
        group_value_inr:
          result.group_value_inr ?? '',
        suggested_supplier_ids:
          result.suggested_supplier_ids,
        policy_version: version,
        reason: result.reason
      });
    }

    if (
      group.item_code &&
      !group.lines[0].validation_error
    ) {
      rankSuppliers(
        group.item_code,
        group.created_at,
        group.item,
        data.suppliers,
        data.history,
        data.contracts,
        policy
      )
        .slice(0, 3)
        .forEach((supplier, index) => {
          rankingOutput.push({
            item_code: group.item_code,
            rank: index + 1,
            supplier_id: supplier.supplier_id,
            reference_price:
              supplier.reference_price ?? ''
          });
        });
    }
  }

  output.sort((a, b) =>
    a.pr_no.localeCompare(b.pr_no) ||
    a.pr_line - b.pr_line
  );

  return {
    rows: output,
    groups,
    purchaseOrders: pos,
    supplierRanking: rankingOutput,

    csv: Papa.unparse({
      fields: OUTPUT_COLUMNS,
      data: output.map(row =>
        OUTPUT_COLUMNS.map(key => row[key])
      )
    }),

    supplierRankingCsv: Papa.unparse(
      rankingOutput,
      {
        columns: [
          'item_code',
          'rank',
          'supplier_id',
          'reference_price'
        ]
      }
    ),

    summary: {
      total: output.length,
      groups: groups.length,
      purchaseOrders: pos.length,
      notProcessed: output.filter(
        row => row.decision === 'NOT_PROCESSED'
      ).length
    }
  };
}

module.exports = {
  parseBatch,
  normalizeDescription,
  matchItems,
  clubRequirements,
  rankSuppliers,
  chooseContract,
  applyDecision,
  processBatch,
  OUTPUT_COLUMNS
};
