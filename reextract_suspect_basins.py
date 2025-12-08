#!/usr/bin/env python3
"""
Re-extract dimensions for basins with suspicious depth values (>250mm)
These likely have the same issue as row 42 - using width instead of depth
"""
import os
import sys
import time
from dotenv import load_dotenv
load_dotenv()

from core.ai_extractor import AIExtractor
from core.sheets_manager import SheetsManager

COLLECTION_NAME = 'basins'
MAX_DEPTH = 250  # Basins typically 100-250mm deep

def main():
    print("=" * 80)
    print("RE-EXTRACT BASINS WITH SUSPICIOUS DEPTHS")
    print("=" * 80)
    print()

    # Initialize managers
    print("📥 Initializing Google Sheets connection...")
    sheets = SheetsManager()

    print("📥 Fetching all basin products...")
    products_dict = sheets.get_all_products(COLLECTION_NAME)
    print(f"✅ Retrieved {len(products_dict)} products")
    print()

    # Find basins with suspect depth values
    print(f"🔍 Finding basins with depth > {MAX_DEPTH}mm...")
    suspect_basins = []

    for row_num, product in products_dict.items():
        spec_sheet = product.get('shopify_spec_sheet', '').strip()
        depth = product.get('overall_depth_mm', '').strip() if product.get('overall_depth_mm') else ''

        if spec_sheet and spec_sheet.lower().endswith('.pdf') and depth:
            try:
                depth_val = int(depth)
                if depth_val > MAX_DEPTH:
                    suspect_basins.append({
                        'row': row_num,
                        'sku': product.get('variant_sku', 'Unknown'),
                        'title': product.get('title', 'Unknown')[:60],
                        'spec_sheet': spec_sheet,
                        'current_depth': depth
                    })
            except ValueError:
                pass

    print(f"✅ Found {len(suspect_basins)} basins with suspicious depth values")
    print()

    if len(suspect_basins) == 0:
        print("✅ No basins need re-extraction!")
        return

    # Show list
    print("Basins to re-extract:")
    for basin in suspect_basins[:10]:  # Show first 10
        print(f"  Row {basin['row']}: {basin['sku']} - Current depth: {basin['current_depth']}mm")
    if len(suspect_basins) > 10:
        print(f"  ... and {len(suspect_basins) - 10} more")
    print()

    # Confirm
    if sys.stdin.isatty():
        response = input(f"Re-extract dimensions for {len(suspect_basins)} basins? (y/n): ")
        if response.lower() != 'y':
            print("❌ Cancelled")
            return
    else:
        print(f"✅ Auto-confirming re-extraction for {len(suspect_basins)} basins")

    # Initialize AI extractor
    print()
    print("📥 Initializing AI extractor...")
    extractor = AIExtractor()
    print("✅ AI extractor ready")
    print()

    # Process basins
    print("=" * 80)
    print(f"Processing {len(suspect_basins)} basins...")
    print("=" * 80)

    succeeded = 0
    failed = 0
    corrected = 0
    pending_updates = []

    for i, basin in enumerate(suspect_basins, 1):
        print(f"\n[{i}/{len(suspect_basins)}] Processing Row {basin['row']} - {basin['sku']}")
        print(f"  Title: {basin['title']}")
        print(f"  Current depth: {basin['current_depth']}mm")

        try:
            # Extract dimensions
            result = extractor._process_single_product_no_trigger(
                collection_name='basins',
                url=basin['spec_sheet'],
                generate_content=False
            )

            if result.get('success') and result.get('extracted_data'):
                dims = result['extracted_data']
                new_depth = dims.get('overall_depth_mm')

                print(f"  New dimensions: L={dims.get('length_mm')}, W={dims.get('overall_width_mm')}, D={new_depth}")

                # Check if depth was corrected
                if new_depth and int(new_depth) <= MAX_DEPTH:
                    print(f"  ✅ Depth corrected! {basin['current_depth']}mm → {new_depth}mm")
                    corrected += 1
                elif new_depth:
                    print(f"  ⚠️  Depth still high: {new_depth}mm")
                else:
                    print(f"  ⚠️  No depth extracted")

                # Queue update
                update_data = {}
                if dims.get('length_mm'):
                    update_data['length_mm'] = dims['length_mm']
                if dims.get('overall_width_mm'):
                    update_data['overall_width_mm'] = dims['overall_width_mm']
                if new_depth:
                    update_data['overall_depth_mm'] = new_depth

                if update_data:
                    pending_updates.append({
                        'row': basin['row'],
                        'data': update_data
                    })
                    succeeded += 1
                else:
                    failed += 1
                    print(f"  ❌ No dimensions extracted")
            else:
                failed += 1
                print(f"  ❌ Extraction failed")

            # Write batch every 10 products
            if len(pending_updates) >= 10:
                print(f"\n💾 Writing batch of {len(pending_updates)} products to Google Sheets...")
                write_batch_to_sheets(sheets, pending_updates)
                pending_updates = []

            # Rate limit
            time.sleep(2)

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
    print(f"Total processed: {len(suspect_basins)}")
    print(f"✓ Succeeded: {succeeded}")
    print(f"✗ Failed: {failed}")
    print(f"🔧 Depths corrected: {corrected}")
    print()


def write_batch_to_sheets(sheets: SheetsManager, updates: list):
    """Write a batch of dimension updates to Google Sheets"""
    worksheet = sheets.get_worksheet(COLLECTION_NAME)
    batch_data = []

    for update in updates:
        row = update['row']
        data = update['data']

        if 'length_mm' in data:
            batch_data.append({
                'range': f'P{row}',  # Column P
                'values': [[data['length_mm']]]
            })

        if 'overall_width_mm' in data:
            batch_data.append({
                'range': f'Q{row}',  # Column Q
                'values': [[data['overall_width_mm']]]
            })

        if 'overall_depth_mm' in data:
            batch_data.append({
                'range': f'R{row}',  # Column R
                'values': [[data['overall_depth_mm']]]
            })

    if batch_data:
        worksheet.batch_update(batch_data)
        print(f"  ✅ Wrote {len(updates)} products ({len(batch_data)} dimension updates)")


if __name__ == '__main__':
    main()
