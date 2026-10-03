CREATE TABLE IF NOT EXISTS "customers" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT,
  "contact" TEXT,
  "address" TEXT,
  "tel" TEXT,
  "email" TEXT,
  "memo" TEXT,
  "created" TEXT,
  "code" TEXT
);

CREATE TABLE IF NOT EXISTS "projects" (
  "id" TEXT PRIMARY KEY,
  "customerId" TEXT,
  "name" TEXT,
  "status" TEXT,
  "memo" TEXT,
  "created" TEXT
);

CREATE TABLE IF NOT EXISTS "quotes" (
  "id" TEXT PRIMARY KEY,
  "no" TEXT,
  "projectId" TEXT,
  "issueDate" TEXT,
  "validUntil" TEXT,
  "subject" TEXT,
  "note" TEXT,
  "subtotal" TEXT,
  "tax" TEXT,
  "total" TEXT,
  "taxRate" TEXT,
  "author" TEXT,
  "created" TEXT,
  "updated" TEXT,
  "result" TEXT,
  "resultOn" TEXT
);

CREATE TABLE IF NOT EXISTS "lines" (
  "quoteId" TEXT,
  "row" TEXT,
  "item" TEXT,
  "qty" TEXT,
  "unit" TEXT,
  "price" TEXT,
  "amount" TEXT,
  "note" TEXT,
  "cost" TEXT
);

CREATE TABLE IF NOT EXISTS "requests" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT,
  "vendor" TEXT,
  "requestedOn" TEXT,
  "dueOn" TEXT,
  "answeredOn" TEXT,
  "amount" TEXT,
  "status" TEXT,
  "memo" TEXT,
  "photos" TEXT,
  "author" TEXT,
  "created" TEXT,
  "detail" TEXT
);

CREATE TABLE IF NOT EXISTS "memos" (
  "id" TEXT PRIMARY KEY,
  "customerId" TEXT,
  "who" TEXT,
  "kind" TEXT,
  "body" TEXT,
  "status" TEXT,
  "author" TEXT,
  "created" TEXT,
  "updated" TEXT,
  "projectId" TEXT
);

CREATE TABLE IF NOT EXISTS "vendors" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT,
  "contact" TEXT,
  "tel" TEXT,
  "email" TEXT,
  "address" TEXT,
  "memo" TEXT,
  "created" TEXT
);

CREATE TABLE IF NOT EXISTS "files" (
  "id" TEXT PRIMARY KEY,
  "ctype" TEXT,
  "name" TEXT,
  "size" TEXT,
  "chunks" TEXT,
  "created" TEXT
);

CREATE TABLE IF NOT EXISTS "file_chunks" (
  "fid" TEXT NOT NULL,
  "seq" INTEGER NOT NULL,
  "data" TEXT,
  PRIMARY KEY ("fid", "seq")
);

CREATE INDEX IF NOT EXISTS idx_lines_quote ON "lines"("quoteId");

CREATE INDEX IF NOT EXISTS idx_quotes_project ON "quotes"("projectId");

CREATE INDEX IF NOT EXISTS idx_requests_project ON "requests"("projectId");
