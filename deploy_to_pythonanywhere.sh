#!/bin/bash
# Quick deployment script for PythonAnywhere
# Usage: ./deploy_to_pythonanywhere.sh

set -e  # Exit on error

echo "🚀 Deploying WIP Background Processing to PythonAnywhere..."
echo "============================================================"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're on PythonAnywhere
if [[ $(hostname) == *"pythonanywhere"* ]]; then
    echo -e "${GREEN}✅ Running on PythonAnywhere${NC}"
else
    echo -e "${YELLOW}⚠️  Warning: This doesn't appear to be PythonAnywhere${NC}"
    echo "Continue anyway? (y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Step 1: Pull latest changes
echo ""
echo "📥 Step 1: Pulling latest changes from GitHub..."
git pull origin main

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Git pull successful${NC}"
else
    echo "❌ Git pull failed"
    exit 1
fi

# Step 2: Check new files exist
echo ""
echo "📝 Step 2: Verifying new files..."
if [ -f "core/wip_job_manager.py" ] && [ -f "core/wip_background_processor.py" ]; then
    echo -e "${GREEN}✅ New WIP processing files found${NC}"
else
    echo "❌ New files not found"
    exit 1
fi

# Step 3: Initialize database
echo ""
echo "🗄️  Step 3: Initializing WIP jobs database..."
python3 << 'EOF'
try:
    from core.wip_job_manager import get_wip_job_manager
    job_manager = get_wip_job_manager()
    print("✅ WIP job manager initialized and database table created")
except Exception as e:
    print(f"❌ Error initializing job manager: {e}")
    exit(1)
EOF

if [ $? -ne 0 ]; then
    exit 1
fi

# Step 4: Test imports
echo ""
echo "🧪 Step 4: Testing imports..."
python3 << 'EOF'
try:
    from core.wip_job_manager import get_wip_job_manager
    from core.wip_background_processor import process_wip_products_background
    print("✅ All imports working")
except Exception as e:
    print(f"❌ Import error: {e}")
    exit(1)
EOF

if [ $? -ne 0 ]; then
    exit 1
fi

# Step 5: Reload web app
echo ""
echo "🔄 Step 5: Reloading web app..."
echo ""
echo "⚠️  MANUAL STEP REQUIRED:"
echo "Please reload your web app via PythonAnywhere dashboard:"
echo "1. Go to: https://www.pythonanywhere.com/user/<your-username>/webapps/"
echo "2. Click the green 'Reload' button"
echo ""
echo "Or use this command if you have API access:"
echo "  pa_reload_webapp.py <your-domain>"
echo ""

# Step 6: Summary
echo "============================================================"
echo -e "${GREEN}✅ Deployment preparation complete!${NC}"
echo ""
echo "What was deployed:"
echo "  • WIP Job Manager (core/wip_job_manager.py)"
echo "  • Background Processor (core/wip_background_processor.py)"
echo "  • Updated Flask routes (flask_app.py)"
echo "  • Documentation (WIP_BACKGROUND_PROCESSING.md)"
echo ""
echo "New capabilities:"
echo "  • Process up to 100 products without timeouts"
echo "  • Real-time progress via Socket.IO"
echo "  • Job status tracking via API"
echo "  • Resilient error handling"
echo ""
echo "Next steps:"
echo "  1. Reload your web app (see above)"
echo "  2. Test with: curl https://<your-domain>/api/collections"
echo "  3. Review logs: tail -f ~/Cass-Brothers_PIM/logs/app.log"
echo "  4. Read docs: cat WIP_BACKGROUND_PROCESSING.md"
echo ""
echo "🎉 Happy deploying!"
