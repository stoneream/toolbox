#!/bin/bash

main() {
  local RECURSIVE=false
  local TARGET_DIR
  local OUTPUT_FILE_NAME
  local OUTPUT_FILE_PATH
  local FIND_ARGS

  while [ $# -gt 0 ]; do
    case "$1" in
      -r|--recursive)
        RECURSIVE=true
        shift
        ;;
      -h|--help)
        echo "Usage: $0 [-r|--recursive] <target_directory> [output_file_name]"
        return 0
        ;;
      --)
        shift
        break
        ;;
      -*)
        echo "Unknown option: $1"
        echo "Usage: $0 [-r|--recursive] <target_directory> [output_file_name]"
        return 1
        ;;
      *)
        break
        ;;
    esac
  done

  if [ -z "$1" ]; then
    echo "Usage: $0 [-r|--recursive] <target_directory> [output_file_name]"
    return 1
  fi

  TARGET_DIR=$1
  OUTPUT_FILE_NAME=$2

  if [ ! -d "$TARGET_DIR" ]; then
    echo "指定されたディレクトリが存在しません: $TARGET_DIR"
    return 1
  fi

  if [ -z "$OUTPUT_FILE_NAME" ]; then
    OUTPUT_FILE_NAME="merge_result.txt"
  fi

  OUTPUT_FILE_PATH=$(realpath "$OUTPUT_FILE_NAME")
  : > "$OUTPUT_FILE_NAME"

  if [ "$RECURSIVE" = true ]; then
    FIND_ARGS=("$TARGET_DIR" -type f)
  else
    FIND_ARGS=("$TARGET_DIR" -maxdepth 1 -type f)
  fi

  find "${FIND_ARGS[@]}" | while IFS= read -r FILE
  do
    if [ "$(realpath "$FILE")" = "$OUTPUT_FILE_PATH" ]; then
      continue
    fi

    echo "--- $FILE ---" >> "$OUTPUT_FILE_NAME"

    if file "$FILE" | grep -q text; then
      cat "$FILE" >> "$OUTPUT_FILE_NAME"
    fi

    echo -e "\n\n" >> "$OUTPUT_FILE_NAME"
  done
}

main "$@"
