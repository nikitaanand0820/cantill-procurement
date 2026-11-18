-- CreateTable
CREATE TABLE "Item" (
    "itemCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "uom" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "standardPrice" DECIMAL(16,4) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("itemCode")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "categories" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "onTimePct" DOUBLE PRECISION NOT NULL,
    "qualityRating" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("supplierId")
);

-- CreateTable
CREATE TABLE "Plant" (
    "plant" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Plant_pkey" PRIMARY KEY ("plant")
);

-- CreateTable
CREATE TABLE "POHistory" (
    "id" SERIAL NOT NULL,
    "poNumber" TEXT NOT NULL,
    "poDate" DATE NOT NULL,
    "supplierId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "quantity" DECIMAL(16,4) NOT NULL,
    "uom" TEXT NOT NULL,
    "unitPrice" DECIMAL(16,4) NOT NULL,
    "plant" TEXT NOT NULL,
    "deliveredOnTime" BOOLEAN NOT NULL,

    CONSTRAINT "POHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "contractId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "valueCap" DECIMAL(18,4) NOT NULL,
    "consumedValue" DECIMAL(18,4) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'REGISTER',

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("contractId")
);

-- CreateTable
CREATE TABLE "ContractLine" (
    "id" SERIAL NOT NULL,
    "contractId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "uom" TEXT NOT NULL,
    "rate" DECIMAL(16,4) NOT NULL,

    CONSTRAINT "ContractLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyVersion" (
    "id" SERIAL NOT NULL,
    "version" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequestLine" (
    "id" SERIAL NOT NULL,
    "prNo" TEXT NOT NULL,
    "prLine" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "requester" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "plant" TEXT NOT NULL,
    "itemCode" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(16,4) NOT NULL,
    "uom" TEXT NOT NULL,
    "estimatedUnitPrice" DECIMAL(16,4),
    "needByDate" DATE NOT NULL,
    "urgency" TEXT NOT NULL,

    CONSTRAINT "PurchaseRequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "comment" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PolicyVersion_version_key" ON "PolicyVersion"("version");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequestLine_prNo_prLine_key" ON "PurchaseRequestLine"("prNo", "prLine");

-- AddForeignKey
ALTER TABLE "ContractLine" ADD CONSTRAINT "ContractLine_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("contractId") ON DELETE RESTRICT ON UPDATE CASCADE;
