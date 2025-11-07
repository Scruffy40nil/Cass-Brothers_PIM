#!/usr/bin/env python3
"""
Quick diagnostic script to check toilets sheet column headers
"""

from config.settings import get_settings
from core.sheets_manager import get_sheets_manager
from config.collections import get_collection_config

def check_toilets_columns():
    sheets_manager = get_sheets_manager()
    collection_name = 'toilets'

    print("🔍 Checking Toilets Collection Column Structure")
    print("=" * 80)
    print()

    # Get the worksheet
    worksheet = sheets_manager.get_worksheet(collection_name)
    if not worksheet:
        print("❌ Could not access worksheet")
        return

    # Get headers (row 1)
    headers = worksheet.row_values(1)

    print(f"📋 Total columns: {len(headers)}")
    print()

    # Get collection config
    config = get_collection_config(collection_name)

    # Check key columns
    print("🔑 Key Column Mappings:")
    print("-" * 80)

    key_fields = [
        'shopify_images',
        'shopify_spec_sheet',
        'product_specifications.pdf_urls',
        'installation_type',
        'product_material',
        'style',
        'warranty_years'
    ]

    for field in key_fields:
        col_num = config.column_mapping.get(field)
        if col_num:
            col_letter = chr(64 + col_num) if col_num <= 26 else f"A{chr(64 + col_num - 26)}"
            actual_header = headers[col_num - 1] if col_num <= len(headers) else "❌ COLUMN DOESN'T EXIST"
            status = "✅" if col_num <= len(headers) and headers[col_num - 1] else "❌"
            print(f"{status} {field:40s} → Column {col_letter:4s} (#{col_num:3d}): {actual_header}")
        else:
            print(f"⚠️  {field:40s} → NOT MAPPED")

    print()
    print("📊 All Headers:")
    print("-" * 80)
    for i, header in enumerate(headers, 1):
        col_letter = chr(64 + i) if i <= 26 else f"A{chr(64 + i - 26)}" if i <= 52 else f"B{chr(64 + i - 52)}"
        mapped_field = None
        for field, col_num in config.column_mapping.items():
            if col_num == i:
                mapped_field = field
                break

        mapping_info = f" → {mapped_field}" if mapped_field else ""
        print(f"{col_letter:4s} (#{i:3d}): {header}{mapping_info}")

    print()
    print("=" * 80)

    # Check for issues
    print()
    print("🔍 Potential Issues:")
    print("-" * 80)

    if config.column_mapping.get('shopify_images', 0) > len(headers):
        print("❌ shopify_images is mapped to column", config.column_mapping['shopify_images'],
              "but sheet only has", len(headers), "columns")
        print("   → Images will not be loaded!")

    if not headers[config.column_mapping.get('shopify_images', 0) - 1] if config.column_mapping.get('shopify_images', 0) <= len(headers) else True:
        print("❌ shopify_images column exists but has no header name")
        print("   → Images may not be loaded correctly!")

    spec_sheet_col = config.column_mapping.get('shopify_spec_sheet')
    if spec_sheet_col and spec_sheet_col <= len(headers):
        print(f"✅ shopify_spec_sheet is mapped to column {spec_sheet_col} ({headers[spec_sheet_col-1]})")

    print()

if __name__ == '__main__':
    check_toilets_columns()
