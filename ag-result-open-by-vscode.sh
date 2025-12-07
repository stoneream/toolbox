#!/bin/bash

if [ -z "$1" ]; then
  echo "Usage: $0 <search_pattern>"
  exit 1
fi

tmpfile=$(mktemp)
ag "$1" > "$tmpfile"

cat "$tmpfile"

cat "$tmpfile" | awk -F: '
  { 
    if (NF >= 2 && $2 ~ /^[0-9]+$/) {
      print $1 ":" $2
    }
  }
' | while IFS= read -r target; do
  file=$(echo "$target" | cut -d: -f1)
  line=$(echo "$target" | cut -d: -f2)
  fullpath=$(realpath "$file" 2>/dev/null || echo "$file")
  full_target="${fullpath}:${line}"
  
  code -n -g "$full_target" < /dev/null
done

rm -f "$tmpfile"
