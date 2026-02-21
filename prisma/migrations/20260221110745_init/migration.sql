-- CreateTable
CREATE TABLE "alipay_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionTime" DATETIME NOT NULL,
    "transactionCategory" TEXT NOT NULL,
    "counterparty" TEXT NOT NULL,
    "counterpartyAccount" TEXT,
    "productDescription" TEXT NOT NULL,
    "incomeExpense" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "paymentMethod" TEXT,
    "transactionStatus" TEXT NOT NULL,
    "transactionOrderNo" TEXT NOT NULL,
    "merchantOrderNo" TEXT,
    "remark" TEXT,
    "myCategory" TEXT,
    "remarkDescription" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "wechat_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionTime" DATETIME NOT NULL,
    "transactionType" TEXT NOT NULL,
    "counterparty" TEXT NOT NULL,
    "product" TEXT,
    "incomeExpense" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "paymentMethod" TEXT,
    "currentStatus" TEXT NOT NULL,
    "transactionOrderNo" TEXT NOT NULL,
    "merchantOrderNo" TEXT,
    "remark" TEXT,
    "myCategory" TEXT,
    "remarkDescription" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "unified_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionTime" DATETIME NOT NULL,
    "amount" DECIMAL NOT NULL,
    "transactionType" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT NOT NULL,
    "counterparty" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "alipay_transactions_transactionOrderNo_key" ON "alipay_transactions"("transactionOrderNo");

-- CreateIndex
CREATE UNIQUE INDEX "wechat_transactions_transactionOrderNo_key" ON "wechat_transactions"("transactionOrderNo");

-- CreateIndex
CREATE UNIQUE INDEX "unified_transactions_source_sourceId_key" ON "unified_transactions"("source", "sourceId");
