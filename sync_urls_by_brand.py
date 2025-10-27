#!/usr/bin/env python3
"""
Sync Supplier URLs to Taps Sheet by Brand Name
Since SKUs don't match, we'll match by brand instead
"""

import os
import sqlite3
from dotenv import load_dotenv
load_dotenv()

from core.sheets_manager import SheetsManager
from config.collections import get_collection_config

def sync_urls_by_brand():
    print("=" * 80)
    print("SYNC SUPPLIER URLs BY BRAND NAME")
    print("=" * 80)

    # Connect to database
    db_path = 'supplier_products.db'
    if not os.path.exists(db_path):
        print(f"\n❌ Error: Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Get all taps products grouped by supplier/brand
    cursor.execute("""
        SELECT supplier_name, COUNT(*) as product_count
        FROM supplier_products
        WHERE detected_collection IN ('taps', 'tap', 'faucet', 'mixer')
        GROUP BY supplier_name
        ORDER BY product_count DESC
    """)

    suppliers = cursor.fetchall()

    print("\n1. AVAILABLE SUPPLIERS IN DATABASE:")
    print("   " + "-" * 76)
    for supplier, count in suppliers:
        print(f"   {supplier:<40} | {count:3d} products")

    # Connect to Google Sheet
    print("\n2. CONNECTING TO TAPS GOOGLE SHEET...")
    sheets_manager = SheetsManager()
    all_rows = sheets_manager.get_all_products('taps')

    # Group sheet products by brand
    brand_counts = {}
    products_by_brand = {}

    for row_num, row_data in all_rows.items():
        brand = row_data.get('brand_name', '').strip()
        url = row_data.get('url', '').strip()

        if brand:
            if brand not in brand_counts:
                brand_counts[brand] = {'total': 0, 'has_url': 0, 'needs_url': 0}
                products_by_brand[brand] = []

            brand_counts[brand]['total'] += 1
            if url:
                brand_counts[brand]['has_url'] += 1
            else:
                brand_counts[brand]['needs_url'] += 1
                products_by_brand[brand].append({
                    'row_num': row_num,
                    'sku': row_data.get('variant_sku', ''),
                    'title': row_data.get('title', '')
                })

    print("\n3. BRANDS IN GOOGLE SHEET:")
    print("   " + "-" * 76)
    print(f"   {'Brand':<30} | {'Total':>5} | {'Has URL':>7} | {'Needs URL':>9}")
    print("   " + "-" * 76)
    for brand in sorted(brand_counts.keys()):
        counts = brand_counts[brand]
        print(f"   {brand:<30} | {counts['total']:5d} | {counts['has_url']:7d} | {counts['needs_url']:9d}")

    # Find matching suppliers for each brand
    print("\n4. MATCHING BRANDS TO SUPPLIERS:")
    print("   " + "-" * 76)

    matches_found = []

    for brand in sorted(brand_counts.keys()):
        if brand_counts[brand]['needs_url'] == 0:
            continue  # Skip brands that already have all URLs

        # Search for supplier with similar name
        cursor.execute("""
            SELECT supplier_name, COUNT(*) as count
            FROM supplier_products
            WHERE detected_collection IN ('taps', 'tap', 'faucet', 'mixer')
            AND UPPER(supplier_name) LIKE ?
            GROUP BY supplier_name
        """, (f"%{brand.upper()}%",))

        matching_suppliers = cursor.fetchall()

        if matching_suppliers:
            for supplier, count in matching_suppliers:
                print(f"   ✅ {brand:<30} → {supplier} ({count} products)")
                matches_found.append((brand, supplier))
        else:
            print(f"   ⚠️  {brand:<30} → No matching supplier found")

    if not matches_found:
        print("\n   ℹ️  No automatic matches found between brands and suppliers")
        print("   This means supplier names don't match brand names in your sheet")
        print("\n   MANUAL OPTIONS:")
        print("   1. Update brand names in sheet to match supplier names")
        print("   2. Manually copy URLs from supplier database")
        print("   3. Add a brand-to-supplier mapping table")
        conn.close()
        return

    # For each match, offer to populate URLs
    print("\n5. READY TO POPULATE URLs")
    print("\nWould you like to see the matching process for each brand? (yes/no): ", end='')
    response = input().strip().lower()

    if response != 'yes':
        print("❌ Cancelled")
        conn.close()
        return

    total_updated = 0

    for brand, supplier in matches_found:
        print(f"\n{'='*80}")
        print(f"BRAND: {brand}")
        print(f"SUPPLIER: {supplier}")
        print(f"{'='*80}")

        # Get all URLs for this supplier
        cursor.execute("""
            SELECT sku, product_url, product_name
            FROM supplier_products
            WHERE supplier_name = ?
            AND detected_collection IN ('taps', 'tap', 'faucet', 'mixer')
            ORDER BY sku
        """, (supplier,))

        supplier_products = cursor.fetchall()
        print(f"\nSupplier has {len(supplier_products)} products")

        # Get products in sheet that need URLs
        sheet_products = products_by_brand.get(brand, [])
        print(f"Sheet has {len(sheet_products)} products needing URLs")

        if len(supplier_products) == 1:
            # Only one supplier product - might be a category page
            url = supplier_products[0][1]
            print(f"\n⚠️  Only 1 supplier product found: {url}")
            print(f"This might be a category/collection page, not individual products")
            print(f"\nUse this URL for all {len(sheet_products)} {brand} products? (yes/no): ", end='')

            if input().strip().lower() == 'yes':
                for product in sheet_products:
                    try:
                        sheets_manager.update_product_field(
                            collection_name='taps',
                            row_num=product['row_num'],
                            field_name='url',
                            value=url
                        )
                        total_updated += 1
                        print(f"   ✅ Updated row {product['row_num']}: {product['sku']}")
                    except Exception as e:
                        print(f"   ❌ Error updating row {product['row_num']}: {e}")
        else:
            print(f"\n⚠️  Multiple supplier products found - manual matching required")
            print(f"Consider using the web interface to match products individually")

    print(f"\n{'='*80}")
    print(f"SYNC COMPLETE")
    print(f"{'='*80}")
    print(f"✅ Total URLs updated: {total_updated}")
    print(f"{'='*80}")

    conn.close()

if __name__ == '__main__':
    sync_urls_by_brand()
