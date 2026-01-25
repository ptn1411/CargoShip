#!/bin/bash
# Pre-push check script for CargoShip
# Run this before pushing to ensure code quality

set -e

echo "🔍 Running pre-push checks..."
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track failures
FAILED=0

# Frontend checks
echo "📦 Checking Frontend..."
echo "------------------------"

echo -n "  TypeScript type check... "
if npx tsc --noEmit 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    FAILED=1
fi

echo -n "  ESLint... "
if npm run lint --if-present 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}⚠ (no lint script)${NC}"
fi

echo -n "  Build frontend... "
if npm run build 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    FAILED=1
fi

echo ""

# Backend checks
echo "🦀 Checking Backend (Rust)..."
echo "-----------------------------"

cd src-tauri

echo -n "  Cargo check... "
if cargo check --all-features 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    FAILED=1
fi

echo -n "  Cargo clippy... "
if cargo clippy --all-features -- -D warnings 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    FAILED=1
fi

echo -n "  Cargo fmt check... "
if cargo fmt --check 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}⚠ (formatting issues)${NC}"
fi

cd ..

echo ""
echo "========================"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Safe to push.${NC}"
    exit 0
else
    echo -e "${RED}❌ Some checks failed. Please fix before pushing.${NC}"
    exit 1
fi
