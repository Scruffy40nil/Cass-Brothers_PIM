#!/usr/bin/env python3
"""
Check image extraction status in database
"""

import sys
import os
import sqlite3

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.supplier_db import get_supplier_db

def main():
    supplier_db = get_supplier_db()

    print(f"Database path: {supplier_db.db_path}")
    print(f"Database exists: {os.path.exists(supplier_db.db_path)}")
    print(f"Database size: {os.path.getsize(supplier_db.db_path) / 1024 / 1024:.2f} MB")
    print()

    conn = sqlite3.connect(supplier_db.db_path)
    cursor = conn.cursor()

    # Total products
    cursor.execute('SELECT COUNT(*) FROM supplier_products')
    total = cursor.fetchone()[0]

    # Products with images
    cursor.execute('SELECT COUNT(*) FROM supplier_products WHERE image_url IS NOT NULL AND image_url != ""')
    with_images = cursor.fetchone()[0]

    # Products without images
    cursor.execute('SELECT COUNT(*) FROM supplier_products WHERE image_url IS NULL OR image_url = ""')
    without_images = cursor.fetchone()[0]

    # Sample products with images
    cursor.execute('SELECT id, sku, product_name, image_url FROM supplier_products WHERE image_url IS NOT NULL AND image_url != "" LIMIT 5')
    samples_with = cursor.fetchall()

    # Sample products without images
    cursor.execute('SELECT id, sku, product_name, product_url FROM supplier_products WHERE image_url IS NULL OR image_url = "" LIMIT 5')
    samples_without = cursor.fetchall()

    conn.close()

    print("=" * 80)
    print("DATABASE IMAGE STATISTICS")
    print("=" * 80)
    print(f"Total products:           {total:,}")
    print(f"Products WITH images:     {with_images:,} ({with_images/total*100:.1f}%)")
    print(f"Products WITHOUT images:  {without_images:,} ({without_images/total*100:.1f}%)")
    print()

    print("SAMPLE PRODUCTS WITH IMAGES:")
    print("-" * 80)
    for row in samples_with:
        print(f"ID: {row[0]}, SKU: {row[1]}, Name: {row[2][:40] if row[2] else 'N/A'}")
        print(f"   Image: {row[3][:100]}...")
        print()

    print("SAMPLE PRODUCTS WITHOUT IMAGES:")
    print("-" * 80)
    for row in samples_without:
        print(f"ID: {row[0]}, SKU: {row[1]}, Name: {row[2][:40] if row[2] else 'N/A'}")
        print(f"   URL: {row[3][:100]}...")
        print()

    print("=" * 80)

if __name__ == '__main__':
    main()
