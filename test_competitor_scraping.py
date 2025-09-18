#!/usr/bin/env python3
"""
Test script for new competitor title scraping functionality
"""

import sys
import os
sys.path.append('/workspaces/Cass-Brothers_PIM')

from core.ai_extractor import AIExtractor
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_competitor_scraping():
    """Test the new competitor title scraping with real product data"""

    # Initialize AI extractor
    ai_extractor = AIExtractor()

    # Test data - Abey FRA400DT15 (the product from your example)
    test_product_data = {
        'variant_sku': 'FRA400DT15',
        'sku': 'FRA400DT15',
        'brand_name': 'Abey',
        'product_material': 'Stainless Steel',
        'installation_type': 'Topmount & Undermount',
        'bowls_number': '2'
    }

    print("🧪 Testing competitor title scraping...")
    print(f"Product: {test_product_data['brand_name']} {test_product_data['variant_sku']}")
    print(f"Material: {test_product_data['product_material']}")
    print(f"Bowls: {test_product_data['bowls_number']}")
    print("-" * 60)

    # Test the new scraping functionality
    try:
        search_query = ai_extractor._build_competitor_search_query(test_product_data, 'sinks')
        print(f"🔍 Search Query: {search_query}")
        print()

        competitor_results = ai_extractor._search_competitor_titles(search_query, test_product_data)

        print(f"📊 Results: {len(competitor_results)} competitor titles found")
        print()

        for i, result in enumerate(competitor_results, 1):
            print(f"{i}. {result['competitor']}")
            print(f"   Title: {result['title']}")
            print(f"   Price: {result['price']}")
            print(f"   Method: {result['found_by']}")
            print()

        # Check for diversity
        titles = [r['title'] for r in competitor_results]
        unique_titles = set(titles)

        print(f"📈 Analysis:")
        print(f"   Total titles: {len(titles)}")
        print(f"   Unique titles: {len(unique_titles)}")
        print(f"   Diversity: {len(unique_titles)/len(titles)*100:.1f}%")

        if len(unique_titles) == len(titles):
            print("✅ SUCCESS: All titles are unique!")
        else:
            print("⚠️  WARNING: Some titles are duplicated")

    except Exception as e:
        print(f"❌ Error during testing: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_competitor_scraping()