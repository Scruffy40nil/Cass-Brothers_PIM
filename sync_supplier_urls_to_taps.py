#!/usr/bin/env python3
"""
Sync Supplier URLs from SQLite Database to Taps Google Sheet
Matches products by SKU and updates the supplier_url column
"""

import os
import sqlite3
from dotenv import load_dotenv
load_dotenv()

from core.sheets_manager import SheetsManager
from config.collections import get_collection_config

def sync_supplier_urls_to_taps():
    """
    Read supplier URLs from supplier_products.db and write them to the Taps sheet
    """

    print("=" * 80)
    print("SYNC SUPPLIER URLs TO TAPS GOOGLE SHEET")
    print("=" * 80)

    # Connect to supplier database
    db_path = 'supplier_products.db'
    if not os.path.exists(db_path):
        print(f"\n❌ Error: Database not found at {db_path}")
        print("Run import_supplier_sheet.py first to create the database.")
        return

    print(f"\n1. Connecting to database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Get all taps products from database
    cursor.execute("""
        SELECT sku, product_url, supplier_name, detected_collection
        FROM supplier_products
        WHERE detected_collection IN ('taps', 'tap', 'faucet', 'mixer')
        ORDER BY sku
    """)

    db_products = cursor.fetchall()
    print(f"   ✅ Found {len(db_products)} taps products in database")

    # Create lookup dictionary: SKU -> URL
    sku_to_url = {}
    for sku, url, supplier, collection in db_products:
        if sku:
            sku_clean = str(sku).strip().upper()
            if sku_clean not in sku_to_url:
                sku_to_url[sku_clean] = {
                    'url': url,
                    'supplier': supplier,
                    'collection': collection
                }

    print(f"   📊 Created lookup table with {len(sku_to_url)} unique SKUs")

    # Connect to Google Sheets
    print("\n2. Connecting to Taps Google Sheet...")
    sheets_manager = SheetsManager()
    taps_config = get_collection_config('taps')

    print(f"   Collection: {taps_config.name}")
    print(f"   Spreadsheet ID: {taps_config.spreadsheet_id}")
    print(f"   Worksheet: {taps_config.worksheet_name}")

    # Get all products from sheet
    print("\n3. Reading products from Google Sheet...")
    all_rows = sheets_manager.get_all_products('taps')
    print(f"   ✅ Found {len(all_rows)} rows in sheet")

    # all_rows is a dictionary with row_num as key
    if not all_rows:
        print("   ❌ No rows found in sheet")
        return

    # Match and update
    print("\n4. Matching SKUs and updating URLs...")
    updates = []
    matched = 0
    skipped_no_sku = 0
    skipped_no_match = 0
    skipped_already_has_url = 0

    for row_num, row_data in all_rows.items():
        sku = row_data.get('variant_sku', '').strip()
        current_url = row_data.get('url', '').strip()

        if not sku:
            skipped_no_sku += 1
            continue

        sku_clean = sku.upper()

        # Check if URL already exists
        if current_url:
            skipped_already_has_url += 1
            continue

        # Look up URL in database
        if sku_clean in sku_to_url:
            url_data = sku_to_url[sku_clean]
            updates.append({
                'row_num': row_num,
                'sku': sku,
                'url': url_data['url'],
                'supplier': url_data['supplier']
            })
            matched += 1
        else:
            skipped_no_match += 1

    print(f"\n   📊 Matching Results:")
    print(f"      ✅ Matched: {matched}")
    print(f"      ⏭️  Skipped (no SKU): {skipped_no_sku}")
    print(f"      ⏭️  Skipped (already has URL): {skipped_already_has_url}")
    print(f"      ⚠️  Skipped (no match in database): {skipped_no_match}")

    if not updates:
        print("\n   ℹ️  No updates needed - all products either have URLs or no matches found")
        conn.close()
        return

    # Ask for confirmation
    print(f"\n5. Ready to update {len(updates)} products")
    print("\nFirst 5 examples:")
    for i, update in enumerate(updates[:5], 1):
        print(f"   {i}. Row {update['row_num']}: {update['sku']} -> {update['url'][:60]}...")

    response = input("\nProceed with updates? (yes/no): ").strip().lower()
    if response != 'yes':
        print("❌ Cancelled by user")
        conn.close()
        return

    # Perform updates
    print("\n6. Updating Google Sheet...")
    updated_count = 0
    error_count = 0

    for i, update in enumerate(updates, 1):
        try:
            # Update the url field (column A)
            sheets_manager.update_product_field(
                collection_name='taps',
                row_num=update['row_num'],
                field_name='url',
                value=update['url']
            )
            updated_count += 1

            if i % 10 == 0:
                print(f"   Progress: {i}/{len(updates)} updated...")

        except Exception as e:
            print(f"   ❌ Error updating row {update['row_num']}: {e}")
            error_count += 1

    # Final summary
    print("\n" + "=" * 80)
    print("SYNC COMPLETE")
    print("=" * 80)
    print(f"✅ Successfully updated: {updated_count}")
    print(f"❌ Errors: {error_count}")
    print(f"📊 Total products in database: {len(db_products)}")
    print(f"📊 Total rows in sheet: {len(all_rows)}")
    print("=" * 80)

    conn.close()

if __name__ == '__main__':
    sync_supplier_urls_to_taps()
