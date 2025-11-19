#!/usr/bin/env python3
"""
Quick verification script to check basin dimensions in Google Sheet
Shows first 10 products with their current dimensions
"""

import os
from dotenv import load_dotenv
load_dotenv()

from core.sheets_manager import SheetsManager

COLLECTION_NAME = 'basins'

def main():
    print("=" * 80)
    print("BASIN DIMENSIONS VERIFICATION")
    print("=" * 80)

    sheets = SheetsManager()
    products_dict = sheets.get_all_products(COLLECTION_NAME)

    print(f"\nTotal products: {len(products_dict)}")
    print("\nFirst 10 products with dimensions:")
    print("-" * 80)

    count = 0
    for row_num, product in sorted(products_dict.items()):
        if count >= 10:
            break

        sku = product.get('variant_sku', 'Unknown')
        title = product.get('title', 'Unknown')[:50]
        length = product.get('length_mm', '')
        width = product.get('overall_width_mm', '')
        depth = product.get('overall_depth_mm', '')
        spec_sheet = product.get('shopify_spec_sheet', '')

        if spec_sheet and spec_sheet.lower().endswith('.pdf'):
            print(f"\nRow {row_num}: {sku}")
            print(f"  Title: {title}")
            print(f"  L={length}, W={width}, D={depth}")
            print(f"  PDF: {spec_sheet[:60]}...")
            count += 1

    print("\n" + "=" * 80)

if __name__ == '__main__':
    main()
