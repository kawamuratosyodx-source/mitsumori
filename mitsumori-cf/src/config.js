// 自社情報・テーブル定義(ここを書き換えると反映されます)
export const CONFIG = {
  company: {
    name: '有限会社　河村図書教材社',
    address: '〒441-8044 愛知県豊橋市南小池１６６番地２',
    tel: 'TEL 0532-39-5311',
  },
  defaultTaxRate: 10,
  // スマイルワークス取込用CSV(見積インポート)の列定義。左: 出力する値(空は空欄) / 右: 見出し名
  csvColumns: [
    ['', 'レコード区分'], ['no', '見積番号'], ['row', '行番号'], ['', '状態'], ['', '受注確度'],
    ['', '受注予定日'], ['', '自社部門コード'], ['', '自社部門名'], ['', '自社担当者コード'], ['', '自社担当者名'],
    ['', '自社部門、担当者の印字'], ['', '案件番号'], ['issueDate', '見積日'], ['subject', '件名'],
    ['customerCode', '得意先コード'], ['customer', '得意先名'], ['customerContact', '得意先担当者'],
    ['', '納品予定日'], ['', '納入場所'], ['validUntil', '見積有効期限'], ['', '請求区分'], ['', '締め入金方法'],
    ['', '消費税率'], ['', '見積書コメント(上段)'], ['', '見積書コメント(下段)'], ['', '見積書コメントフッター'],
    ['', '商品コード'], ['item', '商品名'], ['item', '商品名(下段)'], ['qty', '数量'], ['unit', '単位'],
    ['price', '販売単価'], ['cost', '原単価'], ['', '税区分'], ['', '内外税'], ['note', '備考'],
  ],
};

// テーブル名(=D1のテーブル)と列。先頭の列が主キー(linesだけは明細なので quoteId で束ねる)
export const TABLES = {
  customers: ['id', 'name', 'contact', 'address', 'tel', 'email', 'memo', 'created', 'code'],
  projects: ['id', 'customerId', 'name', 'status', 'memo', 'created'],
  quotes: ['id', 'no', 'projectId', 'issueDate', 'validUntil', 'subject', 'note', 'subtotal', 'tax', 'total', 'taxRate', 'author', 'created', 'updated', 'result', 'resultOn'],
  lines: ['quoteId', 'row', 'item', 'qty', 'unit', 'price', 'amount', 'note', 'cost'],
  requests: ['id', 'projectId', 'vendor', 'requestedOn', 'dueOn', 'answeredOn', 'amount', 'status', 'memo', 'photos', 'author', 'created', 'detail'],
  memos: ['id', 'customerId', 'who', 'kind', 'body', 'status', 'author', 'created', 'updated', 'projectId'],
  vendors: ['id', 'name', 'contact', 'tel', 'email', 'address', 'memo', 'created'],
};
// 数値として返す列(空は空文字)
export const NUMERIC = {
  quotes: ['subtotal', 'tax', 'total', 'taxRate'],
  lines: ['row', 'qty', 'price', 'amount', 'cost'],
  requests: ['amount'],
};
