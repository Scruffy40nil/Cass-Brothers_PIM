#!/usr/bin/env python3
"""
Test script to import supplier products
"""

import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.supplier_db import get_supplier_db
from core.collection_detector import detect_collection

# Test products from Abey
test_products = [
    {
        'sku': 'FRA540',
        'supplier_name': 'Abey',
        'product_url': 'https://www.abeyspecifier.com.au/product/alfresco-540-large-bowl-sink/',
        'product_name': 'Alfresco 540 Large Bowl Sink',
    },
    {
        'sku': 'FRA700',
        'supplier_name': 'Abey',
        'product_url': 'https://www.abeyspecifier.com.au/product/alfresco-700-large-bowl-sink/',
        'product_name': 'Alfresco 700 Large Bowl Sink',
    },
    {
        'sku': 'FRA340',
        'supplier_name': 'Abey',
        'product_url': 'https://www.abeyspecifier.com.au/product/alfresco-single-bowl-sink/',
        'product_name': 'Alfresco Single Bowl Sink',
    },
    {
        'sku': 'FRA400D',
        'supplier_name': 'Abey',
        'product_url': 'https://www.abeyspecifier.com.au/product/alfresco-double-bowl-sink/',
        'product_name': 'Alfresco Double Bowl Sink',
    },
    {
        'sku': '1X942I',
        'supplier_name': 'Abey',
        'product_url': 'https://www.abeyspecifier.com.au/product/barazza-r15-double-bowl/',
        'product_name': 'Barazza R15 Double Bowl',
    },
    {
        'sku': '1X842I',
        'supplier_name': 'Abey',
        'product_url': 'https://www.abeyspecifier.com.au/product/barazza-r15-double-bowl-1x842i/',
        'product_name': 'Barazza R15 Double Bowl 1X842I',
    },
    {
        'sku': '1X7040I',
        'supplier_name': 'Abey',
        'product_url': 'https://www.abeyspecifier.com.au/product/barazza-r15-large-bowl/',
        'product_name': 'Barazza R15 Large Bowl',
    },
    {
        'sku': '1X4540I',
        'supplier_name': 'Abey',
        'product_url': 'https://www.abeyspecifier.com.au/product/barazza-r15-single-bowl/',
        'product_name': 'Barazza R15 Single Bowl',
    },
    {
        'sku': '1X3440I',
        'supplier_name': 'Abey',
        'product_url': 'https://www.abeyspecifier.com.au/product/barazza-r15-single-bowl-1x3440i/',
        'product_name': 'Barazza R15 Single Bowl 1X3440I',
    },
    {
        'sku': '1ISX100L',
        'supplier_name': 'Abey',
        'product_url': 'https://www.abeyspecifier.com.au/product/barazza-select-100-single-bowl-with-drainer-left-hand-bowl/',
        'product_name': 'Barazza Select 100 Single Bowl with Drainer Left Hand Bowl',
    },
    {
        'sku': '1ISX100R',
        'supplier_name': 'Abey',
        'product_url': 'https://www.abeyspecifier.com.au/product/barazza-select-100-single-bowl-with-drainer-right-hand-bowl/',
        'product_name': 'Barazza Select 100 Single Bowl with Drainer Right Hand Bowl',
    },
    {
        'sku': '1ISX120L',
        'supplier_name': 'Abey',
        'product_url': 'https://www.abeyspecifier.com.au/product/barazza-select-120-one-and-one-third-bowl-with-drainer-left-hand-bowl/',
        'product_name': 'Barazza Select 120 One and One Third Bowl with Drainer Left Hand Bowl',
    },
    {
        'sku': '1ISX120R',
        'supplier_name': 'Abey',
        'product_url': 'https://www.abeyspecifier.com.au/product/barazza-select-120-one-and-one-third-bowl-with-drainer-right-hand-bowl/',
        'product_name': 'Barazza Select 120 One and One Third Bowl with Drainer Right Hand Bowl',
    },
    {
        'sku': 'ESA380',
        'supplier_name': 'Abey',
        'product_url': 'https://www.abeyspecifier.com.au/product/boutique-eco-sink/',
        'product_name': 'Boutique Eco Sink',
    },
    {
        'sku': 'STQ360DDCO',
        'supplier_name': 'Abey',
        'product_url': 'https://www.abeyspecifier.com.au/product/boutique-lugano-double-bowl-double-drainer-artisan-copper/',
        'product_name': 'Boutique Lugano Double Bowl Double Drainer Artisan Copper',
    },
]

def main():
    print("=" * 60)
    print("IMPORTING TEST SUPPLIER PRODUCTS")
    print("=" * 60)

    # Get database instance
    supplier_db = get_supplier_db()

    # Import products
    print(f"\n📦 Importing {len(test_products)} products from Abey...")
    result = supplier_db.import_from_csv(test_products)

    print(f"\n✅ Import Results:")
    print(f"  - Imported: {result['imported']}")
    print(f"  - Updated: {result['updated']}")
    print(f"  - Skipped: {result['skipped']}")
    print(f"  - Total Processed: {result['total_processed']}")

    if result['errors']:
        print(f"\n⚠️  Errors:")
        for error in result['errors']:
            print(f"  - {error}")

    # Run collection detection
    print(f"\n🔍 Running collection detection...")
    detected_count = 0

    for product in test_products:
        sku = product['sku']
        product_name = product['product_name']
        product_url = product['product_url']

        collection, confidence = detect_collection(product_name, product_url)

        if collection and confidence >= 0.9:
            supplier_db.update_collection_detection(sku, collection, confidence)
            print(f"  ✓ {sku}: {collection} ({confidence:.0%} confidence)")
            detected_count += 1
        else:
            print(f"  ✗ {sku}: No confident match ({confidence:.0%})")

    print(f"\n📊 Detection Summary:")
    print(f"  - Detected: {detected_count}/{len(test_products)}")

    # Show statistics
    stats = supplier_db.get_statistics()
    print(f"\n📈 Database Statistics:")
    print(f"  - Total Products: {stats['total_products']}")
    print(f"  - By Collection:")
    for collection, count in stats['by_collection'].items():
        print(f"    - {collection}: {count}")

    print(f"\n✨ Import complete!")
    print(f"\nNext steps:")
    print(f"  1. Start the Flask app: python flask_app.py")
    print(f"  2. Go to a collection page (e.g., /sinks)")
    print(f"  3. Click 'Add Product' → 'From Supplier Catalog'")
    print(f"  4. Try searching by SKU or clicking 'Find Missing Products'")
    print("=" * 60)

if __name__ == '__main__':
    main()
