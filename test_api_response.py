#!/usr/bin/env python3
"""
Test script to verify shopify_spec_sheet is in API response
"""

from core.sheets_manager import get_sheets_manager
from config.collections import get_collection_config
import json

def test_toilets_api_response():
    """Test that shopify_spec_sheet is returned in API response"""

    sheets_manager = get_sheets_manager()
    collection_name = 'toilets'

    print("=" * 80)
    print("Testing API Response for Toilets Collection")
    print("=" * 80)
    print()

    # Get a single product (row 2 - first data row)
    product = sheets_manager.get_single_product(collection_name, 2)

    if not product:
        print("❌ Could not get product from row 2")
        return

    print(f"✅ Retrieved product from row 2")
    print()

    # Check for both spec sheet field names
    spec_sheet_keys = ['shopify_spec_sheet', 'product_specifications.pdf_urls']

    print("🔍 Checking for spec sheet fields in API response:")
    print("-" * 80)

    for key in spec_sheet_keys:
        if key in product:
            value = product[key]
            print(f"✅ {key:40s} = {value[:80] if value else '(empty)'}")
        else:
            print(f"❌ {key:40s} = NOT FOUND IN RESPONSE")

    print()
    print("📊 Sample of all product keys returned:")
    print("-" * 80)

    # Show first 20 keys
    keys = list(product.keys())[:20]
    for key in keys:
        value = str(product.get(key, ''))
        display_value = value[:50] + '...' if len(value) > 50 else value
        print(f"  {key:35s} = {display_value}")

    print()
    print(f"Total fields in response: {len(product)}")
    print()

    # Verify column mapping
    config = get_collection_config(collection_name)
    print("🗺️  Column Mapping Check:")
    print("-" * 80)

    for key in spec_sheet_keys:
        col_num = config.column_mapping.get(key)
        if col_num:
            print(f"✅ {key:40s} → Column {col_num}")
        else:
            print(f"❌ {key:40s} → NOT MAPPED")

    print()
    print("=" * 80)

if __name__ == '__main__':
    test_toilets_api_response()
