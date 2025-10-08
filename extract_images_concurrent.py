#!/usr/bin/env python3
"""
Extract images for products with concurrent processing for speed
"""

import sys
import os
import sqlite3
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
import time

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.supplier_db import get_supplier_db
from core.image_extractor import extract_og_image

# Thread-safe database lock
db_lock = Lock()

def extract_and_save_image(product_data, db_path):
    """Extract image for a single product and save to database"""
    product_id, sku, product_url, product_name = product_data

    try:
        image_url = extract_og_image(product_url, timeout=15)

        if image_url:
            # Update database (thread-safe)
            with db_lock:
                conn = sqlite3.connect(db_path)
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE supplier_products
                    SET image_url = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (image_url, product_id))
                conn.commit()
                conn.close()

            return {
                'success': True,
                'sku': sku,
                'image_url': image_url,
                'error': None
            }
        else:
            return {
                'success': False,
                'sku': sku,
                'image_url': None,
                'error': 'No image found'
            }

    except Exception as e:
        return {
            'success': False,
            'sku': sku,
            'image_url': None,
            'error': str(e)
        }

def main():
    print("=" * 80)
    print("CONCURRENT IMAGE EXTRACTION")
    print("=" * 80)

    supplier_db = get_supplier_db()
    db_path = supplier_db.db_path

    # Get all products without images
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute('''
        SELECT id, sku, product_url, product_name
        FROM supplier_products
        WHERE image_url IS NULL OR image_url = ''
        ORDER BY id
    ''')

    products = cursor.fetchall()
    conn.close()

    total = len(products)
    print(f"\n📸 Found {total} products without images")

    if total == 0:
        print("✅ All products already have images!")
        return

    # Configuration
    MAX_WORKERS = 10  # Number of concurrent requests
    BATCH_SIZE = 100  # Report progress every N products

    print(f"⚡ Processing with {MAX_WORKERS} concurrent workers...")
    print(f"📊 Progress updates every {BATCH_SIZE} products\n")

    extracted = 0
    failed = 0
    start_time = time.time()

    # Process products concurrently
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        # Submit all tasks
        future_to_product = {
            executor.submit(extract_and_save_image, product, db_path): product
            for product in products
        }

        # Process results as they complete
        for i, future in enumerate(as_completed(future_to_product), 1):
            result = future.result()

            if result['success']:
                extracted += 1
                if extracted <= 10:  # Show first 10 successes
                    print(f"✅ {result['sku']:15} → {result['image_url'][:80]}...")
            else:
                failed += 1
                if failed <= 10:  # Show first 10 failures
                    print(f"⚠️  {result['sku']:15} → {result['error']}")

            # Progress update
            if i % BATCH_SIZE == 0:
                elapsed = time.time() - start_time
                rate = i / elapsed
                remaining = (total - i) / rate if rate > 0 else 0
                progress_pct = (i / total) * 100

                print(f"\n📊 Progress: {i}/{total} ({progress_pct:.1f}%) | "
                      f"Extracted: {extracted} | Failed: {failed} | "
                      f"Rate: {rate:.1f}/sec | ETA: {remaining/60:.1f}min\n")

    # Final summary
    elapsed = time.time() - start_time
    print(f"\n" + "=" * 80)
    print(f"📊 FINAL SUMMARY:")
    print(f"  - Total processed: {total}")
    print(f"  - Successfully extracted: {extracted}")
    print(f"  - Failed: {failed}")
    print(f"  - Success rate: {(extracted/total*100):.1f}%")
    print(f"  - Time elapsed: {elapsed/60:.1f} minutes")
    print(f"  - Average rate: {total/elapsed:.1f} products/second")
    print("=" * 80)

    if extracted > 0:
        print(f"\n✨ Images extracted! Reload your web app to see them.")

if __name__ == '__main__':
    main()
