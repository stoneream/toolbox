#!/bin/bash -u

# Codexの作業完了時に通知音を再生する。
# ~/.codex/config.toml にて以下のような設定をしておくと良い。
#
# notify = ["bash", "/home/user/ghq/github.com/stoneream/toolbox/codex-play-notify.sh"]
#
# 環境変数の `CODEX_NOTIFY_SOUND` で通知音声のファイルパスを指定することもできる。
# 指定がない場合は、`~/.codex/notify.wav` の再生を試みる。

CODEX_DIR="$HOME/.codex"

if [[ ! -d "$CODEX_DIR" ]]; then
  echo "codex directory not found: $CODEX_DIR" >&2
  exit 1
fi

cd -- "$CODEX_DIR" || exit 1

SOUND_FILE="${CODEX_NOTIFY_SOUND:-$CODEX_DIR/notify.wav}"

if [[ ! -f "$SOUND_FILE" ]]; then
  echo "notify sound file not found: $SOUND_FILE" >&2
  exit 1
fi

try_play() {
  cmd="$1"
  shift

  if ! command -v "$cmd" >/dev/null 2>&1; then
    return 1
  fi

  "$cmd" "$@" >/dev/null 2>&1
}

try_play afplay "$SOUND_FILE" && exit 0
try_play paplay "$SOUND_FILE" && exit 0
try_play aplay "$SOUND_FILE" && exit 0
try_play pw-play "$SOUND_FILE" && exit 0
try_play ffplay -nodisp -autoexit -loglevel quiet "$SOUND_FILE" && exit 0
try_play play -q "$SOUND_FILE" && exit 0

echo "no supported audio player found (afplay/paplay/aplay/pw-play/ffplay/play)" >&2
exit 1
