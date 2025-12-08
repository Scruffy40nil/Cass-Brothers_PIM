#!/usr/bin/env python3
"""
Debug Victoria Albert basin extraction - see what Vision API extracts
"""
import os
import sys
import requests
import base64
import io
from dotenv import load_dotenv
load_dotenv()

from pdf2image import convert_from_bytes

def debug_vision_extraction():
    """See what the Vision API extracts from Victoria Albert PDF"""
    pdf_url = "https://cdn.shopify.com/s/files/1/0552/5808/7468/files/victoria_albert_specsheet_31jan25_VB-AMT-60-NO.pdf"

    print("=" * 80)
    print("Debugging Victoria Albert Basin PDF")
    print("=" * 80)
    print(f"URL: {pdf_url}")
    print()

    # Download PDF
    print("📥 Downloading PDF...")
    response = requests.get(pdf_url, timeout=30)
    pdf_content = response.content
    print(f"✅ Downloaded {len(pdf_content)/1024:.1f} KB")
    print()

    # Convert to images
    print("🖼️  Converting PDF to images...")
    images = convert_from_bytes(pdf_content, dpi=200, fmt='PNG')
    print(f"✅ Converted to {len(images)} image(s)")
    print()

    # Get API key
    api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key:
        print("❌ No OPENAI_API_KEY found")
        return

    # Vision prompt for basins
    vision_prompt = """Extract ALL visible text and measurements from this basin spec sheet/technical drawing.

CRITICAL - Focus on extracting these BASIN DIMENSIONS (VERY IMPORTANT):
⚠️ Look for "Overall dimensions" or "Product dimensions" section - NOT bowl or cutout dimensions!

When you find dimensions in the format "530 x 400 x 180mm" or similar:
- First number = length_mm (longest horizontal dimension, typically 400-1000mm)
- Second number = overall_width_mm (shorter horizontal dimension, typically 300-600mm)
- Third number = overall_depth_mm (height/depth, typically 100-250mm)

Format dimensions EXACTLY like this:
"length_mm: 530"
"overall_width_mm: 400"
"overall_depth_mm: 180"

Also extract:
- Product specifications and material
- Installation type (countertop, undermount, wall-hung, etc.)
- Waste outlet dimensions
- Overflow (yes/no)
- Model numbers and codes
- Warranty information
- Any text visible in the document

Format the output as clear, structured text with all measurements and specifications clearly labeled."""

    # Process each page
    for page_num, page_image in enumerate(images, 1):
        print(f"\n{'=' * 80}")
        print(f"Page {page_num}/{len(images)}")
        print('=' * 80)

        # Convert to base64
        buffer = io.BytesIO()
        page_image.save(buffer, format='PNG')
        image_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

        print(f"🔍 Calling Vision API...")

        # Call Vision API
        try:
            response = requests.post(
                'https://api.openai.com/v1/chat/completions',
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {api_key}',
                },
                json={
                    'model': 'gpt-4o',
                    'messages': [
                        {
                            'role': 'user',
                            'content': [
                                {
                                    'type': 'text',
                                    'text': vision_prompt
                                },
                                {
                                    'type': 'image_url',
                                    'image_url': {
                                        'url': f'data:image/png;base64,{image_base64}'
                                    }
                                }
                            ]
                        }
                    ],
                    'max_tokens': 2000
                },
                timeout=30
            )

            if response.status_code == 429:
                print("❌ Rate limited - waiting 60 seconds...")
                import time
                time.sleep(60)
                continue

            response.raise_for_status()
            result = response.json()

            if 'choices' in result and result['choices']:
                vision_text = result['choices'][0]['message']['content'].strip()
                print(f"\n✅ Vision API Response ({len(vision_text)} chars):")
                print("-" * 80)
                print(vision_text)
                print("-" * 80)
            else:
                print("❌ No response from Vision API")

        except Exception as e:
            print(f"❌ Vision API error: {e}")
            if hasattr(e, 'response') and e.response:
                print(f"Response: {e.response.text}")

if __name__ == '__main__':
    debug_vision_extraction()
