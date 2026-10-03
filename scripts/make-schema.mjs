import { TABLES } from '../src/config.js';
import { writeFileSync } from 'node:fs';
const out = [];
for (const [t, cols] of Object.entries(TABLES)) {
  const defs = cols.map((c, i) => `  "${c}" TEXT${i === 0 && t !== 'lines' ? ' PRIMARY KEY' : ''}`);
  out.push(`CREATE TABLE IF NOT EXISTS "${t}" (\n${defs.join(',\n')}\n);`);
}
out.push('CREATE TABLE IF NOT EXISTS "files" (\n  "id" TEXT PRIMARY KEY,\n  "ctype" TEXT,\n  "name" TEXT,\n  "size" TEXT,\n  "chunks" TEXT,\n  "created" TEXT\n);');
out.push('CREATE TABLE IF NOT EXISTS "file_chunks" (\n  "fid" TEXT NOT NULL,\n  "seq" INTEGER NOT NULL,\n  "data" TEXT,\n  PRIMARY KEY ("fid", "seq")\n);');
out.push('CREATE TABLE IF NOT EXISTS "sales_batches" (\n  "id" TEXT PRIMARY KEY,\n  "name" TEXT,\n  "headers" TEXT,\n  "count" TEXT,\n  "created" TEXT,\n  "by" TEXT\n);');
out.push('CREATE TABLE IF NOT EXISTS "sales_rows" (\n  "id" INTEGER PRIMARY KEY AUTOINCREMENT,\n  "batch" TEXT NOT NULL,\n  "seq" INTEGER,\n  "data" TEXT,\n  "search" TEXT\n);');
out.push('CREATE INDEX IF NOT EXISTS idx_sales_rows_batch ON "sales_rows"("batch","seq");');
out.push('CREATE TABLE IF NOT EXISTS "settings" (\n  "key" TEXT PRIMARY KEY,\n  "value" TEXT\n);');
out.push('CREATE INDEX IF NOT EXISTS idx_lines_quote ON "lines"("quoteId");');
out.push('CREATE INDEX IF NOT EXISTS idx_quotes_project ON "quotes"("projectId");');
out.push('CREATE INDEX IF NOT EXISTS idx_requests_project ON "requests"("projectId");');
writeFileSync(new URL('../schema.sql', import.meta.url), out.join('\n\n') + '\n');
console.log('schema.sql written');
