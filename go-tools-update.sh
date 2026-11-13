#!/bin/bash

BIN_DIR="$(go env GOBIN)"
[ -n "$BIN_DIR" ] || BIN_DIR="$(go env GOPATH)/bin"

for bin in "$BIN_DIR"/*; do
  pkg="$(go version -m "$bin" 2>/dev/null | awk '$1 == "path" { print $2; exit }')"
  if [ -n "$pkg" ]; then
    echo "Updating $pkg"
    go install "$pkg@latest"
  fi
done
