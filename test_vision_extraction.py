#!/usr/bin/env python3
"""
Test Vision API extraction for technical drawing PDFs
Tests the sparse text detection and Vision API fallback
"""

import sys
import logging
from core.ai_extractor import AIExtractor

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def test_vision_extraction():
    """Test Vision API extraction on Alix K011 PDF (technical drawing)"""

    # The problematic PDF URL
    test_url = "https://cdn.shopify.com/s/files/1/0552/5808/7468/files/Alix_K011_SpecSheet.pdf?v=1701821767"

    print("=" * 80)
    print("Testing Vision API Extraction for Technical Drawing PDFs")
    print("=" * 80)
    print()
    print(f"Test URL: {test_url}")
    print()

    # Initialize AI extractor
    ai_extractor = AIExtractor()

    if not ai_extractor.api_key:
        print("❌ ERROR: OpenAI API key not configured")
        print("ℹ️  Set OPENAI_API_KEY environment variable")
        return False

    print("✅ OpenAI API key configured")
    print()

    # Test PDF text extraction (should trigger Vision fallback)
    print("📄 Step 1: Fetching PDF content...")
    print("-" * 80)

    html_content = ai_extractor.fetch_html(test_url)

    if not html_content:
        print("❌ Failed to fetch PDF content")
        return False

    print(f"✅ Fetched {len(html_content)} characters")
    print()

    # Check if Vision API was triggered
    print("📊 Step 2: Analyzing extraction method used...")
    print("-" * 80)

    if len(html_content) < 500:
        print(f"⚠️  Sparse text detected ({len(html_content)} chars < 500 threshold)")
        print("✅ Vision API fallback should have been triggered")
    else:
        print(f"ℹ️  Text extraction sufficient ({len(html_content)} chars)")
        print("ℹ️  Vision API fallback not needed")

    print()

    # Show sample of extracted content
    print("📝 Step 3: Sample of extracted content:")
    print("-" * 80)
    print(html_content[:500])
    if len(html_content) > 500:
        print(f"\n... ({len(html_content) - 500} more characters)")
    print()

    # Test full AI extraction
    print("🤖 Step 4: Testing full AI extraction...")
    print("-" * 80)

    extracted_data = ai_extractor.extract_product_data('toilets', html_content, test_url)

    if not extracted_data:
        print("❌ AI extraction failed")
        return False

    print("✅ AI extraction succeeded")
    print()

    # Show key fields
    print("📋 Step 5: Extracted product data:")
    print("-" * 80)

    key_fields = [
        'installation_type',
        'trap_type',
        'actuation_type',
        'toilet_seat_type',
        'pan_height',
        'pan_width',
        'pan_depth',
        'overall_width_depth_height_mm',
        'model_name',
        'toilet_rim_design',
        'wels_rating'
    ]

    for field in key_fields:
        value = extracted_data.get(field, '(not extracted)')
        print(f"  {field:35s} = {value}")

    print()
    print("=" * 80)
    print("✅ Test Complete!")
    print("=" * 80)

    # Check if we got meaningful data
    extracted_count = sum(1 for field in key_fields if extracted_data.get(field))
    if extracted_count >= 5:
        print(f"✅ Successfully extracted {extracted_count}/{len(key_fields)} key fields")
        return True
    else:
        print(f"⚠️  Only extracted {extracted_count}/{len(key_fields)} key fields")
        print("ℹ️  Check if Vision API is working correctly")
        return False

if __name__ == '__main__':
    try:
        success = test_vision_extraction()
        sys.exit(0 if success else 1)
    except Exception as e:
        logger.error(f"❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
