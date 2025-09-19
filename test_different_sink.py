#!/usr/bin/env python3
"""
Test the dynamic competitor research with a different sink model
"""

import sys
import os
sys.path.append('/workspaces/Cass-Brothers_PIM')

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

from core.ai_extractor import AIExtractor
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_different_sink():
    """Test with a different sink model"""

    ai_extractor = AIExtractor()

    # Test data - Different Abey sink without drain tray/mixer
    test_product_data = {
        'variant_sku': 'LAGO200U',
        'sku': 'LAGO200U',
        'brand_name': 'Abey',
        'product_material': 'Stainless Steel',
        'installation_type': 'Undermount',
        'bowls_number': '1'
    }

    print("🚀 Testing Different Sink Model (No Drain Tray/Mixer)")
    print("=" * 70)
    print(f"Product: {test_product_data['brand_name']} {test_product_data['variant_sku']}")
    print(f"Material: {test_product_data['product_material']}")
    print(f"Bowls: {test_product_data['bowls_number']}")
    print(f"Installation: {test_product_data['installation_type']}")
    print("-" * 70)

    # Test the enhanced title generation
    try:
        result = ai_extractor.generate_seo_product_title_with_competitor_analysis(
            test_product_data, 'sinks'
        )

        print("📊 TITLE GENERATION RESULTS:")
        print()

        if result.get('success'):
            print("✅ ChatGPT-Generated Titles:")
            titles = result.get('titles', [])
            for i, title in enumerate(titles, 1):
                print(f"  {i}. {title}")
        else:
            print(f"⚠️ ChatGPT failed: {result.get('error', 'Unknown error')}")

        # Show competitor analysis
        if result.get('competitor_analysis', {}).get('competitor_data'):
            print("\n🔍 COMPETITOR ANALYSIS:")
            for comp in result['competitor_analysis']['competitor_data']:
                print(f"  • {comp.get('competitor', 'Unknown')}: \"{comp.get('title', '')}\"")
                print(f"    Price: {comp.get('price', 'N/A')} | Method: {comp.get('found_by', 'unknown')}")

        # Show fallback titles if any
        if result.get('fallback_titles'):
            print("\n🎯 FALLBACK TITLES:")
            for i, title in enumerate(result['fallback_titles'], 1):
                print(f"  {i}. {title}")

    except Exception as e:
        print(f"❌ Error during testing: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_different_sink()