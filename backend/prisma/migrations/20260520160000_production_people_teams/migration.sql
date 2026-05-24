-- CreateTable
CREATE TABLE "ProductionPerson" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionTeam" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionTeam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionPerson_productionId_personId_key" ON "ProductionPerson"("productionId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionTeam_productionId_departmentId_key" ON "ProductionTeam"("productionId", "departmentId");

-- AddForeignKey
ALTER TABLE "ProductionPerson" ADD CONSTRAINT "ProductionPerson_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPerson" ADD CONSTRAINT "ProductionPerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionTeam" ADD CONSTRAINT "ProductionTeam_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionTeam" ADD CONSTRAINT "ProductionTeam_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
