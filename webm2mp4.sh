#!/bin/bash

webm2mp4() {
  local file

  file=$(ls *.webm 2>/dev/null | peco)

  if [[ -z "$file" ]]; then
    echo "ファイルが選択されませんでした"
    return 1
  fi

  local output="${file%.webm}.mp4"

  ffmpeg -i "$file" \
    -vf "pad=ceil(iw/2)*2:ceil(ih/2)*2" \
    -r 60 \
    -preset medium \
    -crf 23 \
    -profile:v high \
    -movflags +faststart \
    -c:a aac \
    -b:a 256k \
    "$output"
}
