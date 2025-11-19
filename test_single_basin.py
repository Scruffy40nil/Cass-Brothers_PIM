#!/usr/bin/env python3
"""
Test dimension extraction for a single basin (Row 2)
"""

import os
from dotenv import load_dotenv
load_dotenv()

from core.ai_extractor import AIExtractor
from core.sheets_manager import SheetsManager

def main():
    print("=" * 80)
    print("TESTING SINGLE BASIN DIMENSION EXTRACTION - Row 2")
    print("=" * 80)

    # Row 2: Duravit Starck 3 Under Counter Basin
    pdf_url = "https://cdn.prod.website-files.com/5f06aa286b396d218fc1e85b/607d08a7134b1e366c7d4b77_Starck%203%20Undercounter%20Basin%20-%200305490000.pdf"

    print(f"\nPDF: {pdf_url}")
    print("\nExpected dimensions:")
    print("  Length: 530mm")
    print("  Width: 400mm")
    print("  Depth: 180mm")
    print("\n" + "-" * 80)

    extractor = AIExtractor()

    print("\nExtracting dimensions...")
    result = extractor._process_single_product_no_trigger(
        collection_name='basins',
        url=pdf_url,
        generate_content=False
    )

    if result.get('success') and result.get('extracted_data'):
        dims = result['extracted_data']
        length = dims.get('length_mm')
        width = dims.get('overall_width_mm')
        depth = dims.get('overall_depth_mm')

        print("\n" + "=" * 80)
        print("EXTRACTION RESULTS:")
        print("=" * 80)
        print(f"  Length:  {length}mm")
        print(f"  Width:   {width}mm")
        print(f"  Depth:   {depth}mm")

        # Check if correct
        correct = (length == "530" and width == "400" and depth == "180")

        if correct:
            print("\n✅ SUCCESS! Dimensions extracted correctly!")
        else:
            print("\n❌ INCORRECT! Dimensions don't match expected values.")
            print("\nExpected: L=530, W=400, D=180")
            print(f"Got:      L={length}, W={width}, D={depth}")
    else:
        print("\n❌ Extraction failed")
        print(f"Error: {result.get('error', 'Unknown error')}")

if __name__ == '__main__':
    main()
