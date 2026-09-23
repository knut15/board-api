-- CreateIndex
CREATE INDEX "posts_createdAt_id_idx" ON "posts"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "posts_authorId_idx" ON "posts"("authorId");
