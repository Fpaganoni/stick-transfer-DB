-- AlterTable
ALTER TABLE "User" ADD COLUMN     "multimedia" TEXT[];

-- CreateIndex
CREATE INDEX "User_role_position_idx" ON "User"("role", "position");

-- CreateIndex
CREATE INDEX "User_country_city_idx" ON "User"("country", "city");

-- CreateIndex
CREATE INDEX "User_role_country_city_position_idx" ON "User"("role", "country", "city", "position");
