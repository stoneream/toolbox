const COLUMN_SEPARATOR = "  ";

/** ヘッダーと行データを、列幅を揃えたテーブル文字列に変換する。 */
export function formatTable(
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
): string {
  const sanitizedHeaders = headers.map(sanitizeCell);
  const sanitizedRows = rows.map((row) => row.map(sanitizeCell));
  const widths = sanitizedHeaders.map((header, columnIndex) =>
    Math.max(
      header.length,
      ...sanitizedRows.map((row) => row[columnIndex]?.length ?? 0),
    ),
  );
  const header = formatTableRow(sanitizedHeaders, widths);
  const separator = widths
    .map((width) => "-".repeat(width))
    .join(COLUMN_SEPARATOR);

  return [
    header,
    separator,
    ...sanitizedRows.map((row) => formatTableRow(row, widths)),
  ].join("\n");
}

/** 各セルを列幅まで空白で埋め、一行の文字列に変換する。 */
function formatTableRow(
  cells: ReadonlyArray<string>,
  widths: ReadonlyArray<number>,
): string {
  return cells
    .map((cell, index) => cell.padEnd(widths[index] ?? cell.length))
    .join(COLUMN_SEPARATOR)
    .trimEnd();
}

/** 表のレイアウトを崩す改行とタブを空白に置き換える。 */
function sanitizeCell(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ");
}
