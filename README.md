
# Cantill Procurement Automation

A full-stack procurement workflow application that converts Purchase Requests (PRs) into policy-driven procurement decisions, including Purchase Orders (POs), RFQs, RFPs, and sourcing requests.

Built for the Cantill.ai Full-Stack Engineering Internship Assignment.

## Overview

The application helps procurement teams automate the PR-to-PO decision-making process while retaining buyer oversight and an auditable record of decisions.

Employees can submit purchase requirements through a chat interface, or procurement teams can upload a batch of PRs in CSV format.

The system matches items against master data, groups compatible requirements, estimates procurement values, evaluates contracts and supplier history, and recommends a procurement route according to the selected policy version.

Buyers can inspect decision explanations and record approvals, rejections, or overrides.

## Technology Stack

### Frontend
- React
- Vite
- JavaScript
- Lucide React
- CSS

### Backend
- Node.js
- Express.js
- Prisma ORM

### Database
- PostgreSQL
- Neon-hosted database

### Architecture
- React frontend communicates with the Express REST API.
- Prisma provides access to PostgreSQL.
- Procurement logic is implemented in backend services.
- Procurement policies are stored as versioned database records.

## Core Features

### 1. Employee Chat Intake

Employees can describe purchase requirements conversationally.

The workflow supports:
- Purchase requirement intake
- Item identification
- Follow-up questions
- Creation of PR records
- Processing chat-generated purchase requests
- Displaying generated decisions in the buyer workspace

### 2. CSV Batch Processing

The application accepts a CSV containing multiple purchase-request lines.

Processing includes:
- Parsing and validating request data
- Item matching against master records
- Grouping compatible requirements
- Requirement valuation
- Contract eligibility evaluation
- Procurement route selection
- Supplier recommendations
- CSV result generation

### 3. Policy-Driven Decision Engine

Procurement rules are represented as structured JSON data rather than being limited to fixed values in frontend code.

The policy includes configurable settings for:
- Requirement clubbing
- Valuation priorities
- Contract selection
- Emergency procurement
- Spot purchases
- RFQ and RFP thresholds
- CAPEX sourcing
- New-item sourcing
- Supplier eligibility
- Supplier ranking
- PO consolidation

### 4. Policy Version Management

The policy-management interface supports:
- Viewing policy versions
- Uploading structured policy JSON
- Creating draft versions
- Reviewing differences
- Recording approval information
- Activating an approved version
- Viewing policy audit history

The backend also supports effective-date-based policy lookup.

Historical policies can be retrieved for processing comparisons.

### 5. Procurement Decisions

The decision engine produces procurement routes such as:

- CONTRACT_PO
- EMERGENCY_PO
- SPOT_PO
- RFQ
- RFP
- CAPEX_SOURCING
- NEW_ITEM_SOURCING
- NOT_PROCESSED

Each decision contains the selected route, supplier information where available, policy version, and explanatory reason.

### 6. Preferred Supplier Rankings

Supplier recommendations use available contract and historical purchasing information.

The system considers supplier eligibility and reference prices.

A supplier-ranking CSV can be exported after batch processing.

### 7. Buyer Workspace

Buyers can:
- View procurement decisions
- Search and filter PR lines
- Inspect group values and suppliers
- Read policy-based decision explanations
- Approve decisions
- Reject decisions with justification
- Override routes or suppliers with justification
- View buyer audit history

### 8. Auditability

The application records policy changes and buyer review actions.

Decision exports include the applied policy version for traceability.

## Project Structure

```text
cantill-procurement-ready/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── utils/
│   │   └── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── ChatIntake.jsx
│   │   └── PolicyManager.jsx
│   └── package.json
├── README.md
├── DECISIONS.md
└── APPROACH.md
```

## Prerequisites

- Node.js
- npm
- PostgreSQL database connection
- Git (for repository management)

Docker is not required when using a hosted PostgreSQL database.

## Local Setup

### 1. Clone the repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd cantill-procurement-ready
```

Alternatively, open the existing project folder in VS Code.

### 2. Configure the backend

```bash
cd backend
npm install
```

Create a `.env` file with the database connection string and any additional environment variables required by the backend.

Example:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"
PORT=5001
```

Do not commit `.env` files or database credentials to GitHub.

### 3. Generate Prisma Client

```bash
npx prisma generate
```

### 4. Apply database migrations

```bash
npx prisma migrate deploy
```

The PostgreSQL database must contain the required master data before processing procurement requests.

### 5. Start the backend

```bash
npm run dev
```

The backend is configured to run on port 5001 locally.

### 6. Start the frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL displayed by Vite in the terminal.

During development, Vite proxies API requests to the backend.

## Application Workflow

1. Start the backend and frontend.
2. Open the procurement dashboard.
3. Submit a purchase requirement using Employee Chat, or upload a CSV batch.
4. Select the applicable procurement policy.
5. Process the requirements.
6. Review the generated procurement decisions.
7. Inspect suggested suppliers and explanations.
8. Approve, reject, or override decisions.
9. Export procurement decisions and supplier rankings.

## Policy Amendment Demonstration

The application has been tested with two policy versions.

### Policy 5.0

- Effective from: 2026-04-01
- RFQ upper threshold: INR 1,000,000 (exclusive)
- RFP lower threshold: INR 1,000,000 (inclusive)

### Policy 5.2

- Effective from: 2026-11-19
- RFQ upper threshold: INR 800,000 (exclusive)
- RFP lower threshold: INR 800,000 (inclusive)

The amended policy was stored as a new version rather than replacing the historical policy record.

The date-based API was verified to retrieve policy 5.0 for 2026-11-18 and policy 5.2 for 2026-11-19.

This demonstrates that procurement thresholds can change through policy data without modifying the decision engine's threshold constants.

## Important API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/health | Backend health |
| GET | /api/summary | Master-data statistics |
| POST | /api/process-batch | Process PR CSV |
| GET | /api/policy/active | Get applicable policy |
| GET | /api/policy/versions | List policy versions |
| POST | /api/policy/versions | Create policy draft |
| POST | /api/policy/versions/:id/activate | Activate policy version |
| GET | /api/policy/audits | Policy audit history |
| POST | /api/chat/message | Chat intake |
| POST | /api/chat/submit | Submit chat PR |
| POST | /api/chat/process | Process chat PR |
| GET | /api/chat/decisions | Retrieve saved chat decisions |
| POST | /api/buyer/review | Submit buyer review |
| GET | /api/buyer/reviews | Retrieve buyer reviews |

The batch endpoint also supports a `policyVersion` query parameter for explicitly selecting a stored policy version.

## CSV Output

The procurement decision export uses these columns:

```text
pr_no,pr_line,resolved_item_code,group_id,po_id,decision,route,supplier_id,unit_price,group_value_inr,suggested_supplier_ids,policy_version,reason
```

The preferred-supplier export uses:

```text
item_code,rank,supplier_id,reference_price
```

## Sample Data

The development database was populated using the supplied procurement task kit.

The seeded dataset includes:
- 73 items
- 48 suppliers
- 2 plants
- 10 contracts
- 468 historical purchase-order records

The sample batch contains 186 PR lines.

## Testing

Completed local checks include:
- Backend connectivity
- Database seeding
- CSV batch processing
- Chat PR persistence
- Chat-generated decision persistence
- Buyer review audit recording
- Policy draft creation and activation
- Policy version retrieval by effective date
- Frontend production build

Additional end-to-end validation is recommended for:
- Explicit policy selection through the updated frontend
- New amendment rule types beyond threshold changes
- Buyer approval creating persisted downstream procurement documents
- Hosted production deployment

## Known Limitations

- Structured JSON policy upload is supported; arbitrary PDF policy interpretation is not yet verified.
- The current policy engine supports its implemented condition types. New condition categories may require further extension.
- Buyer review recording is implemented, but creation of persistent downstream PO/RFQ/RFP records on approval must be verified separately.
- Supplier-ranking completeness across every master item and arbitrary as-of dates must be validated.
- Authentication and production security hardening require additional work.

## Deployment

Deployment requires:
1. Hosting the frontend.
2. Hosting the Express backend.
3. Configuring the Neon PostgreSQL connection.
4. Setting production environment variables.
5. Configuring the frontend API base URL or reverse proxy.
6. Testing the hosted application end to end.

Hosted application: `<ADD_DEPLOYED_URL>`

GitHub repository: `<ADD_GITHUB_URL>`

## Additional Documentation

- `DECISIONS.md` explains procurement decision logic, supplier ranking, and policy interpretation.
- `APPROACH.md` describes architecture, development methodology, trade-offs, and future improvements.

## Submission

Developed as a full-stack procurement automation prototype for the Cantill.ai internship assignment.
