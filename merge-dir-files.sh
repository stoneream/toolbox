#!/bin/bash

if [ -z "$1" ]; then
  echo "Usage: $0 <target_directory> [output_file_name]"
  exit 1
fi

TARGET_DIR=$1
OUTPUT_FILE_NAME=$2

if [ ! -d "$TARGET_DIR" ]; then
  echo "指定されたディレクトリが存在しません: $TARGET_DIR"
  exit 1
fi

if [ -z "$OUTPUT_FILE" ]; then
  OUTPUT_FILE_NAME="merge_result.txt"
fi

find "$TARGET_DIR" -type f | while IFS= read -r FILE
do
  echo "--- $FILE ---" >> "$OUTPUT_FILE_NAME"

  if file "$FILE" | grep -q text; then
    cat "$FILE" >> "$OUTPUT_FILE_NAME"
  fi

  echo -e "\n\n" >> "$OUTPUT_FILE_NAME"
done
