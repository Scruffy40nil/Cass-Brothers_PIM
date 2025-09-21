#!/usr/bin/env python3
"""
Test Google Custom Search API integration for competitor research
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

def test_google_search_integration():
    """Test Google Custom Search API for competitor research"""

    print("🔍 Testing Google Custom Search API Integration")
    print("=" * 70)

    # Check if Google API credentials are configured
    google_api_key = os.getenv('GOOGLE_API_KEY')
    google_cse_id = os.getenv('GOOGLE_CSE_ID')

    print(f"Google API Key: {'✅ Configured' if google_api_key and google_api_key != 'YOUR_GOOGLE_API_KEY_HERE' else '❌ Not configured'}")
    print(f"Google CSE ID: {'✅ Configured' if google_cse_id and google_cse_id != 'YOUR_CUSTOM_SEARCH_ENGINE_ID_HERE' else '❌ Not configured'}")

    if not google_api_key or google_api_key == 'YOUR_GOOGLE_API_KEY_HERE':
        print("\n🚨 SETUP REQUIRED:")
        print("1. Go to https://console.developers.google.com/")
        print("2. Create a new project or select existing")
        print("3. Enable Custom Search JSON API")
        print("4. Create API credentials (API Key)")
        print("5. Go to https://cse.google.com/")
        print("6. Create a Custom Search Engine")
        print("7. Add the API key and CSE ID to .env file")
        print("\nExample .env configuration:")
        print("GOOGLE_API_KEY=AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
        print("GOOGLE_CSE_ID=xxxxxxxxxxxxxxxxx:xxxxxxxxxx")
        return

    # Test with actual product data
    ai_extractor = AIExtractor()

    test_product_data = {
        'variant_sku': 'FRA400DT15',
        'sku': 'FRA400DT15',
        'brand_name': 'Abey',
        'product_material': '316 Stainless Steel',
        'installation_type': 'Topmount & Undermount',
        'bowls_number': '2'
    }

    print(f"\n🎯 Testing with: {test_product_data['brand_name']} {test_product_data['variant_sku']}")
    print("-" * 70)

    try:
        # Test Google search directly
        retailers = [
            {'name': 'Harvey Norman', 'domain': 'harveynorman.com.au'},
            {'name': 'Bunnings Warehouse', 'domain': 'bunnings.com.au'}
        ]

        for retailer in retailers[:1]:  # Test just one for now
            print(f"🔍 Testing {retailer['name']}...")
            result = ai_extractor._google_search_retailer(
                test_product_data['variant_sku'],
                test_product_data['brand_name'],
                retailer
            )

            if result:
                print(f"✅ Found: {result['title']}")
                print(f"   Method: {result['found_by']}")
            else:
                print("❌ No results found")

        # Test full competitor analysis
        print("\n" + "=" * 70)
        print("🎯 FULL COMPETITOR ANALYSIS SYSTEM:")
        result = ai_extractor.generate_seo_product_title_with_competitor_analysis(
            test_product_data, 'sinks'
        )

        if result.get('competitor_analysis', {}).get('competitor_data'):
            print("\n✅ GOOGLE SEARCH RESULTS:")
            for comp in result['competitor_analysis']['competitor_data']:
                print(f"  • {comp.get('competitor', 'Unknown')}: \"{comp.get('title', '')}\"")
                print(f"    Method: {comp.get('found_by', 'unknown')} | Price: {comp.get('price', 'N/A')}")
        else:
            print("\n❌ No competitor results found")

    except Exception as e:
        print(f"❌ Error during testing: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_google_search_integration()
