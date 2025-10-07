#!/bin/bash
# Import supplier catalog from Google Sheets on PythonAnywhere

echo "=========================================="
echo "Supplier Catalog Import"
echo "=========================================="

# Navigate to project directory
cd ~/Cass-Brothers_PIM || cd /home/scruffy40/Cass-Brothers_PIM || exit 1

echo "Current directory: $(pwd)"
echo ""

# Pull latest code
echo "Pulling latest code from git..."
git pull origin main

echo ""
echo "=========================================="
echo "Starting import..."
echo "=========================================="
echo ""

# Run import script (without extracting images - that comes later)
python3 import_supplier_sheet.py

# Check results
echo ""
echo "=========================================="
echo "Verifying import results..."
echo "=========================================="
echo ""

# Count total products
echo "Total products imported:"
sqlite3 supplier_products.db "SELECT COUNT(*) FROM supplier_products;"

echo ""
echo "Products by supplier:"
sqlite3 supplier_products.db "SELECT supplier_name, COUNT(*) FROM supplier_products GROUP BY supplier_name ORDER BY COUNT(*) DESC;"

echo ""
echo "=========================================="
echo "Import Complete!"
echo "=========================================="
echo ""
echo "Next: Extract images (optional, can run overnight):"
echo "  python3 extract_test_images.py"
echo ""
echo "Then: Reload your web app on PythonAnywhere"
echo "=========================================="
