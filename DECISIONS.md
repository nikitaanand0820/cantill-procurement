
# Procurement Decisions and Policy Logic

## 1. Purpose

This document explains the reasoning behind the procurement decision engine developed for the Cantill.ai Full-Stack Engineering Internship Assignment.

The system is designed to produce explainable, policy-driven procurement recommendations while retaining human buyer oversight.

The objective is not simply to assign a procurement route, but to make each decision traceable to its inputs, policy version, contract eligibility, supplier information, and applicable procurement conditions.

## 2. Decision Processing Pipeline

The engine follows this conceptual pipeline:

```text
Purchase Request Input
        |
        v
Parse and Validate PR Lines
        |
        v
Resolve Item Codes
        |
        v
Club Compatible Requirements
        |
        v
Estimate Requirement Value
        |
        v
Evaluate Contracts and Supplier History
        |
        v
Apply Versioned Procurement Policy
        |
        v
Determine Procurement Route
        |
        v
Recommend Suppliers
        |
        v
Consolidate Compatible PO Decisions
        |
        v
Generate Decision Explanations and CSV
        |
        v
Buyer Review and Audit
```

## 3. Item Resolution

The engine attempts to resolve each PR line against the item master.

Item descriptions are normalized before matching to reduce differences caused by formatting and wording.

The objective is to identify the most appropriate existing item code.

When a requirement cannot be confidently resolved to an existing item, it is treated as a new-item sourcing requirement rather than being silently assigned an incorrect item.

The configured new-item route is:

`NEW_ITEM_SOURCING`

New items are not clubbed under the current policy configuration.

### Design rationale

Incorrect item matching can cause wrong contract selection, pricing, supplier recommendations, and procurement routes.

An explicit new-item exception is safer than forcing a potentially inaccurate match.

## 4. Requirement Clubbing

Multiple PR lines may represent one consolidated procurement requirement.

Under the baseline policy, clubbing uses:

- Same resolved item
- Same plant
- Creation window of 14 days
- Need-by date tolerance of 7 days
- First-line anchor

The first eligible line acts as the reference for the group.

Compatible lines are assigned to a common requirement group.

### Design rationale

Clubbing avoids treating every PR line as an unrelated procurement event.

The combined requirement value is relevant because a larger grouped requirement may cross a procurement threshold.

### Example

Two compatible requirements for the same item and plant may be evaluated together rather than independently.

Their combined estimated value can influence whether the procurement route is SPOT_PO, RFQ, or RFP.

## 5. Requirement Valuation

The policy specifies this valuation priority:

1. Eligible contract rate
2. Latest historical PO rate within 365 days
3. Item standard price

The estimated requirement value is calculated from the applicable unit price and requirement quantity.

For a clubbed requirement, the engine evaluates the aggregate requirement value.

### Design rationale

Contract prices are prioritized when an eligible contract exists.

Historical purchase prices provide a practical reference when no eligible contract is available.

Standard prices provide a fallback when better pricing evidence is unavailable.

This is an estimate for routing and should not be confused with a final negotiated purchase price.

## 6. Contract Evaluation

The baseline contract configuration specifies:

- Lowest eligible contract rate
- Active suppliers only
- Available contract ceiling required

Contract eligibility must be evaluated before selecting the CONTRACT_PO route.

An ineligible, expired, blocked, or insufficient-ceiling contract should not be treated as an automatic purchasing entitlement.

### Design rationale

A contract-based route is appropriate only when the agreement is usable for the requirement.

The system must avoid recommending contract purchases that violate supplier eligibility or contract limits.

## 7. Procurement Route Priority

The baseline policy stores an ordered list of procurement decisions.

The configured sequence is:

| Priority | Condition | Route |
|----------|-----------|-------|
| 1 | CAPEX requirement | CAPEX_SOURCING |
| 2 | Eligible contract | CONTRACT_PO |
| 3 | Emergency with purchasing history, within limit | EMERGENCY_PO |
| 4 | Low-value requirement with purchasing history | SPOT_PO |
| 5 | Below RFQ/RFP threshold | RFQ |
| 6 | At or above RFQ/RFP threshold | RFP |

The decision engine evaluates the applicable conditions using the stored policy configuration.

### 7.1 CAPEX Sourcing

Route: `CAPEX_SOURCING`

Policy clause: 5.1

Capital expenditure requirements are directed to a dedicated sourcing process.

The baseline configuration requests up to five supplier suggestions.

### 7.2 Contract Purchase Order

Route: `CONTRACT_PO`

Policy clause: 5.2

Used when a suitable contract is eligible for the requirement.

Contract eligibility includes supplier status and contract ceiling checks according to the configured policy.

### 7.3 Emergency Purchase Order

Route: `EMERGENCY_PO`

Policy clause: 5.3

Baseline configuration:
- Emergency requirement
- Relevant purchasing history
- Group value at most INR 500,000

Emergency routing is not a blanket exception for every urgent request.

### 7.4 Spot Purchase Order

Route: `SPOT_PO`

Policy clause: 5.4

Baseline configuration:
- Relevant purchasing history
- Group value below INR 200,000

The threshold is exclusive.

A requirement worth exactly INR 200,000 does not qualify under the configured "less than" condition.

### 7.5 Request for Quotation

Route: `RFQ`

Policy clause: 5.5

Under policy 5.0, qualifying requirements below INR 1,000,000 are routed to RFQ after earlier-priority rules have been considered.

The policy requests three supplier suggestions.

### 7.6 Request for Proposal

Route: `RFP`

Policy clause: 5.6

Under policy 5.0, qualifying requirements at or above INR 1,000,000 are routed to RFP after earlier-priority rules have been considered.

The policy requests five supplier suggestions.

### 7.7 New Item Sourcing

Route: `NEW_ITEM_SOURCING`

Used when the requirement cannot be matched to an existing item under the implemented matching logic.

### 7.8 Not Processed

Route: `NOT_PROCESSED`

Used for a requirement that cannot be processed successfully under the available data or validation rules.

The reason field should explain the exception.

## 8. Threshold Boundary Handling

Threshold boundaries are important because off-by-one errors can produce incorrect procurement decisions.

Policy 5.0:

| Requirement value | RFQ/RFP threshold result |
|-------------------|--------------------------|
| INR 999,999 | RFQ |
| INR 1,000,000 | RFP |
| INR 1,000,001 | RFP |

Policy 5.2:

| Requirement value | RFQ/RFP threshold result |
|-------------------|--------------------------|
| INR 799,999 | RFQ |
| INR 800,000 | RFP |
| INR 800,001 | RFP |

These examples assume no earlier-priority condition, such as CAPEX or eligible contract, overrides the threshold-based route.

## 9. Policy Versioning

Procurement policy is stored as versioned structured data.

The policy-management workflow supports:

1. Uploading a structured JSON policy.
2. Creating a draft version.
3. Reviewing changes.
4. Recording approval information.
5. Activating the approved version.
6. Recording an audit event.

The system also supports effective-date-based retrieval.

This makes it possible to reproduce procurement decisions under historical policy versions.

### Policy 5.0

- Effective from: 2026-04-01
- RFQ threshold: below INR 1,000,000
- RFP threshold: INR 1,000,000 and above

### Policy 5.2

- Effective from: 2026-11-19
- RFQ threshold: below INR 800,000
- RFP threshold: INR 800,000 and above

The threshold change is represented in the policy data.

It does not require replacing the original policy record.

## 10. Amendment Impact Testing

The sample procurement batch contains 186 PR lines.

Two decision exports were generated for comparison:

- Policy 5.0 baseline
- Policy 5.2 amended threshold

The comparison identified five PR lines whose routes changed from RFQ to RFP.

These requirements fell within the INR 800,000 to INR 1,000,000 range affected by the amendment.

### Interpretation

The result demonstrates that changing the threshold in policy data changes the routing outcome for affected requirements.

It also demonstrates why retaining the policy version in each decision export is important.

### Validation caution

A successful threshold amendment does not automatically prove support for every possible new policy condition.

New plant-specific or category-specific rule types require separate testing.

## 11. Supplier Ranking

The system uses historical purchasing information and eligible contracts to generate supplier recommendations.

The policy specifies:

```text
Reference price:
LATEST_SUPPLIER_PO_OR_CONTRACT

Historical window:
548 days
```

Suppliers with statuses such as `Blocked` and `Inactive` are excluded according to the configured policy.

### Ranking approach

The implemented ranking is intended to:

1. Identify candidate suppliers using contract and historical purchase information.
2. Exclude ineligible supplier statuses.
3. Derive a reference price from available evidence.
4. Order eligible candidates using the engine's supplier-ranking rules.
5. Return the requested number of supplier suggestions for the procurement route.

The reference price is an evidence-based comparison value, not a guaranteed final quotation.

The exact tie-breaking order and full-item coverage should be checked against the implementation before claiming a universal ranking guarantee.

### Export format

```text
item_code,rank,supplier_id,reference_price
```

The requested supplier-ranking output is the top three suppliers per item.

Coverage across every master item and arbitrary historical as-of dates remains an important validation case.

## 12. Purchase Order Consolidation

The baseline consolidation policy specifies:

- Same plant
- Same procurement route
- Same supplier
- Consolidation window of 24 hours

### Design rationale

Compatible purchasing decisions may be consolidated to reduce unnecessary document fragmentation.

Consolidation must not merge requirements that violate plant, route, supplier, or timing constraints.

## 13. Decision Explanations

Every procurement decision export includes a `reason` field.

The buyer workspace displays:
- PR number and line
- Resolved item
- Requirement group
- Procurement route
- Supplier
- Suggested suppliers
- Estimated group value
- Policy version
- Decision explanation

This allows a buyer to understand the recommendation before recording a review.

## 14. Buyer Review and Overrides

The buyer workspace supports:

- APPROVE
- REJECT
- OVERRIDE

Rejection and override require a justification.

Buyer actions are recorded for auditability.

Overrides may specify a replacement route and supplier.

The current review workflow records decisions and audit events.

Creation of a persisted downstream PO/RFQ/RFP document following approval requires separate verification.

## 15. Output Schema

Each PR line produces a decision row with these columns:

```text
pr_no
pr_line
resolved_item_code
group_id
po_id
decision
route
supplier_id
unit_price
group_value_inr
suggested_supplier_ids
policy_version
reason
```

The schema preserves traceability between original requests and generated procurement recommendations.

## 16. Key Engineering Trade-offs

### Explainability over opaque prediction

Deterministic policy rules are preferred for routing because procurement decisions need to be auditable.

### Configurable policy over hard-coded thresholds

Thresholds and supported decision parameters are read from stored policy data.

### Human approval over fully autonomous purchasing

Buyers retain the ability to inspect and review recommendations.

### Explicit exceptions over silent assumptions

Unmatched items and unprocessable requirements should be visible rather than incorrectly routed.

### Historical traceability over destructive updates

Policy versions and audit records support retrospective investigation.

## 17. Remaining Validation

Before production use, the following should be tested further:

- Complete coverage of all master items in supplier rankings
- Supplier ranking at an arbitrary as-of date
- Boundary cases for every procurement threshold
- Contract ceiling consumption across multiple requirements
- New plant- and category-specific amendment conditions
- Persistent PO/RFQ/RFP creation after buyer approval
- PDF-only contract and amendment processing
- Concurrency and duplicate processing
- Authorization for policy activation and buyer overrides

## 18. Conclusion

The procurement decision engine demonstrates a structured approach to PR processing, policy-driven routing, supplier recommendation, and buyer oversight.

The most important design principle is traceability: every decision should be explainable through its source requirement, supporting procurement data, applicable policy version, and recorded buyer actions.
