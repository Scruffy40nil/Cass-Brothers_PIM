#!/bin/bash
# Setup test data on PythonAnywhere
# Run this script on PythonAnywhere to import test supplier products

echo "========================================="
echo "Setting up test supplier products"
echo "========================================="

# Make sure we're in the right directory
cd ~/Cass-Brothers_PIM || cd /home/scruffy40/Cass-Brothers_PIM || exit 1

echo "Current directory: $(pwd)"

# Pull latest code
echo ""
echo "📥 Pulling latest code from git..."
git pull origin main

# Run import script
echo ""
echo "📦 Importing test products..."
python3 test_import_supplier_products.py

# Update collection detection
echo ""
echo "🔧 Setting products to 'sinks' collection..."
python3 update_test_products.py

# Check database
echo ""
echo "📊 Verifying database..."
sqlite3 supplier_products.db "SELECT COUNT(*) as total FROM supplier_products;"
sqlite3 supplier_products.db "SELECT detected_collection, COUNT(*) as count FROM supplier_products GROUP BY detected_collection;"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Now reload your web app on PythonAnywhere and test:"
echo "1. Go to https://your-site.com/sinks"
echo "2. Click 'Add Product' → 'From Supplier Catalog'"
echo "3. Search for SKU: FRA400D"
echo ""
echo "========================================="
