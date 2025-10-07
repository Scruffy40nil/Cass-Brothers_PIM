# Supplier Product Import Guide

## How to Import New Supplier Products

When you import new supplier products, the system will **automatically**:
1. ✅ Extract product images from supplier URLs
2. ✅ Detect which collection the product belongs to (with 90%+ confidence)
3. ✅ Store everything in the supplier database

### Method 1: Using the API

```python
import requests

products = [
    {
        'sku': 'ABC123',
        'supplier_name': 'Abey',
        'product_url': 'https://www.abeyspecifier.com.au/product/some-sink/',
        'product_name': 'Some Sink Name'
    },
    # ... more products
]

response = requests.post('https://cassbrothers.pythonanywhere.com/api/supplier-products/import', json={
    'products': products,
    'auto_extract_images': True  # Default is True
})

result = response.json()
print(f"Imported: {result['result']['imported']}")
print(f"Images extracted: {result['result']['images_extracted']}")
```

### Method 2: Using a Python Script

```python
#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.supplier_db import get_supplier_db

products = [
    {
        'sku': 'ABC123',
        'supplier_name': 'Abey',
        'product_url': 'https://www.abeyspecifier.com.au/product/some-sink/',
        'product_name': 'Some Sink Name'
    },
]

supplier_db = get_supplier_db()
result = supplier_db.import_from_csv(products, auto_extract_images=True)

print(f"✅ Imported: {result['imported']}")
print(f"✅ Updated: {result['updated']}")
print(f"✅ Images extracted: {result['images_extracted']}")
```

### What Happens During Import

1. **Image Extraction** - The system automatically fetches the product page and extracts:
   - og:image meta tags (if available)
   - twitter:image meta tags (fallback)
   - Product images from img tags (WordPress/WooCommerce sites)

2. **Collection Detection** - Uses keyword matching to detect collection:
   - Sinks: "sink", "basin", "undermount", etc.
   - Taps: "tap", "mixer", "faucet", etc.
   - Showers: "shower", "rose", "rail", etc.
   - Only assigns collection if confidence >= 90%

3. **Image Display** - Images are displayed using images.weserv.nl proxy for:
   - CORS handling
   - Automatic resizing (300x300)
   - Fast CDN delivery
   - Caching

## Manual Image Extraction (If Needed)

If you need to re-extract images for existing products:

```bash
cd /home/cassbrothers/mysite
python3 extract_test_images.py
```

This will find all products with missing images and extract them.

## CSV Format

Your CSV should have these columns:
- `sku` (required) - Product SKU
- `supplier_name` (required) - Supplier name
- `product_url` (required) - Full URL to product page
- `product_name` (optional) - Product name (helps with collection detection)
- `image_url` (optional) - Direct image URL (if you already have it)

## Performance Notes

- Image extraction adds ~1-2 seconds per product
- For bulk imports (100+ products), consider:
  - Importing first without images: `auto_extract_images=False`
  - Running `extract_test_images.py` overnight
- Collection detection is instant (pattern matching)
