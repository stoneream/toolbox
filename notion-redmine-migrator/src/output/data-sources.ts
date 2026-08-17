import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, parse } from "node:path";

import type {
  GetDataSourceResponse,
  QueryDataSourceResponse,
} from "@notionhq/client";

import { formatTable } from "../lib/table.js";
import {
  NOTION_API_VERSION,
  type DataSourceDumpData,
  type DataSourceSummary,
} from "../notion/data-sources.js";

const DUMP_FORMAT_VERSION = 1 as const;
const EXCLUDED_STATUS_NAMES = new Set(["close", "cancel"]);
const TABLE_HEADERS = ["NAME", "ID", "DATABASE_ID"] as const;

export interface DataSourceDump {
  formatVersion: typeof DUMP_FORMAT_VERSION;
  notionApiVersion: typeof NOTION_API_VERSION;
  exportedAt: string;
  dataSource: GetDataSourceResponse;
  rowCount: number;
  rows: QueryDataSourceResponse["results"];
}

export interface FilterDataSourceDumpResult {
  outputPath: string;
  rowCount: number;
  removedRowCount: number;
}

export function formatDataSourceTable(
  dataSources: ReadonlyArray<DataSourceSummary>,
): string {
  if (dataSources.length === 0) {
    return "No data sources found.";
  }

  const rows = dataSources.map((dataSource) => [
    dataSource.name,
    dataSource.id,
    dataSource.databaseId ?? "-",
  ]);

  return formatTable(TABLE_HEADERS, rows);
}

export function createDataSourceDump(
  data: DataSourceDumpData,
  exportedAt: Date,
): DataSourceDump {
  return {
    formatVersion: DUMP_FORMAT_VERSION,
    notionApiVersion: NOTION_API_VERSION,
    exportedAt: exportedAt.toISOString(),
    dataSource: data.dataSource,
    rowCount: data.rows.length,
    rows: data.rows,
  };
}

export async function writeDataSourceDumpFile(
  outputDirectory: string,
  dataSourceId: string,
  exportedAt: Date,
  dump: DataSourceDump,
): Promise<string> {
  await mkdir(outputDirectory, { recursive: true });

  const timestamp = exportedAt.toISOString().replaceAll(":", "-");
  const outputPath = join(outputDirectory, `${dataSourceId}_${timestamp}.json`);

  await writeFile(outputPath, `${JSON.stringify(dump, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });

  return outputPath;
}

/** JSONファイルからデータソースのdumpを読み込む。 */
export async function readDataSourceDumpFile(
  inputPath: string,
): Promise<DataSourceDump> {
  return JSON.parse(await readFile(inputPath, "utf8")) as DataSourceDump;
}

/** dumpからstatusがcloseまたはcancelの行を除外する。 */
export function filterDataSourceDump(dump: DataSourceDump): DataSourceDump {
  const rows = dump.rows.filter(shouldKeepDataSourceRow);

  return {
    ...dump,
    rowCount: rows.length,
    rows,
  };
}

/** dumpからstatusがcloseまたはcancelの行を除外し、別のJSONファイルへ保存する。 */
export async function filterDataSourceDumpFile(
  inputPath: string,
  outputPath?: string,
): Promise<FilterDataSourceDumpResult> {
  const dump = await readDataSourceDumpFile(inputPath);
  const filteredDump = filterDataSourceDump(dump);
  const filteredOutputPath = outputPath ?? createFilteredDumpPath(inputPath);

  await mkdir(dirname(filteredOutputPath), { recursive: true });
  await writeFile(
    filteredOutputPath,
    `${JSON.stringify(filteredDump, null, 2)}\n`,
    {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    },
  );

  return {
    outputPath: filteredOutputPath,
    rowCount: filteredDump.rowCount,
    removedRowCount: dump.rows.length - filteredDump.rows.length,
  };
}

function shouldKeepDataSourceRow(
  row: DataSourceDump["rows"][number],
): boolean {
  if (row.object !== "page" || !("properties" in row)) {
    return true;
  }

  const statusProperty = row.properties.status;

  return (
    statusProperty?.type !== "select" ||
    statusProperty.select === null ||
    !EXCLUDED_STATUS_NAMES.has(statusProperty.select.name.toLowerCase())
  );
}

function createFilteredDumpPath(inputPath: string): string {
  const parsedPath = parse(inputPath);

  return join(
    parsedPath.dir,
    `${parsedPath.name}_filtered${parsedPath.ext || ".json"}`,
  );
}
