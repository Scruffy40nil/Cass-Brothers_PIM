#!/usr/bin/env python3
"""
Debug Studio Bagno PDF extraction
"""

import os
from dotenv import load_dotenv
load_dotenv()

from core.ai_extractor import AIExtractor

def main():
    print("=" * 80)
    print("DEBUG STUDIO BAGNO PDF EXTRACTION")
    print("=" * 80)

    # Row 33: Studio Bagno Soul 4H Bench Basin
    pdf_url = "https://cdn.shopify.com/s/files/1/0552/5808/7468/files/studio_bagno_specsheet_30jan2024_SOL13-1.pdf"

    print(f"\nPDF: {pdf_url}")
    print("\n" + "-" * 80)

    extractor = AIExtractor()

    print("\nExtracting with full pipeline...")
    result = extractor._process_single_product_no_trigger(
        collection_name='basins',
        url=pdf_url,
        generate_content=False
    )

    print("\n" + "=" * 80)
    print("RESULT:")
    print("=" * 80)

    if result.get('success'):
        print("✅ Extraction succeeded")
        dims = result.get('extracted_data', {})
        print(f"\nExtracted data keys: {list(dims.keys())}")
        print(f"\nDimensions:")
        print(f"  Length:  {dims.get('length_mm')}")
        print(f"  Width:   {dims.get('overall_width_mm')}")
        print(f"  Depth:   {dims.get('overall_depth_mm')}")
        print(f"\nOther fields:")
        for key, value in dims.items():
            if key not in ['length_mm', 'overall_width_mm', 'overall_depth_mm']:
                print(f"  {key}: {value}")
    else:
        print("❌ Extraction failed")
        print(f"Error: {result.get('error', 'Unknown error')}")

if __name__ == '__main__':
    main()
