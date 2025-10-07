#!/bin/bash
# Import Full Supplier Catalog from Google Sheets to PythonAnywhere
# This imports all ~5,900 products from your supplier spreadsheet

echo "=========================================="
echo "📦 Supplier Catalog Import"
echo "=========================================="

# Navigate to project directory
cd ~/Cass-Brothers_PIM || cd /home/scruffy40/Cass-Brothers_PIM || exit 1

echo "📂 Current directory: $(pwd)"

# Pull latest code (includes import_supplier_sheet.py)
echo ""
echo "📥 Pulling latest code from git..."
git pull origin main

# Check if Google credentials are configured
echo ""
echo "🔐 Checking Google Sheets credentials..."
if [ -z "$GOOGLE_CREDENTIALS_JSON" ]; then
    echo "⚠️  WARNING: GOOGLE_CREDENTIALS_JSON not set in environment"
    echo "   You need to add this in PythonAnywhere Files tab > .env file"
    echo "   Or set it in Web > Environment variables"
    exit 1
fi

# Run import script
echo ""
echo "=========================================="
echo "🚀 Starting import of supplier catalog..."
echo "   This will import from Google Sheets:"
echo "   - Abey (968 products)"
echo "   - Caroma (1,798 products)"
echo "   - Argent (618 products)"
echo "   - Villeroy & Boch (761 products)"
echo "   - And 9 more suppliers..."
echo ""
echo "   ⏱️  Estimated time: 2-3 minutes"
echo "=========================================="
echo ""

python3 import_supplier_sheet.py

# Check results
echo ""
echo "=========================================="
echo "📊 Verifying import results..."
echo "=========================================="

# Count total products
echo ""
echo "Total products imported:"
sqlite3 supplier_products.db "SELECT COUNT(*) FROM supplier_products;"

# Show breakdown by supplier
echo ""
echo "Products by supplier:"
sqlite3 supplier_products.db "
    SELECT
        supplier_name AS 'Supplier',
        COUNT(*) AS 'Products',
        COUNT(CASE WHEN image_url IS NOT NULL AND image_url != '' THEN 1 END) AS 'With Images',
        COUNT(CASE WHEN detected_collection IS NOT NULL THEN 1 END) AS 'Collection Detected'
    FROM supplier_products
    GROUP BY supplier_name
    ORDER BY COUNT(*) DESC;
"

# Sample some products
echo ""
echo "Sample products:"
sqlite3 supplier_products.db "
    SELECT sku, supplier_name, detected_collection
    FROM supplier_products
    LIMIT 5;
"

echo ""
echo "=========================================="
echo "✅ Import Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Reload your web app on PythonAnywhere"
echo "2. Go to any collection page (e.g., /sinks)"
echo "3. Click 'Add Product' → 'From Supplier Catalog'"
echo "4. Search by SKU or view missing products"
echo ""
echo "Test SKUs to try:"
echo "  - FRA540 (Abey sink)"
echo "  - 1X942I (Barazza sink)"
echo "  - 231300 (Argent ceiling dropper)"
echo ""
echo "=========================================="
