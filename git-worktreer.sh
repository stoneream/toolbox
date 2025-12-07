#!/bin/bash

function worktree_create() {
  # ブランチ名を取得して選択
  BRANCH_NAME=$(git branch --format='%(refname:short)' | peco)
  if [ -z "$BRANCH_NAME" ]; then
    echo "No branch selected."
    return 1
  fi

  # リポジトリのルートディレクトリを取得
  REPO_DIR=$(git rev-parse --show-toplevel 2>/dev/null)
  if [ -z "$REPO_DIR" ]; then
    echo "Error: Not inside a Git repository."
    return 1
  fi

  # リポジトリ名と worktree のパスを設定
  REPO_NAME=$(basename "$REPO_DIR")
  WORKTREE_PATH="$WORKTREES_DIR/${REPO_NAME}_$BRANCH_NAME"

  # ブランチが存在するか確認
  if ! git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
    echo "Error: Branch '$BRANCH_NAME' does not exist. Please create the branch first."
    return 1
  fi

  # 現在のリポジトリでブランチがチェックアウトされているか確認
  CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null)
  if [ "$CURRENT_BRANCH" = "$BRANCH_NAME" ]; then
    echo "Branch '$BRANCH_NAME' is currently checked out. Creating worktree using the current branch."
  fi

  # ブランチが他の worktree にチェックアウトされているか確認
  if git worktree list | grep -q " $BRANCH_NAME$"; then
    echo "Error: Branch '$BRANCH_NAME' is already checked out in another worktree."
    return 1
  fi

  # worktree のパスが既に存在するか確認
  if [ -d "$WORKTREE_PATH" ]; then
    echo "Error: Worktree already exists at $WORKTREE_PATH."
    return 1
  fi

  # worktree を作成
  git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
  if [ $? -eq 0 ]; then
    echo "Worktree created at $WORKTREE_PATH for branch $BRANCH_NAME."
  else
    echo "Error: Failed to create worktree."
    return 1
  fi
}

function worktree_switch() {
  # worktree のパスを取得して選択
  WORKTREE=$(git worktree list | awk '{print $1}' | peco)
  if [ -z "$WORKTREE" ]; then
    echo "No worktree selected."
    return 1
  fi

  # 選択されたパスが存在するか確認
  if [ ! -d "$WORKTREE" ]; then
    echo "Error: Selected worktree directory does not exist: $WORKTREE"
    return 1
  fi

  # 選択された worktree に移動
  cd "$WORKTREE" || {
    echo "Error: Failed to switch to worktree $WORKTREE."
    return 1
  }

  echo "Switched to worktree: $WORKTREE"
}

function worktree_delete() {
  # 削除する worktree を選択
  WORKTREE=$(git worktree list | awk '{print $1}' | peco)
  if [ -z "$WORKTREE" ]; then
    echo "No worktree selected."
    return 1
  fi

  # Worktree に関連付けられたブランチを取得
  BRANCH_NAME=$(git worktree list | grep "$WORKTREE" | awk '{print $2}')

  # Worktree を削除
  git worktree remove "$WORKTREE"
  if [ $? -eq 0 ]; then
    echo "Worktree deleted: $WORKTREE"

    # 関連するブランチを削除するか確認 (デフォルトは N)
    read -p "Do you want to delete the branch '$BRANCH_NAME'? [y/N]: " CONFIRM
    CONFIRM=${CONFIRM:-N}
    if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
      git branch -d "$BRANCH_NAME"
      if [ $? -eq 0 ]; then
        echo "Branch '$BRANCH_NAME' deleted."
      else
        echo "Error: Failed to delete branch '$BRANCH_NAME'."
      fi
    fi
  else
    echo "Error: Failed to delete worktree $WORKTREE."
    return 1
  fi
}

if ! command -v peco &> /dev/null; then
  echo "Error: peco is not installed."
  return 1
fi

WORKTREES_DIR="$HOME/git-worktrees"
if [ ! -d "$WORKTREES_DIR" ]; then
  mkdir -p "$WORKTREES_DIR"
fi

ACTION=$1

if [ "$ACTION" = "c" ]; then
  worktree_create
elif [ "$ACTION" = "s" ]; then
  worktree_switch
elif [ "$ACTION" = "d" ]; then
  worktree_delete
else
  echo "Usage: $0 c"
  echo "       $0 s"
  echo "       $0 del"
  echo "  c: Create a new worktree by selecting a branch using peco."
  echo "  s: Switch to an existing worktree using peco."
  echo "  del: Delete an existing worktree using peco."
  return 1
fi
