#!/usr/bin/env python3
"""
Re-extract dimensions for Victoria Albert basin (Row 42)
"""
import os
import sys
from dotenv import load_dotenv
load_dotenv()

from core.ai_extractor import AIExtractor
from core.sheets_manager import SheetsManager
from config.collections import get_collection_config

def fix_row_42():
    """Re-extract dimensions for row 42 with the updated prompts"""

    COLLECTION_NAME = 'basins'
    ROW_NUMBER = 42

    print("=" * 80)
    print("Re-extracting Basin Dimensions for Row 42")
    print("=" * 80)
    print()

    # Initialize managers
    print("📥 Initializing Google Sheets connection...")
    sheets = SheetsManager()

    print("📥 Fetching product data for row 42...")
    products_dict = sheets.get_all_products(COLLECTION_NAME)

    if ROW_NUMBER not in products_dict:
        print(f"❌ Row {ROW_NUMBER} not found in sheet")
        return False

    product = products_dict[ROW_NUMBER]
    spec_sheet = product.get('shopify_spec_sheet', '').strip()

    print(f"✅ Found product:")
    print(f"  SKU: {product.get('variant_sku', 'Unknown')}")
    print(f"  Title: {product.get('title', 'Unknown')}")
    print(f"  Spec Sheet: {spec_sheet}")
    print(f"  Current Dimensions:")
    print(f"    Length: {product.get('length_mm', 'None')} mm")
    print(f"    Width: {product.get('overall_width_mm', 'None')} mm")
    print(f"    Depth: {product.get('overall_depth_mm', 'None')} mm (should be 157mm)")
    print()

    if not spec_sheet or not spec_sheet.lower().endswith('.pdf'):
        print("❌ No PDF spec sheet found")
        return False

    # Initialize AI extractor
    print("📥 Initializing AI extractor...")
    extractor = AIExtractor()
    print("✅ AI extractor ready")
    print()

    # Extract dimensions
    print("🤖 Extracting dimensions with updated prompts...")
    try:
        result = extractor._process_single_product_no_trigger(
            collection_name='basins',
            url=spec_sheet,
            generate_content=False
        )

        if result.get('success') and result.get('extracted_data'):
            dims = result['extracted_data']

            length = dims.get('length_mm')
            width = dims.get('overall_width_mm')
            depth = dims.get('overall_depth_mm')

            print("✅ Extraction successful!")
            print()
            print("Extracted dimensions:")
            print(f"  Length: {length} mm")
            print(f"  Width: {width} mm")
            print(f"  Depth: {depth} mm")
            print()

            # Check if depth is correct
            if depth == '157':
                print("✅ SUCCESS! Depth is now correct (157mm)")
            elif depth == '263':
                print("❌ STILL WRONG! Depth is still 263mm")
                print("   The fix may not have taken effect yet")
            else:
                print(f"⚠️  Unexpected depth value: {depth}")

            # Update Google Sheet
            print()
            # Auto-confirm update
            print("Updating Google Sheet with these values...")
            if True:
                print("💾 Updating Google Sheet row 42...")

                worksheet = sheets.get_worksheet(COLLECTION_NAME)
                batch_data = []

                if length:
                    batch_data.append({
                        'range': f'P{ROW_NUMBER}',  # Column P
                        'values': [[length]]
                    })

                if width:
                    batch_data.append({
                        'range': f'Q{ROW_NUMBER}',  # Column Q
                        'values': [[width]]
                    })

                if depth:
                    batch_data.append({
                        'range': f'R{ROW_NUMBER}',  # Column R
                        'values': [[depth]]
                    })

                if batch_data:
                    worksheet.batch_update(batch_data)
                    print(f"✅ Updated {len(batch_data)} dimension fields in row {ROW_NUMBER}")
                else:
                    print("⚠️  No dimensions to update")
            else:
                print("❌ Cancelled - sheet not updated")

            return True
        else:
            print("❌ Extraction failed")
            if result.get('errors'):
                print(f"Errors: {result['errors']}")
            return False

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    fix_row_42()
