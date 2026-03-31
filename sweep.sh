#!/bin/bash
# Pre-deploy content sweep for Legara site
# Run before any push: ./sweep.sh
# Checks for known anti-patterns in prospect-facing files

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color
BOLD='\033[1m'

ISSUES=0
WARNINGS=0

echo ""
echo "${BOLD}Legara Pre-Deploy Content Sweep${NC}"
echo "================================"
echo ""

# 1. Em dashes in emails/PDFs/ads (content from individuals)
# Note: em dashes in website brand copy (index.html, etc.) are a style choice, not a violation.
# This check targets files where content is attributed to Roger personally.
echo "${BOLD}[1] Em dashes in individual-attributed content${NC}"
EM_DASH_HITS=$(grep -rn '—' src/worker.js js/pdf-generator.js 2>/dev/null)
if [ -n "$EM_DASH_HITS" ]; then
    echo -e "${RED}FOUND:${NC}"
    echo "$EM_DASH_HITS"
    ISSUES=$((ISSUES + $(echo "$EM_DASH_HITS" | wc -l)))
else
    echo -e "${GREEN}Clean${NC}"
fi
echo ""

# 2. "BH" as standalone abbreviation (not part of longer words)
echo "${BOLD}[2] Standalone 'BH' abbreviation${NC}"
BH_HITS=$(grep -rn '\bBH\b' --include='*.html' --include='*.js' . 2>/dev/null | grep -v 'node_modules' | grep -v '\.min\.' | grep -v '// ')
if [ -n "$BH_HITS" ]; then
    echo -e "${RED}FOUND:${NC}"
    echo "$BH_HITS"
    ISSUES=$((ISSUES + $(echo "$BH_HITS" | wc -l)))
else
    echo -e "${GREEN}Clean${NC}"
fi
echo ""

# 3. Wrong Brevo variable format
echo "${BOLD}[3] Wrong Brevo variables ({{contact.}} should be {{params.}})${NC}"
BREVO_HITS=$(grep -rn '{{contact\.' --include='*.html' --include='*.js' . 2>/dev/null)
if [ -n "$BREVO_HITS" ]; then
    echo -e "${RED}FOUND:${NC}"
    echo "$BREVO_HITS"
    ISSUES=$((ISSUES + $(echo "$BREVO_HITS" | wc -l)))
else
    echo -e "${GREEN}Clean${NC}"
fi
echo ""

# 4. TODO/FIXME/HACK in prospect-facing files
echo "${BOLD}[4] TODO/FIXME/HACK comments${NC}"
TODO_HITS=$(grep -rn 'TODO\|FIXME\|HACK' --include='*.html' --include='*.js' . 2>/dev/null | grep -v 'node_modules' | grep -v 'sweep.sh')
if [ -n "$TODO_HITS" ]; then
    echo -e "${YELLOW}FOUND:${NC}"
    echo "$TODO_HITS"
    WARNINGS=$((WARNINGS + $(echo "$TODO_HITS" | wc -l)))
else
    echo -e "${GREEN}Clean${NC}"
fi
echo ""

# 5. PLACEHOLDER/TBD in prospect-facing files
echo "${BOLD}[5] PLACEHOLDER or TBD content${NC}"
PLACEHOLDER_HITS=$(grep -rn '\[PLACEHOLDER\|\[TBD\|\[DRAFT\|\[INSERT' --include='*.html' --include='*.js' . 2>/dev/null | grep -v 'node_modules' | grep -v 'sweep.sh')
if [ -n "$PLACEHOLDER_HITS" ]; then
    echo -e "${RED}FOUND — do NOT push with placeholder content:${NC}"
    echo "$PLACEHOLDER_HITS"
    ISSUES=$((ISSUES + $(echo "$PLACEHOLDER_HITS" | wc -l)))
else
    echo -e "${GREEN}Clean${NC}"
fi
echo ""

# 6. "Co-Founder" in Roger's title
echo "${BOLD}[6] 'Co-Founder' in Roger's title (should be 'CEO' only)${NC}"
COFOUNDER_HITS=$(grep -rn 'Co-Founder\|Co-founder\|Cofounder' --include='*.html' --include='*.js' . 2>/dev/null)
if [ -n "$COFOUNDER_HITS" ]; then
    echo -e "${RED}FOUND:${NC}"
    echo "$COFOUNDER_HITS"
    ISSUES=$((ISSUES + $(echo "$COFOUNDER_HITS" | wc -l)))
else
    echo -e "${GREEN}Clean${NC}"
fi
echo ""

# 7. AI filler phrases
echo "${BOLD}[7] AI filler phrases${NC}"
AI_HITS=$(grep -rni "I hope this email finds you\|I'd be happy to\|Let's dive in\|Here's the thing:\|We're excited to" --include='*.html' --include='*.js' . 2>/dev/null | grep -v 'node_modules' | grep -v 'sweep.sh')
if [ -n "$AI_HITS" ]; then
    echo -e "${YELLOW}FOUND:${NC}"
    echo "$AI_HITS"
    WARNINGS=$((WARNINGS + $(echo "$AI_HITS" | wc -l)))
else
    echo -e "${GREEN}Clean${NC}"
fi
echo ""

# 8. "Savings" as headline/lead framing (not supporting)
echo "${BOLD}[8] 'Savings' in headlines or h1/h2/h3 tags${NC}"
SAVINGS_HITS=$(grep -rni '<h[1-3].*savings\|savings.*</h[1-3]>' --include='*.html' . 2>/dev/null)
if [ -n "$SAVINGS_HITS" ]; then
    echo -e "${YELLOW}FOUND:${NC}"
    echo "$SAVINGS_HITS"
    WARNINGS=$((WARNINGS + $(echo "$SAVINGS_HITS" | wc -l)))
else
    echo -e "${GREEN}Clean${NC}"
fi
echo ""

# Summary
echo "================================"
if [ $ISSUES -gt 0 ]; then
    echo -e "${RED}${BOLD}$ISSUES issue(s) found — fix before pushing${NC}"
elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}${BOLD}$WARNINGS warning(s) — review before pushing${NC}"
else
    echo -e "${GREEN}${BOLD}All clear${NC}"
fi
echo ""
