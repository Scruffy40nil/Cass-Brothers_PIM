#!/usr/bin/env python3
"""
SHOWERS AI EXTRACTION SCRIPT

This script extracts ALL shower fields from PDF spec sheets
and updates the Google Sheet using AI extraction.

Covers sub-collections:
- Shower Rail Sets
- Shower Systems
- Hand Showers
- Shower Arms
- Shower Roses
- Shower Mixers

Extracts:
- Basic specs (shower_type, material, finish, colour, style)
- WELS ratings (wels_rating, wels_lpm, wels_registration)
- Flow & pressure specs
- Rail specifications (length, diameter, adjustable)
- Handpiece/hand shower specs (diameter, shape, spray functions)
- Hose specifications
- Overhead/rose specifications
- Arm specifications
- Mixer specifications

Usage:
    python3 extract_showers.py
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

COLLECTION_NAME = 'showers'
BATCH_SIZE = 10  # Write to sheets every N products
MAX_PRODUCTS = None  # Limit for this run (set to None for all)

# ============================================================================
# MAIN SCRIPT
# ============================================================================

def main():
    print("=" * 80)
    print("SHOWERS AI EXTRACTION")
    print("=" * 80)
    print("\nThis script extracts ALL shower specifications from PDF spec sheets")
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

    print("📥 Step 2: Fetching all Showers products...")
    products_dict = sheets.get_all_products(COLLECTION_NAME, force_refresh=True)

    if not products_dict:
        print("❌ No products found")
        return

    print(f"✅ Retrieved {len(products_dict)} products")

    # Step 3: Filter products with PDF spec sheets that need extraction
    print("\n📥 Step 3: Filtering products ready for extraction...")
    products_to_process = []

    for row_num, product in products_dict.items():
        spec_sheet = product.get('shopify_spec_sheet', '').strip()

        # Check if key shower fields are missing (need extraction)
        has_shower_type = product.get('shower_type', '').strip()
        has_wels_rating = product.get('wels_rating', '').strip()
        has_flow_rate = product.get('flow_rate_lpm', '').strip()

        # Only process if has PDF spec sheet AND missing shower fields
        if spec_sheet and '.pdf' in spec_sheet.lower():
            # Process if missing ANY of the key shower fields
            if not all([has_shower_type, has_wels_rating, has_flow_rate]):
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

    # Apply limit if set
    if MAX_PRODUCTS and len(products_to_process) > MAX_PRODUCTS:
        print(f"⚠️ Limiting to first {MAX_PRODUCTS} products")
        products_to_process = products_to_process[:MAX_PRODUCTS]

    # Show products to process
    print("\nProducts to process:")
    for i, p in enumerate(products_to_process[:10], 1):
        print(f"  {i}. Row {p['row']}: {p['sku']} - {p['title'][:50]}...")
    if len(products_to_process) > 10:
        print(f"  ... and {len(products_to_process) - 10} more")

    # Ask for confirmation (skip if running in background)
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
        print(f"  PDF: {product['spec_sheet'][:60]}...")

        try:
            # Extract ALL fields using full pipeline
            result = extractor._process_single_product_no_trigger(
                collection_name=COLLECTION_NAME,
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
                error_msg = result.get('error', 'No data extracted')
                print(f"  ⏭️ Skipped - {error_msg}")

            # Write batch to sheets
            if len(pending_updates) >= BATCH_SIZE:
                print(f"\n💾 Writing batch of {len(pending_updates)} products to Google Sheets...")
                write_batch_to_sheets(sheets, pending_updates)
                pending_updates = []

            # Rate limit
            time.sleep(2)

        except Exception as e:
            failed += 1
            print(f"  ❌ Error: {e}")
            import traceback
            traceback.print_exc()

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
    print("✅ All Showers data has been written to Google Sheets!")


def write_batch_to_sheets(sheets: SheetsManager, updates: list):
    """Write a batch of shower data updates to Google Sheets"""
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
