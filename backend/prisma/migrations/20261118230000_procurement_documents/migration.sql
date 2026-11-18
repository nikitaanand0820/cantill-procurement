CREATE SEQUENCE IF NOT EXISTS procurement_document_seq START WITH 1;
CREATE TABLE "ProcurementDocument" (
 "id" SERIAL PRIMARY KEY,
 "documentNo" TEXT NOT NULL UNIQUE,
 "documentType" TEXT NOT NULL,
 "route" TEXT NOT NULL,
 "prNo" TEXT NOT NULL,
 "prLine" INTEGER NOT NULL,
 "groupId" TEXT,
 "supplierId" TEXT,
 "unitPrice" DECIMAL(16,4),
 "groupValueInr" DECIMAL(18,4),
 "policyVersion" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'CREATED',
 "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ProcurementDocument_prNo_prLine_key" UNIQUE("prNo","prLine")
);
