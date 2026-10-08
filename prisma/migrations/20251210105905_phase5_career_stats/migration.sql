-- CreateTable
CREATE TABLE "Trajectory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT,
    "title" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trajectory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Statistics" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT,
    "season" TEXT NOT NULL,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "cleanSheets" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Statistics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trajectory_userId_idx" ON "Trajectory"("userId");

-- CreateIndex
CREATE INDEX "Trajectory_clubId_idx" ON "Trajectory"("clubId");

-- CreateIndex
CREATE INDEX "Trajectory_isCurrent_idx" ON "Trajectory"("isCurrent");

-- CreateIndex
CREATE INDEX "Statistics_userId_idx" ON "Statistics"("userId");

-- CreateIndex
CREATE INDEX "Statistics_clubId_idx" ON "Statistics"("clubId");

-- CreateIndex
CREATE INDEX "Statistics_season_idx" ON "Statistics"("season");

-- CreateIndex
CREATE UNIQUE INDEX "Statistics_userId_season_clubId_key" ON "Statistics"("userId", "season", "clubId");

-- AddForeignKey
ALTER TABLE "Trajectory" ADD CONSTRAINT "Trajectory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trajectory" ADD CONSTRAINT "Trajectory_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statistics" ADD CONSTRAINT "Statistics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statistics" ADD CONSTRAINT "Statistics_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;
