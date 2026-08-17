import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, parse } from "node:path";

import {
  filterDataSourceDump,
  type DataSourceDump,
} from "../output/data-sources.js";

const ISSUE_IMPORT_PROGRESS_FORMAT_VERSION = 1 as const;
const REDMINE_STATUS_NAMES: Readonly<Record<string, string>> = {
  open: "OPEN",
  progress: "PROGRESS",
  pending: "PENDING",
};
const REDMINE_PRIORITY_NAMES: Readonly<Record<string, string>> = {
  "high (must/required)": "HIGH",
  "middle (should/recommended)": "NORMAL",
  "low (optional)": "LOW",
};

type DataSourceDumpRow = DataSourceDump["rows"][number];
type FullPageRow = Extract<
  DataSourceDumpRow,
  { object: "page"; properties: unknown }
>;

interface RedmineNamedResource {
  id: number;
  name: string;
}

interface RedmineCreatedIssueResponse {
  issue: {
    id: number;
  };
}

export interface RedmineIssueRequest {
  issue: {
    project_id: number;
    tracker_id: number;
    status_id: number;
    priority_id: number;
    subject: string;
    due_date?: string;
  };
}

export interface PreparedRedmineIssue {
  notionPageId: string;
  request: RedmineIssueRequest;
}

interface CreatedIssueProgress {
  notionPageId: string;
  redmineIssueId: number;
}

interface FailedIssueProgress {
  notionPageId: string;
  error: string;
}

interface IssueImportProgress {
  formatVersion: typeof ISSUE_IMPORT_PROGRESS_FORMAT_VERSION;
  source: {
    dataSourceId: string;
    exportedAt: string;
  };
  target: {
    projectId: number;
    trackerId: number;
  };
  created: CreatedIssueProgress[];
  failures: FailedIssueProgress[];
}

export interface ExecuteIssueImportResult {
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  progressPath: string;
}

/** NotionのdumpをRedmineへ送信するissue JSONへ変換する。 */
export async function prepareRedmineIssueImport(
  baseUrl: string,
  apiKey: string,
  dump: DataSourceDump,
  projectId: number,
  trackerId: number,
): Promise<PreparedRedmineIssue[]> {
  const rows = filterDataSourceDump(dump).rows.filter(isFullPageRow);

  if (rows.length === 0) {
    return [];
  }

  const [statuses, priorities] = await Promise.all([
    getRedmineNamedResources(
      baseUrl,
      apiKey,
      "issue_statuses.json",
      "issue_statuses",
    ),
    getRedmineNamedResources(
      baseUrl,
      apiKey,
      "enumerations/issue_priorities.json",
      "issue_priorities",
    ),
  ]);
  const statusIds = defineResourceIdsByName(statuses);
  const priorityIds = defineResourceIdsByName(priorities);

  return rows.map((row) =>
    prepareRedmineIssue(row, projectId, trackerId, statusIds, priorityIds),
  );
}

/** dry-runで確認済みのissueを順番に作成し、結果を進捗JSONへ保存する。 */
export async function executeRedmineIssueImport(
  baseUrl: string,
  apiKey: string,
  dump: DataSourceDump,
  projectId: number,
  trackerId: number,
  issues: ReadonlyArray<PreparedRedmineIssue>,
  progressPath: string,
): Promise<ExecuteIssueImportResult> {
  const progress = await readIssueImportProgress(
    progressPath,
    dump,
    projectId,
    trackerId,
  );
  const createdPageIds = new Set(
    progress.created.map((item) => item.notionPageId),
  );
  let createdCount = 0;
  let skippedCount = 0;

  await writeIssueImportProgress(progressPath, progress);

  for (const issue of issues) {
    if (createdPageIds.has(issue.notionPageId)) {
      skippedCount += 1;
      continue;
    }

    try {
      const redmineIssueId = await postRedmineIssue(
        baseUrl,
        apiKey,
        issue.request,
      );
      progress.created.push({
        notionPageId: issue.notionPageId,
        redmineIssueId,
      });
      progress.failures = progress.failures.filter(
        (failure) => failure.notionPageId !== issue.notionPageId,
      );
      createdPageIds.add(issue.notionPageId);
      createdCount += 1;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const failure = progress.failures.find(
        (item) => item.notionPageId === issue.notionPageId,
      );

      if (failure) {
        failure.error = message;
      } else {
        progress.failures.push({
          notionPageId: issue.notionPageId,
          error: message,
        });
      }
    }

    await writeIssueImportProgress(progressPath, progress);
  }

  return {
    createdCount,
    skippedCount,
    failedCount: progress.failures.length,
    progressPath,
  };
}

/** 入力dumpと同じディレクトリに置く既定の進捗ファイル名を返す。 */
export function getDefaultIssueImportProgressPath(dumpPath: string): string {
  const parsedPath = parse(dumpPath);

  return join(parsedPath.dir, `${parsedPath.name}_redmine-import.json`);
}

function isFullPageRow(row: DataSourceDumpRow): row is FullPageRow {
  return row.object === "page" && "properties" in row;
}

function prepareRedmineIssue(
  row: FullPageRow,
  projectId: number,
  trackerId: number,
  statusIds: ReadonlyMap<string, number>,
  priorityIds: ReadonlyMap<string, number>,
): PreparedRedmineIssue {
  const subject = readTitle(row);
  const notionStatus = readSelectName(row, "status");
  const notionPriority = readSelectName(row, "priority");
  const redmineStatusName = REDMINE_STATUS_NAMES[notionStatus];
  const redminePriorityName = REDMINE_PRIORITY_NAMES[notionPriority];

  if (!redmineStatusName) {
    throw new Error(`Unsupported Notion status: ${notionStatus}`);
  }

  if (!redminePriorityName) {
    throw new Error(`Unsupported Notion priority: ${notionPriority}`);
  }

  const dueDate = readDueDate(row);
  const request: RedmineIssueRequest = {
    issue: {
      project_id: projectId,
      tracker_id: trackerId,
      status_id: readResourceId(statusIds, redmineStatusName, "status"),
      priority_id: readResourceId(
        priorityIds,
        redminePriorityName,
        "priority",
      ),
      subject,
      ...(dueDate ? { due_date: dueDate } : {}),
    },
  };

  return {
    notionPageId: row.id,
    request,
  };
}

function readTitle(row: FullPageRow): string {
  const titleProperty = row.properties.title;

  if (titleProperty?.type !== "title") {
    throw new Error(`Notion page ${row.id} does not have a title property.`);
  }

  const title = titleProperty.title
    .map((item) => item.plain_text)
    .join("")
    .trim();

  if (!title) {
    throw new Error(`Notion page ${row.id} has an empty title.`);
  }

  return title;
}

function readSelectName(row: FullPageRow, propertyName: string): string {
  const property = row.properties[propertyName];

  if (property?.type !== "select" || property.select === null) {
    throw new Error(
      `Notion page ${row.id} does not have a ${propertyName} value.`,
    );
  }

  return property.select.name.toLowerCase();
}

function readDueDate(row: FullPageRow): string | undefined {
  const deadlineProperty = row.properties.deadline_at;

  if (deadlineProperty?.type !== "date" || deadlineProperty.date === null) {
    return undefined;
  }

  return deadlineProperty.date.start.slice(0, 10);
}

function defineResourceIdsByName(
  resources: ReadonlyArray<RedmineNamedResource>,
): ReadonlyMap<string, number> {
  return new Map(
    resources.map((resource) => [resource.name.toUpperCase(), resource.id]),
  );
}

function readResourceId(
  resourceIds: ReadonlyMap<string, number>,
  name: string,
  resourceType: string,
): number {
  const id = resourceIds.get(name);

  if (id === undefined) {
    throw new Error(`Redmine ${resourceType} not found: ${name}`);
  }

  return id;
}

async function getRedmineNamedResources(
  baseUrl: string,
  apiKey: string,
  path: string,
  responseKey: "issue_statuses" | "issue_priorities",
): Promise<RedmineNamedResource[]> {
  const response = await fetch(createRedmineUrl(baseUrl, path), {
    headers: defineRedmineHeaders(apiKey),
  });

  if (!response.ok) {
    throw new Error(
      `Redmine API request failed: ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as Partial<
    Record<typeof responseKey, RedmineNamedResource[]>
  >;

  return body[responseKey] ?? [];
}

async function postRedmineIssue(
  baseUrl: string,
  apiKey: string,
  request: RedmineIssueRequest,
): Promise<number> {
  const response = await fetch(createRedmineUrl(baseUrl, "issues.json"), {
    method: "POST",
    headers: defineRedmineHeaders(apiKey, "application/json"),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    const responseDetails = responseBody ? ` ${responseBody}` : "";

    throw new Error(
      `Redmine API request failed: ${response.status} ${response.statusText}${responseDetails}`,
    );
  }

  const body = (await response.json()) as RedmineCreatedIssueResponse;

  return body.issue.id;
}

function createRedmineUrl(baseUrl: string, path: string): URL {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  return new URL(path, normalizedBaseUrl);
}

function defineRedmineHeaders(
  apiKey: string,
  contentType?: string,
): Record<string, string> {
  return {
    Accept: "application/json",
    "X-Redmine-API-Key": apiKey,
    ...(contentType ? { "Content-Type": contentType } : {}),
  };
}

async function readIssueImportProgress(
  progressPath: string,
  dump: DataSourceDump,
  projectId: number,
  trackerId: number,
): Promise<IssueImportProgress> {
  let progress: IssueImportProgress;

  try {
    progress = JSON.parse(
      await readFile(progressPath, "utf8"),
    ) as IssueImportProgress;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }

    return defineIssueImportProgress(dump, projectId, trackerId);
  }

  if (
    progress.source.dataSourceId !== dump.dataSource.id ||
    progress.source.exportedAt !== dump.exportedAt ||
    progress.target.projectId !== projectId ||
    progress.target.trackerId !== trackerId
  ) {
    throw new Error(
      `The progress file belongs to a different dump or Redmine target: ${progressPath}`,
    );
  }

  return progress;
}

function defineIssueImportProgress(
  dump: DataSourceDump,
  projectId: number,
  trackerId: number,
): IssueImportProgress {
  return {
    formatVersion: ISSUE_IMPORT_PROGRESS_FORMAT_VERSION,
    source: {
      dataSourceId: dump.dataSource.id,
      exportedAt: dump.exportedAt,
    },
    target: {
      projectId,
      trackerId,
    },
    created: [],
    failures: [],
  };
}

async function writeIssueImportProgress(
  progressPath: string,
  progress: IssueImportProgress,
): Promise<void> {
  await mkdir(dirname(progressPath), { recursive: true });
  await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}
