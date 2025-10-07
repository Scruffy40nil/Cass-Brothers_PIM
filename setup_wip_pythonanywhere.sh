#!/bin/bash
# Run this on PythonAnywhere to set up WIP functionality

echo "=============================================="
echo "SETTING UP WIP FUNCTIONALITY ON PYTHONANYWHERE"
echo "=============================================="

cd /home/cassbrothers/mysite

echo ""
echo "Step 1: Running database migration..."
python3 migrate_wip_schema.py

echo ""
echo "Step 2: Extracting images for test products (if any)..."
python3 extract_test_images.py

echo ""
echo "=============================================="
echo "✅ SETUP COMPLETE!"
echo "=============================================="
echo ""
echo "Next steps:"
echo "1. Reload your web app in PythonAnywhere dashboard"
echo "2. Go to your collection page (e.g., Sinks)"
echo "3. Click 'Add Product' → 'From Supplier Catalog'"
echo "4. Try the WIP workflow!"
echo ""
