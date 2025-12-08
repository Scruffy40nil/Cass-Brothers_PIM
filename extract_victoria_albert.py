#!/usr/bin/env python3
"""
Manually extract Victoria Albert basin dimensions using Vision API
This uses the same method as debug_victoria_albert.py which we know works
"""

import os
from dotenv import load_dotenv
load_dotenv()

import sys
import time
import requests
import base64
import io
from pdf2image import convert_from_bytes
from openai import OpenAI

from core.sheets_manager import SheetsManager
from config.collections import get_collection_config

COLLECTION_NAME = 'basins'

def extract_dimensions_from_pdf(url: str) -> dict:
    """Extract dimensions from a single PDF using Vision API"""

    print(f"📥 Downloading PDF from {url}...")

    try:
        # Download PDF
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        pdf_content = response.content

        print(f"✅ Downloaded {len(pdf_content)/1024:.1f} KB")

        # Convert to images
        print(f"🖼️  Converting PDF to images...")
        images = convert_from_bytes(pdf_content, dpi=200, fmt='PNG')

        if not images:
            print("❌ No images generated from PDF")
            return None

        print(f"✅ Converted to {len(images)} image(s)")

        # Process first page with Vision API
        print(f"🔍 Calling Vision API...")

        # Convert PIL Image to base64
        buffer = io.BytesIO()
        images[0].save(buffer, format='PNG')
        image_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

        # Vision API prompt
        vision_prompt = """Extract the basin dimensions from this technical drawing.

Look for "Overall dimensions" or "Product dimensions" section.

Return ONLY a JSON object with these fields:
{
  "length_mm": "600",
  "overall_width_mm": "413",
  "overall_depth_mm": "157"
}

CRITICAL: Basin "depth" or "height" = VERTICAL dimension from base to rim
- Look at FRONT VIEW or SECTION VIEW for the vertical measurement
- This is typically 100-250mm
- Do NOT use horizontal measurements from side views!

Return ONLY the JSON, nothing else."""

        # Call Vision API
        client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY'))

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": vision_prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{image_base64}",
                                "detail": "high"
                            }
                        }
                    ]
                }
            ],
            max_tokens=500,
            temperature=0.1
        )

        vision_result = response.choices[0].message.content
        print(f"✅ Vision API Response ({len(vision_result)} chars)")

        # Parse JSON from response
        import json
        import re

        # Extract JSON from markdown code blocks if present
        json_match = re.search(r'```json\s*(\{.*?\})\s*```', vision_result, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            # Try to find raw JSON
            json_match = re.search(r'\{[^}]*"length_mm"[^}]*\}', vision_result, re.DOTALL)
            if json_match:
                json_str = json_match.group(0)
            else:
                print(f"⚠️ Could not find JSON in response:")
                print(vision_result)
                return None

        try:
            dimensions = json.loads(json_str)
            return dimensions
        except json.JSONDecodeError as e:
            print(f"❌ Failed to parse JSON: {e}")
            print(f"JSON string: {json_str}")
            return None

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return None


def main():
    print("=" * 80)
    print("VICTORIA ALBERT BASIN EXTRACTION")
    print("=" * 80)
    print()

    # Check OpenAI API key
    api_key = os.environ.get('OPENAI_API_KEY', '')
    if not api_key:
        print("❌ Error: OPENAI_API_KEY not found in environment")
        return
    print(f"✅ OpenAI API key loaded")

    # Initialize sheets manager
    print("\n📥 Initializing Google Sheets connection...")
    sheets = SheetsManager()

    print("📥 Fetching all Basins products...")
    products_dict = sheets.get_all_products(COLLECTION_NAME)

    if not products_dict:
        print("❌ No products found")
        return

    print(f"✅ Retrieved {len(products_dict)} products")

    # Filter Victoria Albert basins with missing dimensions
    print("\n📥 Filtering Victoria Albert basins...")
    victoria_albert_basins = []

    for row_num, product in products_dict.items():
        sku = product.get('variant_sku', '')
        title = product.get('title', '')
        spec_sheet = product.get('shopify_spec_sheet', '').strip()

        # Check if Victoria Albert
        is_victoria_albert = 'victoria' in title.lower() and 'albert' in title.lower()

        if not is_victoria_albert:
            continue

        # Check if has PDF
        if not spec_sheet or not spec_sheet.lower().endswith('.pdf'):
            continue

        # Check if missing dimensions
        length = product.get('length_mm', '').strip()
        width = product.get('overall_width_mm', '').strip()
        depth = product.get('overall_depth_mm', '').strip()

        if not length or not width or not depth:
            victoria_albert_basins.append({
                'row': row_num,
                'sku': sku,
                'title': title,
                'spec_sheet': spec_sheet,
                'current': f"L={length or 'None'}, W={width or 'None'}, D={depth or 'None'}"
            })

    print(f"✅ Found {len(victoria_albert_basins)} Victoria Albert basins with missing dimensions")

    if len(victoria_albert_basins) == 0:
        print("✅ All Victoria Albert basins have complete dimensions!")
        return

    # Show what we'll process
    print("\nBasins to process:")
    for basin in victoria_albert_basins:
        print(f"  Row {basin['row']}: {basin['sku']} - {basin['title'][:50]}...")
        print(f"    Current: {basin['current']}")

    # Ask for confirmation
    if sys.stdin.isatty():
        response = input(f"\nExtract dimensions for {len(victoria_albert_basins)} Victoria Albert basins? (y/n): ")
        if response.lower() != 'y':
            print("❌ Cancelled")
            return
    else:
        print(f"\n✅ Auto-confirming extraction for {len(victoria_albert_basins)} products")

    # Process each basin
    print(f"\n📥 Processing {len(victoria_albert_basins)} basins...")
    print("=" * 80)

    succeeded = 0
    failed = 0
    config = get_collection_config(COLLECTION_NAME)
    worksheet = sheets.get_worksheet(COLLECTION_NAME)

    for i, basin in enumerate(victoria_albert_basins, 1):
        print(f"\n[{i}/{len(victoria_albert_basins)}] Processing Row {basin['row']} - {basin['sku']}")
        print(f"  Title: {basin['title'][:60]}...")

        try:
            # Extract dimensions
            dimensions = extract_dimensions_from_pdf(basin['spec_sheet'])

            if dimensions:
                length = dimensions.get('length_mm')
                width = dimensions.get('overall_width_mm')
                depth = dimensions.get('overall_depth_mm')

                print(f"  Extracted: L={length}, W={width}, D={depth}")

                # Update Google Sheet immediately
                batch_data = []

                if length:
                    batch_data.append({
                        'range': f'P{basin["row"]}',  # Column P = length_mm
                        'values': [[length]]
                    })

                if width:
                    batch_data.append({
                        'range': f'Q{basin["row"]}',  # Column Q = overall_width_mm
                        'values': [[width]]
                    })

                if depth:
                    batch_data.append({
                        'range': f'R{basin["row"]}',  # Column R = overall_depth_mm
                        'values': [[depth]]
                    })

                if batch_data:
                    worksheet.batch_update(batch_data)
                    print(f"  ✅ Updated {len(batch_data)} fields in Google Sheets")
                    succeeded += 1
                else:
                    print(f"  ⚠️ No dimensions to update")
                    failed += 1
            else:
                print(f"  ❌ Failed to extract dimensions")
                failed += 1

            # Rate limit
            time.sleep(2)

        except Exception as e:
            print(f"  ❌ Error: {e}")
            failed += 1

    # Summary
    print("\n" + "=" * 80)
    print("🎉 Victoria Albert Extraction Complete!")
    print("=" * 80)
    print(f"Total: {len(victoria_albert_basins)}")
    print(f"✓ Succeeded: {succeeded}")
    print(f"✗ Failed: {failed}")
    print()


if __name__ == '__main__':
    main()
