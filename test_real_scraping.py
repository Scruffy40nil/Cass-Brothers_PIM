#!/usr/bin/env python3
"""
Test real web scraping for competitor titles
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

def test_real_web_scraping():
    """Test real web scraping vs ChatGPT fake data"""

    ai_extractor = AIExtractor()

    # Test data - Phoenix sink
    test_product_data = {
        'variant_sku': '312-5202-80',
        'sku': '312-5202-80',
        'brand_name': 'Phoenix',
        'product_material': 'Granite Composite',
        'installation_type': 'Undermount/Topmount',
        'bowls_number': '2'
    }

    print("🔍 Testing REAL Web Scraping vs ChatGPT Fake Data")
    print("=" * 70)
    print(f"Product: {test_product_data['brand_name']} {test_product_data['variant_sku']}")
    print(f"Material: {test_product_data['product_material']}")
    print(f"Bowls: {test_product_data['bowls_number']}")
    print("-" * 70)

    # Test the real web scraping directly
    try:
        print("🌐 TESTING REAL WEB SCRAPING:")
        print()

        # Test individual scrapers
        sku = test_product_data['variant_sku']
        brand = test_product_data['brand_name']
        search_query = f"{brand} {sku}"

        # Test Harvey Norman
        print("1. Harvey Norman...")
        harvey_result = ai_extractor._scrape_harvey_norman(sku, brand, search_query)
        if harvey_result:
            print(f"   ✅ Found: {harvey_result['title']}")
        else:
            print("   ❌ No results")

        # Test Bunnings
        print("2. Bunnings...")
        bunnings_result = ai_extractor._scrape_bunnings(sku, brand, search_query)
        if bunnings_result:
            print(f"   ✅ Found: {bunnings_result['title']}")
        else:
            print("   ❌ No results")

        # Test Reece
        print("3. Reece...")
        reece_result = ai_extractor._scrape_reece(sku, brand, search_query)
        if reece_result:
            print(f"   ✅ Found: {reece_result['title']}")
        else:
            print("   ❌ No results")

        print("\n" + "=" * 70)
        print("📊 SUMMARY:")
        results_found = sum([
            1 for result in [harvey_result, bunnings_result, reece_result] 
            if result is not None
        ])
        print(f"Real competitor titles found: {results_found}/3")

    except Exception as e:
        print(f"❌ Error during testing: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_real_web_scraping()
