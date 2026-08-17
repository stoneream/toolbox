#!/usr/bin/env node

import { readFileSync } from "node:fs";

import yargs, {
  type ArgumentsCamelCase,
  type CommandModule,
} from "yargs";
import { hideBin } from "yargs/helpers";

import {
  createNotionClient,
  getDataSourceDump,
  listDataSources,
} from "./notion/data-sources.js";
import {
  createDataSourceDump,
  filterDataSourceDumpFile,
  formatDataSourceTable,
  readDataSourceDumpFile,
  writeDataSourceDumpFile,
} from "./output/data-sources.js";
import {
  executeRedmineIssueImport,
  getDefaultIssueImportProgressPath,
  prepareRedmineIssueImport,
} from "./redmine/issues.js";
import {
  formatProjectTable,
  listProjects,
} from "./redmine/projects.js";

const APPLICATION_NAME = "notion-redmine-migrator";
const DEFAULT_DUMP_DIRECTORY = "dumps";
const NOTION_TOKEN_ENVIRONMENT_VARIABLE_NAME = "NOTION_TOKEN";
const REDMINE_URL_ENVIRONMENT_VARIABLE_NAME = "REDMINE_URL";
const REDMINE_API_KEY_ENVIRONMENT_VARIABLE_NAME = "REDMINE_API_KEY";
const COMPACT_UUID_PATTERN = /^[0-9a-f]{32}$/i;
const HYPHENATED_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ListCommandArguments {
  json: boolean;
}

interface DumpCommandArguments {
  "data-source-id": string;
  "output-dir": string;
}

interface FilterDumpCommandArguments {
  "dump-file": string;
  output: string | undefined;
}

interface ImportIssuesCommandArguments {
  "dump-file": string;
  "project-id": number;
  "tracker-id": number;
  execute: boolean;
  "progress-file": string | undefined;
}

try {
  await createParser(hideBin(process.argv)).parseAsync();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function createParser(argumentsToParse: ReadonlyArray<string>) {
  return yargs(argumentsToParse)
    .scriptName(APPLICATION_NAME)
    .usage("$0 <command>")
    .command(defineNotionCommand())
    .command(defineRedmineCommand())
    .demandCommand(1, "A command is required.")
    .strict()
    .recommendCommands()
    .wrap(140)
    .help()
    .version(readPackageVersion())
    .showHelpOnFail(false)
    .exitProcess(false)
    .fail((message, error) => {
      throw error ?? new Error(message || "Invalid command.");
    });
}

function defineNotionCommand(): CommandModule<object, object> {
  return {
    command: "notion",
    describe: "Access Notion resources",
    builder: (parser) =>
      parser
        .command(defineDataSourcesCommand())
        .demandCommand(1, "A Notion resource command is required.")
        .strictCommands(),
    handler: () => undefined,
  };
}

/** データソースの一覧取得とダンプ出力を配下に持つコマンドを定義する。 */
function defineDataSourcesCommand(): CommandModule<object, object> {
  return {
    command: "data-sources",
    describe: "Access Notion data sources",
    builder: (parser) =>
      parser
        .command(defineListDataSourcesCommand())
        .command(defineDumpDataSourceCommand())
        .command(defineFilterDataSourceDumpCommand())
        .demandCommand(1, "A data source command is required.")
        .strictCommands(),
    handler: () => undefined,
  };
}

/** 共有されたデータソースを取得し、表またはJSONで表示するコマンドを定義する。 */
function defineListDataSourcesCommand(): CommandModule<
  object,
  ListCommandArguments
> {
  return {
    command: "list",
    describe: "List Notion data sources shared with the connection",
    builder: (parser) =>
      parser.option("json", {
        type: "boolean",
        default: false,
        description: "Output the list as JSON",
      }),
    handler: async (arguments_: ArgumentsCamelCase<ListCommandArguments>) => {
      const client = createNotionClient(
        readRequiredEnvironmentVariable(
          NOTION_TOKEN_ENVIRONMENT_VARIABLE_NAME,
        ),
      );
      const dataSources = await listDataSources(client);
      const output = arguments_.json
        ? JSON.stringify(dataSources, null, 2)
        : formatDataSourceTable(dataSources);

      process.stdout.write(`${output}\n`);
    },
  };
}

/** 指定したデータソースのスキーマと行をJSONへ保存するコマンドを定義する。 */
function defineDumpDataSourceCommand(): CommandModule<
  object,
  DumpCommandArguments
> {
  return {
    command: "dump <data-source-id>",
    describe: "Dump a Notion data source schema and rows to JSON",
    builder: (parser) =>
      parser
        .positional("data-source-id", {
          type: "string",
          demandOption: true,
          description: "Notion data source ID",
          coerce: normalizeDataSourceId,
        })
        .option("output-dir", {
          alias: "o",
          type: "string",
          default: DEFAULT_DUMP_DIRECTORY,
          description: "Directory where the timestamped dump is written",
          coerce: normalizeOutputDirectory,
        }),
    handler: async (arguments_: ArgumentsCamelCase<DumpCommandArguments>) => {
      const client = createNotionClient(
        readRequiredEnvironmentVariable(
          NOTION_TOKEN_ENVIRONMENT_VARIABLE_NAME,
        ),
      );
      const exportedAt = new Date();
      const dumpData = await getDataSourceDump(client, arguments_.dataSourceId);
      const dump = createDataSourceDump(dumpData, exportedAt);
      const outputPath = await writeDataSourceDumpFile(
        arguments_.outputDir,
        arguments_.dataSourceId,
        exportedAt,
        dump,
      );

      process.stdout.write(
        `Dumped ${dump.rowCount} rows to ${outputPath}\n`,
      );
    },
  };
}

/** dump済みデータからstatusがcloseまたはcancelの行を除外するコマンドを定義する。 */
function defineFilterDataSourceDumpCommand(): CommandModule<
  object,
  FilterDumpCommandArguments
> {
  return {
    command: "filter <dump-file>",
    describe: "Exclude close and cancel rows from a data source dump",
    builder: (parser) =>
      parser
        .positional("dump-file", {
          type: "string",
          demandOption: true,
          description: "Path to a data source dump JSON file",
        })
        .option("output", {
          alias: "o",
          type: "string",
          description: "Path where the filtered dump is written",
        }),
    handler: async (
      arguments_: ArgumentsCamelCase<FilterDumpCommandArguments>,
    ) => {
      const result = await filterDataSourceDumpFile(
        arguments_.dumpFile,
        arguments_.output,
      );

      process.stdout.write(
        `Excluded ${result.removedRowCount} close/cancel rows and wrote ${result.rowCount} rows to ${result.outputPath}\n`,
      );
    },
  };
}

/** Redmineに関するサブコマンドをまとめるルートコマンドを定義する。 */
function defineRedmineCommand(): CommandModule<object, object> {
  return {
    command: "redmine",
    describe: "Access Redmine resources",
    builder: (parser) =>
      parser
        .command(defineProjectsCommand())
        .command(defineIssuesCommand())
        .demandCommand(1, "A Redmine resource command is required.")
        .strictCommands(),
    handler: () => undefined,
  };
}

/** プロジェクト操作を配下に持つコマンドを定義する。 */
function defineProjectsCommand(): CommandModule<object, object> {
  return {
    command: "projects",
    describe: "Access Redmine projects",
    builder: (parser) =>
      parser
        .command(defineListProjectsCommand())
        .demandCommand(1, "A project command is required.")
        .strictCommands(),
    handler: () => undefined,
  };
}

/** 閲覧可能なRedmineプロジェクトを取得し、表またはJSONで表示するコマンドを定義する。 */
function defineListProjectsCommand(): CommandModule<
  object,
  ListCommandArguments
> {
  return {
    command: "list",
    describe: "List accessible Redmine projects",
    builder: (parser) =>
      parser.option("json", {
        type: "boolean",
        default: false,
        description: "Output the list as JSON",
      }),
    handler: async (arguments_: ArgumentsCamelCase<ListCommandArguments>) => {
      const projects = await listProjects(
        readRequiredEnvironmentVariable(REDMINE_URL_ENVIRONMENT_VARIABLE_NAME),
        readRequiredEnvironmentVariable(
          REDMINE_API_KEY_ENVIRONMENT_VARIABLE_NAME,
        ),
      );
      const output = arguments_.json
        ? JSON.stringify(projects, null, 2)
        : formatProjectTable(projects);

      process.stdout.write(`${output}\n`);
    },
  };
}

/** Redmineチケット操作を配下に持つコマンドを定義する。 */
function defineIssuesCommand(): CommandModule<object, object> {
  return {
    command: "issues",
    describe: "Access Redmine issues",
    builder: (parser) =>
      parser
        .command(defineImportIssuesCommand())
        .demandCommand(1, "An issue command is required.")
        .strictCommands(),
    handler: () => undefined,
  };
}

/** NotionのdumpをRedmineチケットへ変換し、確認または作成するコマンドを定義する。 */
function defineImportIssuesCommand(): CommandModule<
  object,
  ImportIssuesCommandArguments
> {
  return {
    command: "import <dump-file>",
    describe: "Import a Notion data source dump as Redmine issues",
    builder: (parser) =>
      parser
        .positional("dump-file", {
          type: "string",
          demandOption: true,
          description: "Path to a Notion data source dump JSON file",
        })
        .option("project-id", {
          type: "number",
          demandOption: true,
          description: "Redmine project ID",
        })
        .option("tracker-id", {
          type: "number",
          demandOption: true,
          description: "Redmine tracker ID",
        })
        .option("execute", {
          type: "boolean",
          default: false,
          description: "Create the issues in Redmine",
        })
        .option("progress-file", {
          type: "string",
          description: "Path to the import progress JSON file",
        }),
    handler: async (
      arguments_: ArgumentsCamelCase<ImportIssuesCommandArguments>,
    ) => {
      const baseUrl = readRequiredEnvironmentVariable(
        REDMINE_URL_ENVIRONMENT_VARIABLE_NAME,
      );
      const apiKey = readRequiredEnvironmentVariable(
        REDMINE_API_KEY_ENVIRONMENT_VARIABLE_NAME,
      );
      const dump = await readDataSourceDumpFile(arguments_.dumpFile);
      const issues = await prepareRedmineIssueImport(
        baseUrl,
        apiKey,
        dump,
        arguments_.projectId,
        arguments_.trackerId,
      );

      if (!arguments_.execute) {
        process.stdout.write(`${JSON.stringify(issues, null, 2)}\n`);
        return;
      }

      const progressPath =
        arguments_.progressFile ??
        getDefaultIssueImportProgressPath(arguments_.dumpFile);
      const result = await executeRedmineIssueImport(
        baseUrl,
        apiKey,
        dump,
        arguments_.projectId,
        arguments_.trackerId,
        issues,
        progressPath,
      );

      const summary = [
        `Created ${result.createdCount}`,
        `skipped ${result.skippedCount}`,
        `failed ${result.failedCount}`,
      ].join(", ");

      process.stdout.write(
        `${summary}. Progress: ${result.progressPath}\n`,
      );

      if (result.failedCount > 0) {
        throw new Error(
          `${result.failedCount} issues could not be created. See ${result.progressPath}.`,
        );
      }
    },
  };
}

/** 必須の環境変数を読み取る。 */
function readRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} environment variable is required.`);
  }

  return value;
}

/** NotionのデータソースIDをハイフン付きUUID形式へ統一する。 */
function normalizeDataSourceId(value: string): string {
  const candidate = value.trim().toLowerCase();

  if (HYPHENATED_UUID_PATTERN.test(candidate)) {
    return candidate;
  }

  if (!COMPACT_UUID_PATTERN.test(candidate)) {
    throw new Error(
      "The data source ID must be a 32-character Notion UUID, with or without hyphens.",
    );
  }

  return [
    candidate.slice(0, 8),
    candidate.slice(8, 12),
    candidate.slice(12, 16),
    candidate.slice(16, 20),
    candidate.slice(20),
  ].join("-");
}

/** 空でない出力先ディレクトリをCLI引数として受け付ける。 */
function normalizeOutputDirectory(value: string): string {
  if (!value.trim()) {
    throw new Error("The output directory must not be empty.");
  }

  return value;
}

/** CLIのバージョン表示に使用する値をpackage.jsonから読み取る。 */
function readPackageVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };

  return packageJson.version;
}
