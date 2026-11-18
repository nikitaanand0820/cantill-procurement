-- CreateTable
CREATE TABLE "ProcurementDecision" (
    "id" SERIAL NOT NULL,
    "prNo" TEXT NOT NULL,
    "prLine" INTEGER NOT NULL,
    "resolvedItemCode" TEXT,
    "groupId" TEXT,
    "poId" TEXT,
    "decision" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "supplierId" TEXT,
    "unitPrice" DECIMAL(16,4),
    "groupValueInr" DECIMAL(18,4),
    "suggestedSupplierIds" TEXT,
    "policyVersion" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcurementDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementDecision_prNo_prLine_key" ON "ProcurementDecision"("prNo", "prLine");
