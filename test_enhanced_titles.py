#!/usr/bin/env python3
"""
Test the enhanced SEO title generation with competitor analysis
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

def test_enhanced_title_generation():
    """Test the enhanced title generation with SEO optimization"""

    ai_extractor = AIExtractor()

    # Test data - Abey FRA400DT15
    test_product_data = {
        'variant_sku': 'FRA400DT15',
        'sku': 'FRA400DT15',
        'brand_name': 'Abey',
        'product_material': '316 Stainless Steel',
        'installation_type': 'Topmount & Undermount',
        'bowls_number': '2'
    }

    print("🚀 Testing Enhanced SEO Title Generation")
    print("=" * 70)
    print(f"Product: {test_product_data['brand_name']} {test_product_data['variant_sku']}")
    print(f"Material: {test_product_data['product_material']}")
    print(f"Bowls: {test_product_data['bowls_number']}")
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

        # Show fallback titles (enhanced with SEO optimization)
        if result.get('fallback_titles'):
            print("\n🎯 ENHANCED FALLBACK TITLES (Brand-First SEO):")
            for i, title in enumerate(result['fallback_titles'], 1):
                print(f"  {i}. {title}")

        # Show competitor analysis
        if result.get('competitor_analysis', {}).get('competitor_data'):
            print("\n🔍 COMPETITOR ANALYSIS:")
            for comp in result['competitor_analysis']['competitor_data']:
                print(f"  • {comp.get('competitor', 'Unknown')}: \"{comp.get('title', '')}\"")
                print(f"    Price: {comp.get('price', 'N/A')} | Method: {comp.get('found_by', 'unknown')}")

        # Analyze title quality
        print("\n📈 SEO QUALITY ANALYSIS:")
        fallback_titles = result.get('fallback_titles', [])

        for title in fallback_titles[:3]:  # Analyze first 3 titles
            analysis = analyze_title_seo(title, test_product_data)
            print(f"\n📋 Title: \"{title}\"")
            for criterion, status in analysis.items():
                emoji = "✅" if status else "❌"
                print(f"  {emoji} {criterion}")

    except Exception as e:
        print(f"❌ Error during testing: {str(e)}")
        import traceback
        traceback.print_exc()

def analyze_title_seo(title: str, product_data: dict) -> dict:
    """Analyze title for SEO best practices"""
    analysis = {}

    title_lower = title.lower()
    brand = product_data.get('brand_name', '').lower()

    # Check if brand is first
    analysis['Brand Name First'] = title_lower.startswith(brand)

    # Check for key features
    analysis['Contains Product Series'] = any(series in title_lower for series in ['alfresco', '5000 series', 'series'])
    analysis['Contains Material'] = any(material in title_lower for material in ['stainless steel', '316', 'granite'])
    analysis['Contains Bowl Info'] = any(bowl in title_lower for bowl in ['double bowl', 'single bowl', 'bowl'])
    analysis['Contains Product Type'] = 'sink' in title_lower
    analysis['Contains SKU/Model'] = any(sku in title for sku in ['FRA400DT15', 'fra400dt15'])

    # Check length (45-60 chars is optimal)
    analysis['Optimal Length (45-60 chars)'] = 45 <= len(title) <= 60

    # Check for additional features
    analysis['Contains Unique Features'] = any(feature in title_lower for feature in ['drain tray', 'mixer', 'installation kit'])

    return analysis

if __name__ == "__main__":
    test_enhanced_title_generation()