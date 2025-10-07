#!/bin/bash
# Run this on PythonAnywhere to extract images for supplier products

echo "=================================================="
echo "EXTRACTING SUPPLIER PRODUCT IMAGES"
echo "=================================================="

cd /home/cassbrothers/mysite
python3 extract_test_images.py

echo ""
echo "✅ Done! Reload your web app to see the images."
