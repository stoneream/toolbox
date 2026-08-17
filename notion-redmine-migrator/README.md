# notion-redmine-migrator

## required

- Node.js 24
- pnpm 11
- direnv

## setup

```sh
pnpm install

cp .envrc.example .envrc

# NotionのPAT、RedmineのURLとAPIキーを設定
# https://app.notion.com/developers
# RedmineのAPIキーは <REDMINE_URL>/my/account で確認
vim .envrc

direnv allow
```

## usage

### データソース一覧を取得する

```sh
pnpm dev notion data-sources list

pnpm dev notion data-sources list --json
```
### データソースをJSONへダンプする

データソースIDを指定すると、データソースのスキーマと全行をJSONファイルへ保存します。

```sh
# デフォルトは dumps/ 以下に出力される
pnpm dev notion data-sources dump <data-source-id>

pnpm dev notion data-sources dump <data-source-id> --output-dir output
```

### ダンプから完了・キャンセル済みの行を除外する

ダンプファイルの `status` が `close` または `cancel` の行を除外し、同じディレクトリに `_filtered` を付けた別ファイルとして保存します。元のダンプファイルは変更しません。

```sh
pnpm dev notion data-sources filter dumps/<dump-file>.json

# 出力先を指定する場合
pnpm dev notion data-sources filter dumps/<dump-file>.json --output dumps/active.json
```

### Redmineプロジェクト一覧を取得する

RedmineのREST APIが有効になっていることを確認してください。

```sh
pnpm dev redmine projects list

pnpm dev redmine projects list --json
```

### ダンプからRedmineチケットを作成する

Notionの `title`、`status`、`priority`、`deadline_at` をRedmineの件名、ステータス、優先度、期日へ変換します。`status` が `close` または `cancel` の行は自動的に除外されます。

通常実行はdry-runです。Redmineへは作成せず、送信予定のJSONを標準出力します。

```sh
pnpm dev redmine issues import dumps/<dump-file>.json \
  --project-id <project-id> \
  --tracker-id <tracker-id>
```

内容を確認後、`--execute` を付けるとRedmineへチケットを作成します。

```sh
pnpm dev redmine issues import dumps/<dump-file>.json \
  --project-id <project-id> \
  --tracker-id <tracker-id> \
  --execute
```

作成結果は入力ファイルと同じ場所の `<dump-file>_redmine-import.json` に保存されます。失敗した行があっても残りの作成を続けます。同じコマンドを再実行すると作成済みの行をスキップし、失敗した行を再試行します。進捗ファイルの場所は `--progress-file` で変更できます。

[Redmine REST API](https://www.redmine.org/projects/redmine/wiki/REST_Api)

### ビルドして実行する

TypeScriptをビルドしてから実行する場合は、次のコマンドを使用します。

```sh
pnpm build
pnpm start notion data-sources list
```

ダンプコマンドや各オプションも、`pnpm dev` の場合と同様に指定できます。

## ダンプファイル

ファイル名にはデータソースIDとUTCの出力日時が含まれます。

```text
dumps/<data-source-id>_<YYYY-MM-DDTHH-mm-ss.sssZ>.json
```

JSONは次の構造で保存されます。

```json
{
  "formatVersion": 1,
  "notionApiVersion": "2026-03-11",
  "exportedAt": "2026-08-17T00:00:00.000Z",
  "dataSource": {},
  "rowCount": 0,
  "rows": []
}
```

ページ本文のブロックはダンプ対象に含まれません。
