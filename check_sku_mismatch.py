#!/usr/bin/env python3
"""
Diagnostic script to check why SKUs aren't matching between database and sheet
"""

import os
import sqlite3
from dotenv import load_dotenv
load_dotenv()

from core.sheets_manager import SheetsManager
from config.collections import get_collection_config

def check_sku_mismatch():
    print("=" * 80)
    print("SKU MISMATCH DIAGNOSTIC")
    print("=" * 80)

    # Get database SKUs
    db_path = 'supplier_products.db'
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT sku, supplier_name, detected_collection
        FROM supplier_products
        WHERE detected_collection IN ('taps', 'tap', 'faucet', 'mixer')
        ORDER BY sku
        LIMIT 20
    """)

    db_skus = cursor.fetchall()

    print("\n1. DATABASE SKUs (first 20):")
    print("   " + "-" * 76)
    for sku, supplier, collection in db_skus[:10]:
        print(f"   {sku:<30} | {supplier:<25} | {collection}")
    if len(db_skus) > 10:
        print(f"   ... and {len(db_skus) - 10} more")

    # Get sheet SKUs
    sheets_manager = SheetsManager()
    all_rows = sheets_manager.get_all_products('taps')

    sheet_skus = []
    for row_num, row_data in list(all_rows.items())[:20]:
        sku = row_data.get('variant_sku', '').strip()
        url = row_data.get('url', '').strip()
        brand = row_data.get('brand_name', '').strip()
        if sku:
            sheet_skus.append((sku, brand, url, row_num))

    print("\n2. GOOGLE SHEET SKUs (first 20 with SKUs):")
    print("   " + "-" * 76)
    for sku, brand, url, row_num in sheet_skus[:10]:
        has_url = "✅" if url else "❌"
        print(f"   {sku:<30} | {brand:<20} | Row {row_num:3d} | {has_url}")
    if len(sheet_skus) > 10:
        print(f"   ... and {len(sheet_skus) - 10} more")

    # Check for potential matches (case-insensitive, partial)
    print("\n3. CHECKING FOR POTENTIAL MATCHES...")
    db_sku_set = {sku.upper().strip() for sku, _, _ in db_skus}
    sheet_sku_set = {sku.upper().strip() for sku, _, _, _ in sheet_skus}

    exact_matches = db_sku_set & sheet_sku_set
    print(f"   Exact matches (case-insensitive): {len(exact_matches)}")
    if exact_matches:
        print("   Examples:")
        for sku in list(exact_matches)[:5]:
            print(f"      - {sku}")

    # Check if database SKUs are substrings of sheet SKUs or vice versa
    print("\n4. CHECKING FOR PARTIAL MATCHES...")
    partial_matches = []
    for db_sku, _, _ in db_skus:
        for sheet_sku, _, _, _ in sheet_skus:
            db_clean = db_sku.upper().strip()
            sheet_clean = sheet_sku.upper().strip()
            if db_clean in sheet_clean or sheet_clean in db_clean:
                partial_matches.append((db_sku, sheet_sku))
                if len(partial_matches) >= 10:
                    break
        if len(partial_matches) >= 10:
            break

    if partial_matches:
        print(f"   Found {len(partial_matches)} partial matches (showing first 10):")
        for db_sku, sheet_sku in partial_matches[:10]:
            print(f"      DB: {db_sku:<30} <-> Sheet: {sheet_sku}")
    else:
        print("   No partial matches found")

    # Summary
    print("\n5. SUMMARY:")
    cursor.execute("SELECT COUNT(*) FROM supplier_products WHERE detected_collection IN ('taps', 'tap', 'faucet', 'mixer')")
    total_db = cursor.fetchone()[0]

    total_sheet_with_sku = sum(1 for _, row in all_rows.items() if row.get('variant_sku', '').strip())

    print(f"   Total SKUs in database: {total_db}")
    print(f"   Total SKUs in sheet: {total_sheet_with_sku}")
    print(f"   Exact matches: {len(exact_matches)}")
    print(f"   Match rate: {len(exact_matches) / max(total_sheet_with_sku, 1) * 100:.1f}%")

    print("\n6. POSSIBLE ISSUES:")
    if len(exact_matches) == 0:
        print("   ⚠️  NO EXACT MATCHES FOUND")
        print("   Possible reasons:")
        print("   - SKU format differs (e.g., with/without hyphens, spaces)")
        print("   - Database has supplier SKUs, sheet has manufacturer SKUs")
        print("   - Different products in database vs sheet")
        print("   - Database needs to be re-imported with updated supplier sheet")

    print("\n" + "=" * 80)

    conn.close()

if __name__ == '__main__':
    check_sku_mismatch()
