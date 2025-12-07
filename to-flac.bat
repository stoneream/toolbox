@echo off

REM ドラッグアンドドロップで渡したファイルを.flac形式に変換する

setlocal enabledelayedexpansion

set "output_dir=flac"

if not exist "%output_dir%" (
    mkdir "%output_dir%"
)

for %%A in (%*) do (
  set "input_file=%%~nA"

  set "output_file=%output_dir%\!input_file!.flac"

  ffmpeg -i "%%~A" -c:a flac -compression_level 0 "!output_file!"
)

pause
