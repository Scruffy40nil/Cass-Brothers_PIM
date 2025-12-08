#!/usr/bin/env python3
"""
Re-extract basins that are missing dimensions OR have suspect depth values

This script targets:
1. Basins with PDFs but missing ANY dimensions (length, width, or depth)
2. Basins with depth > 250mm (likely incorrect)
"""

import os
from dotenv import load_dotenv
load_dotenv()

import sys
import time
from core.ai_extractor import AIExtractor
from core.sheets_manager import SheetsManager
from config.collections import get_collection_config

COLLECTION_NAME = 'basins'
BATCH_SIZE = 10

def main():
    print("=" * 80)
    print("RE-EXTRACT MISSING & SUSPECT BASIN DIMENSIONS")
    print("=" * 80)
    print()

    # Check OpenAI API key
    api_key = os.environ.get('OPENAI_API_KEY', '')
    if not api_key:
        print("❌ Error: OPENAI_API_KEY not found in environment")
        return
    print(f"✅ OpenAI API key loaded (starts with: {api_key[:20]}...)")

    # Initialize managers
    print("\n📥 Initializing Google Sheets connection...")
    sheets = SheetsManager()

    print("📥 Fetching all Basins products...")
    products_dict = sheets.get_all_products(COLLECTION_NAME)

    if not products_dict:
        print("❌ No products found")
        return

    print(f"✅ Retrieved {len(products_dict)} products")

    # Filter products that need re-extraction
    print("\n📥 Filtering products for re-extraction...")
    products_to_process = []

    for row_num, product in products_dict.items():
        spec_sheet = product.get('shopify_spec_sheet', '').strip()

        # Only process if has PDF spec sheet
        if not spec_sheet or not spec_sheet.lower().endswith('.pdf'):
            continue

        length = product.get('length_mm', '').strip()
        width = product.get('overall_width_mm', '').strip()
        depth = product.get('overall_depth_mm', '').strip()

        # Check if missing any dimensions
        missing_dims = not length or not width or not depth

        # Check if depth is suspect (>250mm)
        suspect_depth = False
        try:
            depth_val = int(depth) if depth else 0
            if depth_val > 250:
                suspect_depth = True
        except ValueError:
            pass

        # Add to processing list if missing dimensions OR suspect depth
        if missing_dims or suspect_depth:
            reason = []
            if missing_dims:
                missing = []
                if not length: missing.append('length')
                if not width: missing.append('width')
                if not depth: missing.append('depth')
                reason.append(f"Missing: {', '.join(missing)}")
            if suspect_depth:
                reason.append(f"Suspect depth: {depth}mm")

            products_to_process.append({
                'row': row_num,
                'sku': product.get('variant_sku', 'Unknown'),
                'title': product.get('title', 'Unknown'),
                'spec_sheet': spec_sheet,
                'reason': ' | '.join(reason)
            })

    print(f"✅ Found {len(products_to_process)} products that need re-extraction")

    if len(products_to_process) == 0:
        print("✅ All products have complete and correct dimensions!")
        return

    # Show breakdown
    missing_count = sum(1 for p in products_to_process if 'Missing' in p['reason'])
    suspect_count = sum(1 for p in products_to_process if 'Suspect' in p['reason'])
    print(f"\n   - {missing_count} with missing dimensions")
    print(f"   - {suspect_count} with suspect depth values")

    # Ask for confirmation
    if sys.stdin.isatty():
        response = input(f"\nRe-extract dimensions for {len(products_to_process)} products? (y/n): ")
        if response.lower() != 'y':
            print("❌ Cancelled")
            return
    else:
        print(f"\n✅ Auto-confirming extraction for {len(products_to_process)} products (running in background)")

    # Initialize AI extractor
    print("\n📥 Initializing AI extractor...")
    extractor = AIExtractor()
    print("✅ AI extractor ready")

    # Process products
    print(f"\n📥 Processing {len(products_to_process)} products...")
    print("=" * 80)

    succeeded = 0
    failed = 0
    skipped = 0
    pending_updates = []

    for i, product in enumerate(products_to_process, 1):
        print(f"\n[{i}/{len(products_to_process)}] Processing Row {product['row']} - {product['sku']}")
        print(f"  Title: {product['title'][:60]}...")
        print(f"  Reason: {product['reason']}")

        try:
            # Extract dimensions using full pipeline (with Vision API for sparse PDFs)
            result = extractor._process_single_product_no_trigger(
                collection_name='basins',
                url=product['spec_sheet'],
                generate_content=False
            )

            if result.get('success') and result.get('extracted_data'):
                data = result['extracted_data']

                # Show what was extracted
                length = data.get('length_mm', 'None')
                width = data.get('overall_width_mm', 'None')
                depth = data.get('overall_depth_mm', 'None')

                print(f"  Extracted: L={length}, W={width}, D={depth}")

                # Only queue if we got at least one dimension
                if length or width or depth:
                    pending_updates.append({
                        'row': product['row'],
                        'data': data
                    })
                    succeeded += 1
                    print(f"  ✅ Queued for update")
                else:
                    skipped += 1
                    print(f"  ⏭️ No dimensions extracted - skipped")
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
    print("🎉 Re-extraction Complete!")
    print("=" * 80)
    print(f"Total: {len(products_to_process)}")
    print(f"✓ Succeeded: {succeeded}")
    print(f"✗ Failed: {failed}")
    print(f"⏭️ Skipped: {skipped}")
    print()


def write_batch_to_sheets(sheets: SheetsManager, updates: list):
    """Write a batch of basin dimension updates to Google Sheets"""
    config = get_collection_config(COLLECTION_NAME)
    worksheet = sheets.get_worksheet(COLLECTION_NAME)

    batch_data = []

    for update in updates:
        row = update['row']
        data = update['data']

        # Only update dimension fields
        for field_name in ['length_mm', 'overall_width_mm', 'overall_depth_mm']:
            value = data.get(field_name)
            if value is not None and field_name in config.column_mapping:
                column_num = config.column_mapping[field_name]

                # Convert column number to letter
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
