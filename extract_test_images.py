#!/usr/bin/env python3
"""
Extract images for test products
"""

import sys
import os
import sqlite3

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.supplier_db import get_supplier_db
from core.image_extractor import extract_og_image

def main():
    print("=" * 60)
    print("EXTRACTING PRODUCT IMAGES")
    print("=" * 60)

    supplier_db = get_supplier_db()

    # Get all products without images
    conn = sqlite3.connect(supplier_db.db_path)
    cursor = conn.cursor()

    cursor.execute('''
        SELECT id, sku, product_url, product_name
        FROM supplier_products
        WHERE image_url IS NULL OR image_url = ''
    ''')

    products = cursor.fetchall()
    conn.close()

    print(f"\n📸 Found {len(products)} products without images")

    if len(products) == 0:
        print("✅ All products already have images!")
        return

    extracted = 0
    failed = 0

    for product_id, sku, product_url, product_name in products:
        print(f"\n🔍 Extracting image for {sku}...")
        print(f"   URL: {product_url}")

        try:
            image_url = extract_og_image(product_url, timeout=15)

            if image_url:
                # Update database
                conn = sqlite3.connect(supplier_db.db_path)
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE supplier_products
                    SET image_url = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (image_url, product_id))
                conn.commit()
                conn.close()

                print(f"   ✅ Extracted: {image_url[:80]}...")
                extracted += 1
            else:
                print(f"   ⚠️  No og:image found")
                failed += 1

        except Exception as e:
            print(f"   ❌ Error: {e}")
            failed += 1

    print(f"\n" + "=" * 60)
    print(f"📊 Summary:")
    print(f"  - Extracted: {extracted}")
    print(f"  - Failed: {failed}")
    print(f"  - Total: {len(products)}")
    print("=" * 60)

    if extracted > 0:
        print(f"\n✨ Images extracted! Reload your web app to see them.")

if __name__ == '__main__':
    main()
