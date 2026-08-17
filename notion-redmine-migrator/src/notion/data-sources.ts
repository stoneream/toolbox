import {
  Client,
  collectAllDataSourceRows,
  collectPaginatedAPI,
  isFullDataSource,
  type GetDataSourceResponse,
  type QueryDataSourceResponse,
  type SearchResponse,
} from "@notionhq/client";

export const NOTION_API_VERSION = "2026-03-11" as const;

export interface DataSourceSummary {
  id: string;
  name: string;
  databaseId: string | null;
  url: string | null;
}

export interface DataSourceDumpData {
  dataSource: GetDataSourceResponse;
  rows: QueryDataSourceResponse["results"];
}

export function createNotionClient(token: string): Client {
  return new Client({
    auth: token,
    notionVersion: NOTION_API_VERSION,
  });
}

export async function listDataSources(
  client: Client,
): Promise<DataSourceSummary[]> {
  const results = await collectPaginatedAPI(client.search, {
    filter: {
      property: "object",
      value: "data_source",
    },
    page_size: 100,
  });

  return results
    .filter((result) => result.object === "data_source")
    .map(toDataSourceSummary)
    .sort(compareDataSources);
}

export async function getDataSourceDump(
  client: Client,
  dataSourceId: string,
): Promise<DataSourceDumpData> {
  const dataSource = await client.dataSources.retrieve({
    data_source_id: dataSourceId,
  });
  const rows = await collectAllDataSourceRows(client, {
    data_source_id: dataSourceId,
    page_size: 100,
  });

  return { dataSource, rows };
}

function toDataSourceSummary(
  result: SearchResponse["results"][number],
): DataSourceSummary {
  if (!isFullDataSource(result)) {
    return {
      id: result.id,
      name: "(untitled)",
      databaseId: null,
      url: null,
    };
  }

  const name = result.title.map((item) => item.plain_text).join("").trim();

  return {
    id: result.id,
    name: name || "(untitled)",
    databaseId: result.parent.database_id,
    url: result.url,
  };
}

function compareDataSources(
  left: DataSourceSummary,
  right: DataSourceSummary,
): number {
  if (left.name !== right.name) {
    return left.name < right.name ? -1 : 1;
  }

  return left.id.localeCompare(right.id);
}
