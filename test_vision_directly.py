#!/usr/bin/env python3
"""
Test Vision API extraction directly on Studio Bagno PDF
"""

import os
import requests
import io
from dotenv import load_dotenv
load_dotenv()

from core.ai_extractor import AIExtractor

def main():
    pdf_url = "https://cdn.shopify.com/s/files/1/0552/5808/7468/files/studio_bagno_specsheet_30jan2024_SOL13-1.pdf"

    print("=" * 80)
    print("TESTING VISION API DIRECTLY")
    print("=" * 80)

    # Download PDF
    response = requests.get(pdf_url, timeout=30)
    pdf_content = response.content

    print(f"\nDownloaded {len(pdf_content)} bytes")

    # Test Vision extraction
    extractor = AIExtractor()

    print("\nCalling Vision API...")
    vision_result = extractor._extract_from_pdf_with_vision(
        pdf_content,
        pdf_url,
        collection_name='basins'
    )

    print("\n" + "=" * 80)
    print("VISION API RESULT:")
    print("=" * 80)

    if vision_result:
        print(f"\nExtracted {len(vision_result)} characters")
        print("\nContent:")
        print("-" * 80)
        print(vision_result)
    else:
        print("\n❌ Vision extraction returned None")

if __name__ == '__main__':
    main()
