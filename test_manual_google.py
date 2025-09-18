#!/usr/bin/env python3
"""
Test manual Google site search to verify the approach
"""

import webbrowser
from urllib.parse import quote_plus

def create_search_urls():
    """Create the exact Google search URLs for manual testing"""

    brand = "Abey"
    sku = "FRA400DT15"
    base_query = f"{brand} {sku}"

    retailers = [
        'bunnings.com.au',
        'harveynorman.com.au',
        'appliancesonline.com.au',
        'ebay.com.au',
        'thebluespace.com.au'
    ]

    print("🔍 Google Site Search URLs (manually test these):")
    print("=" * 60)

    for retailer in retailers:
        site_query = f"{base_query} site:{retailer}"
        encoded_query = quote_plus(site_query)
        google_url = f"https://www.google.com.au/search?q={encoded_query}&hl=en&gl=au"

        print(f"\n{retailer}:")
        print(f"Query: {site_query}")
        print(f"URL: {google_url}")
        print("-" * 40)

    print("\n💡 Manual Testing Instructions:")
    print("1. Copy each URL above and paste into your browser")
    print("2. See what actual product titles each retailer shows")
    print("3. These are the real competitor titles we want to capture")

    # Also test the general search
    general_query = quote_plus(base_query)
    general_url = f"https://www.google.com.au/search?q={general_query}&hl=en&gl=au"

    print(f"\n🌍 General Google Search:")
    print(f"Query: {base_query}")
    print(f"URL: {general_url}")

if __name__ == "__main__":
    create_search_urls()