
# Engineering Approach

## 1. Problem Understanding

The assignment requires a procurement automation application that converts purchase requests into procurement decisions while following configurable organizational policies.

The problem has several connected parts:

- Accepting purchase requirements from employees
- Understanding and matching requested items
- Grouping compatible requirements
- Estimating requirement values
- Identifying eligible contracts and suppliers
- Selecting the correct procurement route
- Supporting policy amendments without changing threshold code
- Allowing buyers to review decisions
- Producing auditable CSV outputs

The central engineering challenge is to keep procurement decisions consistent, explainable, and adaptable to policy changes.

## 2. Solution Strategy

I divided the application into four primary layers:

1. Employee and buyer interfaces
2. REST API layer
3. Procurement decision services
4. Persistent data layer

This separation allows the frontend to focus on user interaction while the backend owns procurement rules and database operations.

## 3. System Architecture

```text
                 React + Vite Frontend
                          |
             ---------------------------
             |            |            |
         Chat Intake   CSV Upload   Buyer Workspace
             |            |            |
             ---------------------------
                          |
                    Express API
                          |
          --------------------------------
          |              |               |
       PR Routes     Policy Routes    Buyer Routes
          |              |               |
          --------------------------------
                          |
                Procurement Services
                          |
          --------------------------------
          |              |               |
      Item Matching   Decision Engine  Supplier Ranking
          |              |               |
          --------------------------------
                          |
                      Prisma ORM
                          |
                   PostgreSQL / Neon
```

## 4. Frontend Design

React was selected for its component-based structure and straightforward state management.

The interface is organized around the main procurement workflow:

- Overview dashboard
- Employee chat
- Batch processing
- Policy management
- Buyer workspace
- Preferred supplier exports

The dashboard provides quick access to these functions through sidebar navigation.

### UI design considerations

- Keep procurement actions discoverable
- Show processing status and errors
- Display policy versions clearly
- Provide searchable decision tables
- Expose explanations before buyer approval
- Allow CSV downloads for evaluation and audit

## 5. Backend Design

Node.js and Express were used to expose REST endpoints.

The backend separates route handlers from procurement decision logic.

The main processing service is responsible for:
- Parsing PR data
- Matching items
- Clubbing requirements
- Ranking suppliers
- Selecting eligible contracts
- Applying policy decisions
- Producing output records

This separation helps avoid duplicating procurement logic across the chat and CSV interfaces.

## 6. Database Design

PostgreSQL was selected for structured procurement records and relational integrity.

Prisma ORM provides database access and schema migration support.

The development environment uses Neon PostgreSQL, avoiding the need for a local Docker database.

The database stores procurement master data and operational records, including policy versions and review-related information.

### Data considerations

Procurement decisions depend on relationships among:

- Items
- Suppliers
- Plants
- Contracts
- Historical purchase orders
- Purchase requests
- Policy versions
- Decision records
- Audit events

Maintaining these relationships in a relational database supports consistent lookups and traceability.

## 7. Procurement Decision Engine

I used a deterministic rules-based approach instead of a black-box machine-learning model.

### Why rules-based?

Procurement routing is governed by explicit organizational policy.

For example:
- Whether a contract is eligible
- Whether a request is CAPEX
- Whether an emergency exception applies
- Whether a requirement crosses an RFQ/RFP threshold

These decisions are better represented as explainable conditions than probabilistic predictions.

### Processing stages

```text
Input
  ↓
Validation
  ↓
Item Resolution
  ↓
Requirement Clubbing
  ↓
Valuation
  ↓
Contract Evaluation
  ↓
Policy Evaluation
  ↓
Supplier Recommendation
  ↓
PO Consolidation
  ↓
Decision Export
```

Each stage prepares information required by subsequent stages.

## 8. Policy as Data

One of the main architectural decisions was to represent procurement policy using versioned JSON data.

The policy includes configurable parameters for:
- Clubbing
- Valuation
- Contract selection
- Procurement route conditions
- Supplier eligibility
- Supplier ranking
- Consolidation

### Advantages

- Threshold changes can be made without editing hard-coded values.
- Historical policy versions can be retained.
- Different versions can be compared using the same PR batch.
- Decision exports can identify the policy applied.

### Important distinction

The system is data-driven for the policy fields and condition types implemented by the decision engine.

It is not a general-purpose interpreter for arbitrary natural-language policies.

Support for new rule categories would require a more expressive rule schema and evaluator.

## 9. Policy Amendment Workflow

The policy-management interface follows this sequence:

```text
Upload Structured Policy
          ↓
Create Draft Version
          ↓
Review Changes
          ↓
Record Approval
          ↓
Activate Version
          ↓
Apply According to Effective Date
          ↓
Audit and Export
```

### Demonstration

A policy amendment reduced the RFQ/RFP threshold from INR 1,000,000 to INR 800,000.

The amendment was stored as policy version 5.2, effective 2026-11-19.

The previous policy version 5.0 was retained for historical processing.

Date-based API tests confirmed that the appropriate policy could be retrieved for both dates.

## 10. Chat-Based Purchase Request Intake

The chat interface was introduced to reduce dependence on manually preparing CSV files.

The intended interaction is:

1. Employee describes the purchase requirement.
2. The application identifies relevant details.
3. Missing information is requested.
4. A purchase request is created.
5. The decision engine processes the request.
6. The result is displayed in the buyer workspace.

The backend persists submitted chat PRs and generated decision records.

This creates a connection between conversational intake and structured procurement processing.

## 11. CSV Batch Processing

Batch processing is important because real procurement teams often receive large collections of PR lines.

The application accepts CSV input and processes requirements using the shared decision engine.

### Benefits

- Repeatable processing
- Consistent application of policy
- Easier testing with supplied datasets
- Exportable decisions
- Comparison between policy versions

The output retains one decision row per PR line.

## 12. Supplier Recommendations

Supplier selection uses available purchasing evidence instead of arbitrary recommendations.

The current approach draws on:
- Historical purchase orders
- Eligible contracts
- Supplier status
- Reference pricing

The policy specifies the historical lookup window and reference-price method.

### Design rationale

A supplier recommendation should have an explainable business basis.

Reference prices provide context, but actual purchase prices may still require quotation or negotiation.

## 13. Buyer-in-the-Loop Workflow

The system intentionally includes buyer review.

Buyers can:
- Inspect recommendations
- Approve decisions
- Reject with justification
- Override with justification
- View audit history

### Why this matters

Procurement decisions can involve commercial, operational, and compliance considerations that require human judgment.

The system therefore assists decision-making rather than removing buyer accountability.

## 14. Testing Methodology

I used incremental local testing.

### Infrastructure checks

- Backend startup
- API connectivity
- Database connectivity
- Prisma migration and data access
- Frontend production build

### Workflow checks

- CSV batch processing
- Chat PR submission
- Decision persistence
- Buyer review recording
- Policy version creation
- Policy activation
- Policy audit retrieval

### Policy amendment checks

- Baseline policy retrieval
- Amended policy retrieval
- Effective-date selection
- Comparison of decision exports

### Frontend build

The Vite production build completed successfully.

### Remaining tests

- Updated policy selector end-to-end
- Hosted application smoke test
- Full supplier-ranking coverage
- New policy rule types
- Downstream document persistence

## 15. Sample Data and Observations

The development database was populated with the supplied procurement data.

Recorded seeded counts:

| Entity | Count |
|--------|------:|
| Items | 73 |
| Suppliers | 48 |
| Plants | 2 |
| Contracts | 10 |
| Historical POs | 468 |

The sample PR batch contains 186 lines.

The threshold amendment comparison identified five lines changing from RFQ to RFP.

These observations were used to check whether policy changes affected procurement outcomes.

## 16. Engineering Trade-offs

### 16.1 Hosted database instead of Docker

A hosted PostgreSQL database simplified local development and removed the need to configure a local database container.

Trade-off: development requires network access to the hosted database.

### 16.2 Rule engine instead of machine learning

A deterministic decision engine makes routing decisions easier to explain and test.

Trade-off: the engine must explicitly support each condition type.

### 16.3 Structured policy JSON

Structured JSON provides a practical way to edit and version procurement rules.

Trade-off: it does not automatically understand arbitrary PDF or natural-language amendments.

### 16.4 Centralized processing service

Using a shared decision engine helps maintain consistency across input channels.

Trade-off: the service needs careful validation because multiple workflows depend on it.

### 16.5 Buyer review before final procurement action

The review workflow supports human oversight and auditability.

Trade-off: fully automated downstream document creation is not assumed to be complete until verified.

## 17. Challenges Encountered

### Database environment

The project needed a working relational database without relying on Docker.

A hosted PostgreSQL database was used.

### Policy amendments

The system needed to support both old and new procurement thresholds without overwriting historical policy records.

Versioned policy data and effective-date retrieval were introduced.

### End-to-end integration

Chat-generated PRs needed to be persisted and connected to procurement decision processing.

Backend routes and decision persistence were added to support this flow.

### Frontend integration

The dashboard needed to expose multiple workflows without removing existing functionality.

The UI was extended incrementally with policy management, chat processing, buyer review, and version selection.

## 18. Security and Production Considerations

A production procurement platform should include:

- Authentication
- Role-based access control
- Approval authorization
- Input validation
- File-upload validation
- Secure environment variables
- Database constraints
- Transactional updates
- Audit-log integrity
- Rate limiting
- Monitoring and alerting
- Secure handling of supplier and commercial data

These are important areas for production hardening.

## 19. Future Improvements

### Flexible policy rule evaluation

Introduce a structured condition language supporting:
- Plant-specific rules
- Category-specific thresholds
- Combined AND/OR conditions
- Date-based exceptions
- Supplier restrictions
- Explicit rule priorities

### Policy document ingestion

Add support for:
- PDF amendments
- Extracted clauses
- Human review of interpreted rules
- Amendment preview before activation

### Downstream procurement records

Ensure buyer approval creates persisted PO, RFQ, RFP, or sourcing-request records, with stable document IDs and lifecycle statuses.

### Supplier ranking improvements

Generate top-three supplier recommendations for every master item, independently of whether the item appears in the current PR batch.

Support historical as-of dates and explicit ranking explanations.

### Testing and reliability

Add:
- Automated unit tests
- API integration tests
- Threshold boundary tests
- Contract ceiling tests
- Regression tests for policy amendments
- Duplicate-request protection
- Transactional approval workflows

### Deployment

Complete and verify hosted frontend/backend deployment with production environment configuration.

## 20. Conclusion

This project demonstrates a practical approach to building an explainable procurement automation platform using React, Express, Prisma, and PostgreSQL.

The main engineering focus was separating procurement decision logic from the user interface and representing supported policy rules as versioned data.

The resulting prototype supports structured purchase-request processing, policy comparison, supplier recommendations, buyer review, and audit-oriented exports.

The next development priorities are broader amendment interpretation, complete supplier-ranking coverage, persistent downstream procurement documents, and production deployment.
