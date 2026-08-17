import { formatTable } from "../lib/table.js";

const PAGE_SIZE = 100;
const TABLE_HEADERS = ["ID", "IDENTIFIER", "NAME", "PUBLIC"] as const;

interface RedmineProject {
  id: number;
  identifier: string;
  name: string;
  is_public: boolean;
}

interface RedmineProjectsResponse {
  projects: RedmineProject[];
  total_count: number;
}

export interface RedmineProjectSummary {
  id: number;
  identifier: string;
  name: string;
  isPublic: boolean;
}

/** Redmine APIから閲覧可能なプロジェクトを全件取得する。 */
export async function listProjects(
  baseUrl: string,
  apiKey: string,
): Promise<RedmineProjectSummary[]> {
  const projects: RedmineProjectSummary[] = [];
  let offset = 0;
  let totalCount = 0;

  do {
    const url = createProjectsUrl(baseUrl, offset);
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Redmine-API-Key": apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Redmine API request failed: ${response.status} ${response.statusText}`,
      );
    }

    const page = (await response.json()) as RedmineProjectsResponse;
    projects.push(...page.projects.map(toProjectSummary));
    totalCount = page.total_count;

    if (page.projects.length === 0) {
      break;
    }

    offset += page.projects.length;
  } while (offset < totalCount);

  return projects;
}

/** Redmineプロジェクトの一覧を表形式へ整形する。 */
export function formatProjectTable(
  projects: ReadonlyArray<RedmineProjectSummary>,
): string {
  if (projects.length === 0) {
    return "No projects found.";
  }

  const rows = projects.map((project) => [
    String(project.id),
    project.identifier,
    project.name,
    String(project.isPublic),
  ]);

  return formatTable(TABLE_HEADERS, rows);
}

function createProjectsUrl(baseUrl: string, offset: number): URL {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL("projects.json", normalizedBaseUrl);

  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));

  return url;
}

function toProjectSummary(project: RedmineProject): RedmineProjectSummary {
  return {
    id: project.id,
    identifier: project.identifier,
    name: project.name,
    isPublic: project.is_public,
  };
}
