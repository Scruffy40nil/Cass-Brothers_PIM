#!/usr/bin/env python3
"""
Count how many basin products have dimensions
"""

import os
from dotenv import load_dotenv
load_dotenv()

from core.sheets_manager import SheetsManager

COLLECTION_NAME = 'basins'

def main():
    print("=" * 80)
    print("BASIN DIMENSIONS COUNT")
    print("=" * 80)

    sheets = SheetsManager()
    products_dict = sheets.get_all_products(COLLECTION_NAME)

    total = 0
    with_pdf = 0
    has_length = 0
    has_width = 0
    has_depth = 0
    has_all_three = 0
    has_any = 0
    suspect_depth = []  # Basins with depth > 250mm (likely wrong)

    for row_num, product in products_dict.items():
        spec_sheet = product.get('shopify_spec_sheet', '')
        length = product.get('length_mm', '')
        width = product.get('overall_width_mm', '')
        depth = product.get('overall_depth_mm', '')

        total += 1

        if spec_sheet and spec_sheet.lower().endswith('.pdf'):
            with_pdf += 1

        if length:
            has_length += 1
        if width:
            has_width += 1
        if depth:
            has_depth += 1
            # Check for suspect depth values
            try:
                depth_val = int(depth) if depth else 0
                if depth_val > 250:  # Basins typically 100-250mm deep
                    suspect_depth.append({
                        'row': row_num,
                        'sku': product.get('variant_sku', 'Unknown'),
                        'title': product.get('title', 'Unknown')[:60],
                        'depth': depth,
                        'spec_sheet': spec_sheet
                    })
            except ValueError:
                pass

        if length and width and depth:
            has_all_three += 1

        if length or width or depth:
            has_any += 1

    print(f"\nTotal products: {total}")
    print(f"Products with PDF spec sheets: {with_pdf}")
    print()
    print(f"Products with length: {has_length} ({has_length/total*100:.1f}%)")
    print(f"Products with width: {has_width} ({has_width/total*100:.1f}%)")
    print(f"Products with depth: {has_depth} ({has_depth/total*100:.1f}%)")
    print()
    print(f"Products with ALL three dimensions: {has_all_three} ({has_all_three/total*100:.1f}%)")
    print(f"Products with ANY dimensions: {has_any} ({has_any/total*100:.1f}%)")
    print()
    print(f"Missing dimensions (products with PDF): {with_pdf - has_all_three}")
    print()

    if suspect_depth:
        print("=" * 80)
        print(f"⚠️  {len(suspect_depth)} basins with SUSPICIOUS depth values (>250mm):")
        print("   These likely have the same issue as row 42 (using width instead of depth)")
        print("=" * 80)
        for item in suspect_depth:
            print(f"\nRow {item['row']}: {item['sku']} - Depth: {item['depth']}mm")
            print(f"   {item['title']}")
        print()
        print(f"💡 Recommendation: Re-extract these {len(suspect_depth)} basins with the fixed prompts")
    else:
        print("\n✅ No basins with suspicious depth values found")

    print("=" * 80)

if __name__ == '__main__':
    main()
