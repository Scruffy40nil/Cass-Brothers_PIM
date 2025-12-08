#!/usr/bin/env python3
"""
Test extraction from the problematic basin PDF
"""
import sys
import os
from dotenv import load_dotenv
load_dotenv()

from core.ai_extractor import AIExtractor

def test_basin_pdf():
    """Test extraction from Victoria Albert basin PDF"""
    pdf_url = "https://cdn.shopify.com/s/files/1/0552/5808/7468/files/victoria_albert_specsheet_31jan25_VB-AMT-60-NO.pdf"

    print("=" * 80)
    print("Testing Basin PDF Extraction")
    print("=" * 80)
    print(f"URL: {pdf_url}")
    print()

    # Initialize AI extractor
    extractor = AIExtractor()

    try:
        # Use the full extraction pipeline
        result = extractor._process_single_product_no_trigger(
            collection_name='basins',
            url=pdf_url,
            generate_content=False
        )

        if result.get('success') and result.get('extracted_data'):
            print("✅ Extraction successful!")
            print()
            print("Extracted data:")
            print("-" * 80)
            dims = result['extracted_data']

            # Show all extracted fields
            for field, value in dims.items():
                if value is not None:
                    print(f"  {field}: {value}")

            print()
            print("=" * 80)
            print("DIMENSION CHECK:")
            print("=" * 80)
            print(f"  Length: {dims.get('length_mm')} mm")
            print(f"  Width: {dims.get('overall_width_mm')} mm")
            print(f"  Depth: {dims.get('overall_depth_mm')} mm")
            print()

            depth = dims.get('overall_depth_mm')
            if depth == '157':
                print("✅ CORRECT! Depth is 157mm")
            elif depth == '263':
                print("❌ WRONG! Depth is 263mm (should be 157mm)")
            else:
                print(f"⚠️  Unexpected depth value: {depth}")

            return True
        else:
            print("❌ Extraction failed")
            print(f"Result: {result}")
            return False

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    test_basin_pdf()
