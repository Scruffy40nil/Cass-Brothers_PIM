#!/bin/bash

echo "🔍 PYTHONANYWHERE DEPLOYMENT VERIFICATION"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "📋 STEP 1: Check Git Status"
echo "----------------------------"
git status
echo ""

echo "📋 STEP 2: Verify Latest Commit"
echo "----------------------------"
echo "Latest commit should be: fc56a3e"
git log --oneline -1
echo ""

echo "📋 STEP 3: Check Key Files"
echo "----------------------------"

# Check if WIP modal changes exist in base.html
if grep -q "Processing Queue" templates/collection/base.html; then
    echo -e "${GREEN}✅ base.html: 'Processing Queue' tab found${NC}"
else
    echo -e "${RED}❌ base.html: 'Processing Queue' tab NOT found${NC}"
fi

if grep -q "stage-extracting" templates/collection/base.html; then
    echo -e "${GREEN}✅ base.html: Processing stage CSS found${NC}"
else
    echo -e "${RED}❌ base.html: Processing stage CSS NOT found${NC}"
fi

# Check if JavaScript changes exist
if grep -q "AI Extracting Data..." static/js/collection/add_products.js; then
    echo -e "${GREEN}✅ add_products.js: Stage indicators found${NC}"
else
    echo -e "${RED}❌ add_products.js: Stage indicators NOT found${NC}"
fi

if grep -q "pending,extracting,generating,cleaning" static/js/collection/add_products.js; then
    echo -e "${GREEN}✅ add_products.js: Multi-status loading found${NC}"
else
    echo -e "${RED}❌ add_products.js: Multi-status loading NOT found${NC}"
fi

echo ""
echo "📋 STEP 4: PYTHONANYWHERE DEPLOYMENT STEPS"
echo "-------------------------------------------"
echo "1. Open PythonAnywhere Bash console"
echo "2. Run: cd ~/Cass-Brothers_PIM"
echo "3. Run: git pull origin main"
echo "4. Run: touch /var/www/*_wsgi.py"
echo "5. OR click 'Reload' in Web tab"
echo ""
echo "📋 STEP 5: BROWSER CACHE CLEARING"
echo "-------------------------------------------"
echo "After deploying on PythonAnywhere:"
echo "• Chrome/Edge/Firefox (Windows): Ctrl + Shift + R"
echo "• Chrome/Edge/Firefox (Mac): Cmd + Shift + R"
echo "• Or open DevTools (F12) → Network tab → Check 'Disable cache'"
echo ""
echo "📋 STEP 6: VERIFY IN BROWSER"
echo "-------------------------------------------"
echo "1. Open PIM in browser"
echo "2. Open DevTools (F12) → Console tab"
echo "3. Look for any JavaScript errors"
echo "4. Go to Network tab → Look for add_products.js"
echo "   - It should have ?v=<timestamp> in the URL"
echo "   - Status should be 200 (or 304 if cached but current)"
echo ""
echo "=========================================="
echo "If you still see old tabs after all steps:"
echo "1. Check you pulled the latest code (fc56a3e)"
echo "2. Check you reloaded the web app"
echo "3. Do a HARD refresh in browser (Ctrl+Shift+R)"
echo "=========================================="
