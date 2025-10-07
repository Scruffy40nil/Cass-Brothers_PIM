#!/usr/bin/env python3
"""
Re-run collection detection on all supplier products
Useful after fixing the detection logic
"""

import sys
import os
import sqlite3

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.supplier_db import get_supplier_db
from core.collection_detector import detect_collection

def main():
    print("=" * 60)
    print("RE-RUNNING COLLECTION DETECTION")
    print("=" * 60)

    supplier_db = get_supplier_db()

    # Get all products without collection detection or with low confidence
    conn = sqlite3.connect(supplier_db.db_path)
    cursor = conn.cursor()

    cursor.execute('''
        SELECT id, sku, product_name, product_url, detected_collection, confidence_score
        FROM supplier_products
        WHERE detected_collection IS NULL
           OR detected_collection = ''
           OR confidence_score < 0.9
    ''')

    products = cursor.fetchall()
    conn.close()

    print(f"\nFound {len(products)} products needing collection detection\n")

    updated = 0
    detected_by_collection = {}

    for product_id, sku, product_name, product_url, old_collection, old_confidence in products:
        # Run detection
        collection, confidence = detect_collection(product_name or '', product_url or '')

        # Update if confidence >= 0.5 (lower threshold for URL-only products)
        if collection and confidence >= 0.5:
            # Update database
            conn = sqlite3.connect(supplier_db.db_path)
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE supplier_products
                SET detected_collection = ?, confidence_score = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (collection, confidence, product_id))
            conn.commit()
            conn.close()

            updated += 1
            detected_by_collection[collection] = detected_by_collection.get(collection, 0) + 1

            if updated % 50 == 0:
                print(f"  Updated {updated}/{len(products)}...")

    print(f"\n" + "=" * 60)
    print(f"SUMMARY:")
    print(f"  Total processed: {len(products)}")
    print(f"  Successfully detected: {updated}")
    print(f"\nBy Collection:")
    for collection, count in sorted(detected_by_collection.items()):
        print(f"  {collection}: {count}")
    print("=" * 60)

    # Show final stats
    conn = sqlite3.connect(supplier_db.db_path)
    cursor = conn.cursor()
    cursor.execute('''
        SELECT detected_collection, COUNT(*)
        FROM supplier_products
        WHERE detected_collection IS NOT NULL AND detected_collection != ''
        GROUP BY detected_collection
        ORDER BY COUNT(*) DESC
    ''')

    print(f"\nFinal Collection Stats:")
    for collection, count in cursor.fetchall():
        print(f"  {collection}: {count}")

    conn.close()

if __name__ == '__main__':
    main()
