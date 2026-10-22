#!/usr/bin/env bash
set -e

# Git 저장소가 아니면 패스
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

CHANGED_FILES=$(git status --porcelain | wc -l | tr -d ' ')
if [ "$CHANGED_FILES" -eq 0 ]; then
  exit 0
fi

echo "🔍 [Litmus Hook] 변경 사항 감지 - 기존 기능/디자인 보호 및 사이트 작동 검증을 시작합니다..."

# 1. 계획서(POLARIS_PLAN.md) 없이 여러 파일을 임의로 건드렸는지 차단
MODIFIED_SRC=$(git status --porcelain | awk '{print $2}' | grep -E '\.(html|css|scss|ts|tsx|js|jsx|py|vue|svelte)$' | grep -vE '(test|spec)' | wc -l | tr -d ' ' || true)
MODIFIED_PLAN=$(git status --porcelain | awk '{print $2}' | grep -E '(POLARIS_PLAN\.md|SUCCESS_CRITERIA\.md)' | wc -l | tr -d ' ' || true)

if [ "${MODIFIED_SRC:-0}" -ge 3 ] && [ "${MODIFIED_PLAN:-0}" -eq 0 ]; then
  echo "❌ [Litmus 차단] docs/POLARIS_PLAN.md에 작업 계획과 수정 대상 파일을 먼저 기록하지 않고 3개 이상의 파일을 수정했습니다." >&2
  echo "기존 기능과 디자인을 보호하기 위해 먼저 docs/POLARIS_PLAN.md를 업데이트하고 꼭 필요한 파일만 수정하세요." >&2
  exit 2
fi

# 2. 기술 스택 자동 감지 및 검증 실행 (사용자가 스택을 몰라도 자동 동작)
if [ -f "package.json" ]; then
  echo "📦 [자동 감지] 웹/Node.js 프로젝트 환경을 검사합니다..."
  npm run typecheck --if-present
  npm run lint --if-present
  npm test --if-present
fi

if [ -f "pyproject.toml" ] || [ -f "pytest.ini" ] || [ -f "requirements.txt" ]; then
  echo "🐍 [자동 감지] Python 프로젝트 환경을 검사합니다..."
  if command -v pytest >/dev/null 2>&1 && [ -d "tests" ]; then
    pytest
  fi
fi

# JS/HTML 문법 오류 기본 체크 (Node가 있는 경우 변경된 .js 파일 문법 오류 확인)
if command -v node >/dev/null 2>&1; then
  for jsfile in $(git status --porcelain | awk '{print $2}' | grep -E '\.m?js$' || true); do
    if [ -f "$jsfile" ]; then
      node --check "$jsfile"
    fi
  done
fi

echo "✅ [Litmus 통과] 자동 검증을 통과했습니다. 기존 디자인과 기능이 그대로 유지되었는지 화면에서 최종 확인하세요."
exit 0
