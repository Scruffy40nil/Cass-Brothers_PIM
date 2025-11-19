#!/usr/bin/env python3
"""
BASIN DIMENSIONS EXTRACTOR

This script extracts ONLY dimensions (length, width, depth) from basin PDF spec sheets
and updates columns P, Q, R in the Google Sheet.

Useful for:
- Fixing incorrect dimensions without re-extracting all fields
- Populating dimensions for products that already have other data

Usage:
    python3 extract_basin_dimensions.py
"""

# Load environment variables FIRST, before any imports
import os
from dotenv import load_dotenv
load_dotenv()

# Now import modules that depend on environment variables
import sys
import time
import re
from typing import Optional, Dict
from core.ai_extractor import AIExtractor
from core.sheets_manager import SheetsManager
from config.collections import get_collection_config

# ============================================================================
# CONFIGURATION
# ============================================================================

COLLECTION_NAME = 'basins'
BATCH_SIZE = 10  # Write to sheets every N products

# Column numbers for dimensions (1-indexed)
LENGTH_COLUMN = 16   # Column P
WIDTH_COLUMN = 17    # Column Q
DEPTH_COLUMN = 18    # Column R

# ============================================================================
# DIMENSION EXTRACTION
# ============================================================================

def extract_dimensions_from_pdf(extractor: AIExtractor, pdf_url: str) -> Dict[str, Optional[str]]:
    """
    Extract ONLY dimensions from a PDF spec sheet using AI.
    Returns dict with length_mm, overall_width_mm, overall_depth_mm
    """

    # Build a focused prompt for dimension extraction
    dimension_prompt = f"""Analyze this basin/washbasin spec sheet and extract ONLY the dimensions.

URL: {pdf_url}

Extract these THREE dimensions if present:

1. **length_mm** - Basin length in millimeters (longest dimension)
   - Look for: "Length", "L:", measurements typically 400-1000mm
   - Extract just the number (e.g., "530mm" → "530")

2. **overall_width_mm** - Basin width in millimeters
   - Look for: "Width", "W:", measurements typically 300-600mm
   - Extract just the number (e.g., "400mm" → "400")

3. **overall_depth_mm** - Basin depth/height in millimeters
   - Look for: "Depth", "Height", "H:", "D:", measurements typically 100-250mm
   - Extract just the number (e.g., "180mm" → "180")

IMPORTANT DIMENSION FORMAT RULES:
- If you see "490 x 365mm", this typically means:
  * First number = length_mm OR overall_width_mm (depends on context)
  * Second number = overall_width_mm OR length_mm (whichever is not used above)
  * Depth is usually shown separately

- For technical diagrams, look for dimension lines with arrows showing:
  * Overall length (left to right)
  * Overall width (front to back)
  * Overall depth (top to bottom or basin height)

- Extract ONLY the numbers in mm (no units in the value)
- If a dimension is not found, return null
- DO NOT guess or make up dimensions

Return as JSON:
{{
  "length_mm": "530",
  "overall_width_mm": "400",
  "overall_depth_mm": "180"
}}

ACCURACY CRITICAL: Better to return null than incorrect dimensions."""

    try:
        # Use the full extraction pipeline which handles PDFs correctly
        result = extractor._process_single_product_no_trigger(
            collection_name='basins',
            url=pdf_url,
            generate_content=False
        )

        if result.get('success') and result.get('extracted_data'):
            dims = result['extracted_data']
            return {
                'length_mm': dims.get('length_mm'),
                'overall_width_mm': dims.get('overall_width_mm'),
                'overall_depth_mm': dims.get('overall_depth_mm')
            }

    except Exception as e:
        print(f"  ❌ Error extracting dimensions: {e}")

    return {'length_mm': None, 'overall_width_mm': None, 'overall_depth_mm': None}


# ============================================================================
# MAIN SCRIPT
# ============================================================================

def main():
    print("=" * 80)
    print("BASIN DIMENSIONS EXTRACTOR")
    print("=" * 80)
    print("\nThis script extracts ONLY dimensions from basin PDFs")
    print("and updates columns P, Q, R (length, width, depth)")
    print()

    # Check OpenAI API key
    api_key = os.environ.get('OPENAI_API_KEY', '')
    if not api_key:
        print("❌ Error: OPENAI_API_KEY not found in environment")
        return
    print(f"✅ OpenAI API key loaded (starts with: {api_key[:20]}...)")

    # Step 1: Initialize managers
    print("\n📥 Step 1: Initializing Google Sheets connection...")
    sheets = SheetsManager()

    print("📥 Step 2: Fetching all Basins products...")
    products_dict = sheets.get_all_products(COLLECTION_NAME)

    if not products_dict:
        print("❌ No products found")
        return

    print(f"✅ Retrieved {len(products_dict)} products")

    # Step 3: Filter products with spec sheets
    print("\n📥 Step 3: Filtering products with PDF spec sheets...")
    products_to_process = []

    for row_num, product in products_dict.items():
        spec_sheet = product.get('shopify_spec_sheet', '').strip()

        if spec_sheet and spec_sheet.lower().endswith('.pdf'):
            products_to_process.append({
                'row': row_num,
                'sku': product.get('variant_sku', 'Unknown'),
                'title': product.get('title', 'Unknown'),
                'spec_sheet': spec_sheet,
                'current_length': product.get('length_mm', ''),
                'current_width': product.get('overall_width_mm', ''),
                'current_depth': product.get('overall_depth_mm', '')
            })

    print(f"✅ Found {len(products_to_process)} products with PDF spec sheets")

    if len(products_to_process) == 0:
        print("⚠️ No products to process")
        return

    # Ask for confirmation
    response = input(f"\nExtract dimensions for {len(products_to_process)} products? (y/n): ")
    if response.lower() != 'y':
        print("❌ Cancelled")
        return

    # Step 4: Initialize AI extractor
    print("\n📥 Step 4: Initializing AI extractor...")
    extractor = AIExtractor()
    print("✅ AI extractor ready")

    # Step 5: Process products
    print(f"\n📥 Step 5: Processing {len(products_to_process)} products...")
    print("=" * 80)

    succeeded = 0
    failed = 0
    skipped = 0
    pending_updates = []

    for i, product in enumerate(products_to_process, 1):
        print(f"\n[{i}/{len(products_to_process)}] Processing Row {product['row']} - {product['sku']}")
        print(f"  Title: {product['title'][:60]}...")
        print(f"  Current: L={product['current_length']}, W={product['current_width']}, D={product['current_depth']}")

        try:
            # Extract dimensions
            dimensions = extract_dimensions_from_pdf(extractor, product['spec_sheet'])

            length = dimensions.get('length_mm')
            width = dimensions.get('overall_width_mm')
            depth = dimensions.get('overall_depth_mm')

            print(f"  Extracted: L={length}, W={width}, D={depth}")

            # Prepare update
            update_data = {}
            if length:
                update_data['length_mm'] = length
            if width:
                update_data['overall_width_mm'] = width
            if depth:
                update_data['overall_depth_mm'] = depth

            if update_data:
                pending_updates.append({
                    'row': product['row'],
                    'data': update_data
                })
                succeeded += 1
                print(f"  ✅ Queued for update")
            else:
                skipped += 1
                print(f"  ⏭️ No dimensions found - skipped")

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
    print("🎉 Extraction Complete!")
    print("=" * 80)
    print(f"Total: {len(products_to_process)}")
    print(f"✓ Succeeded: {succeeded}")
    print(f"✗ Failed: {failed}")
    print(f"⏭️ Skipped: {skipped}")
    print()
    print("✅ Dimensions have been written to Google Sheets!")


def write_batch_to_sheets(sheets: SheetsManager, updates: list):
    """Write a batch of dimension updates to Google Sheets"""
    config = get_collection_config(COLLECTION_NAME)
    worksheet = sheets.get_worksheet(COLLECTION_NAME)

    batch_data = []

    for update in updates:
        row = update['row']
        data = update['data']

        # Add each dimension update
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
