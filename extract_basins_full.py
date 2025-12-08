#!/usr/bin/env python3
"""
FULL BASIN EXTRACTION SCRIPT

This script extracts ALL basin fields (not just dimensions) from PDF spec sheets
and updates the Google Sheet. This matches the functionality of the Google Apps Script.

Extracts:
- Colour, Style, Installation Type, Material, Grade
- Warranty, Waste Outlet, Overflow
- Dimensions (Length, Width, Depth)
- Location, Drain Position

Usage:
    python3 extract_basins_full.py
"""

# Load environment variables FIRST
import os
from dotenv import load_dotenv
load_dotenv()

import sys
import time
from typing import Optional, Dict
from core.ai_extractor import AIExtractor
from core.sheets_manager import SheetsManager
from config.collections import get_collection_config

# ============================================================================
# CONFIGURATION
# ============================================================================

COLLECTION_NAME = 'basins'
BATCH_SIZE = 10  # Write to sheets every N products

# ============================================================================
# MAIN SCRIPT
# ============================================================================

def main():
    print("=" * 80)
    print("FULL BASIN EXTRACTION")
    print("=" * 80)
    print("\nThis script extracts ALL basin specifications from PDF spec sheets")
    print("and updates the Google Sheet with complete product data.")
    print()

    # Check OpenAI API key
    api_key = os.environ.get('OPENAI_API_KEY', '')
    if not api_key:
        print("❌ Error: OPENAI_API_KEY not found in environment")
        return
    print(f"✅ OpenAI API key loaded (starts with: {api_key[:20]}...)")

    # Step 1: Initialize managers
    print("\n📥 Step 1: Initializing Google Sheets connection...")
    sheets = SheetsManager()

    print("📥 Step 2: Fetching all Basins products...")
    products_dict = sheets.get_all_products(COLLECTION_NAME)

    if not products_dict:
        print("❌ No products found")
        return

    print(f"✅ Retrieved {len(products_dict)} products")

    # Step 3: Filter products with PDF spec sheets that haven't been extracted
    print("\n📥 Step 3: Filtering products ready for extraction...")
    products_to_process = []

    for row_num, product in products_dict.items():
        spec_sheet = product.get('shopify_spec_sheet', '').strip()
        installation_type = product.get('installation_type', '').strip()

        # Only process if has PDF spec sheet AND hasn't been extracted yet
        if spec_sheet and spec_sheet.lower().endswith('.pdf'):
            # Skip if already extracted (has installation_type)
            if not installation_type:
                products_to_process.append({
                    'row': row_num,
                    'sku': product.get('variant_sku', 'Unknown'),
                    'title': product.get('title', 'Unknown'),
                    'spec_sheet': spec_sheet
                })

    print(f"✅ Found {len(products_to_process)} products ready for extraction")

    if len(products_to_process) == 0:
        print("✅ All products with PDF spec sheets have already been extracted!")
        return

    # Ask for confirmation (skip if running in background)
    import sys
    if sys.stdin.isatty():
        response = input(f"\nExtract ALL fields for {len(products_to_process)} products? (y/n): ")
        if response.lower() != 'y':
            print("❌ Cancelled")
            return
    else:
        print(f"\n✅ Auto-confirming extraction for {len(products_to_process)} products (running in background)")

    # Step 4: Initialize AI extractor
    print("\n📥 Step 4: Initializing AI extractor...")
    extractor = AIExtractor()
    print("✅ AI extractor ready")

    # Step 5: Process products
    print(f"\n📥 Step 5: Processing {len(products_to_process)} products...")
    print("=" * 80)

    succeeded = 0
    failed = 0
    skipped = 0
    pending_updates = []

    for i, product in enumerate(products_to_process, 1):
        print(f"\n[{i}/{len(products_to_process)}] Processing Row {product['row']} - {product['sku']}")
        print(f"  Title: {product['title'][:60]}...")

        try:
            # Extract ALL fields using full pipeline
            result = extractor._process_single_product_no_trigger(
                collection_name='basins',
                url=product['spec_sheet'],
                generate_content=False
            )

            if result.get('success') and result.get('extracted_data'):
                data = result['extracted_data']

                # Show what was extracted
                print(f"  Extracted fields:")
                for key, value in data.items():
                    if value:
                        print(f"    {key}: {value}")

                # Queue for batch update
                pending_updates.append({
                    'row': product['row'],
                    'data': data
                })
                succeeded += 1
                print(f"  ✅ Queued for update")
            else:
                skipped += 1
                print(f"  ⏭️ No data extracted - skipped")

            # Write batch to sheets
            if len(pending_updates) >= BATCH_SIZE:
                print(f"\n💾 Writing batch of {len(pending_updates)} products to Google Sheets...")
                write_batch_to_sheets(sheets, pending_updates)
                pending_updates = []

            # Rate limit
            time.sleep(1)

        except Exception as e:
            failed += 1
            print(f"  ❌ Error: {e}")

    # Write remaining updates
    if pending_updates:
        print(f"\n💾 Writing final batch of {len(pending_updates)} products to Google Sheets...")
        write_batch_to_sheets(sheets, pending_updates)

    # Summary
    print("\n" + "=" * 80)
    print("🎉 Extraction Complete!")
    print("=" * 80)
    print(f"Total: {len(products_to_process)}")
    print(f"✓ Succeeded: {succeeded}")
    print(f"✗ Failed: {failed}")
    print(f"⏭️ Skipped: {skipped}")
    print()
    print("✅ All basin data has been written to Google Sheets!")


def write_batch_to_sheets(sheets: SheetsManager, updates: list):
    """Write a batch of basin data updates to Google Sheets"""
    config = get_collection_config(COLLECTION_NAME)
    worksheet = sheets.get_worksheet(COLLECTION_NAME)

    batch_data = []

    for update in updates:
        row = update['row']
        data = update['data']

        # Map each field to its column using the collection's column mapping
        for field_name, value in data.items():
            if value is not None and field_name in config.column_mapping:
                column_num = config.column_mapping[field_name]

                # Convert column number to letter (1=A, 2=B, etc.)
                column_letter = ''
                num = column_num
                while num > 0:
                    num -= 1
                    column_letter = chr(65 + (num % 26)) + column_letter
                    num //= 26

                batch_data.append({
                    'range': f'{column_letter}{row}',
                    'values': [[value]]
                })

    if batch_data:
        try:
            worksheet.batch_update(batch_data)
            print(f"  ✅ Wrote {len(updates)} products ({len(batch_data)} field updates)")
        except Exception as e:
            print(f"  ❌ Batch write error: {e}")
            print(f"  ⚠️ Skipping batch of {len(updates)} products")


if __name__ == '__main__':
    main()
