#!/usr/bin/env python3
"""
Test Google search for ABEY FRA400DT15 to see what competitors call it
"""

import requests
from bs4 import BeautifulSoup
from urllib.parse import quote_plus

def test_google_search():
    """Test Google search directly"""

    search_query = "Abey FRA400DT15"
    encoded_query = quote_plus(search_query)
    google_url = f'https://www.google.com.au/search?q={encoded_query}&hl=en&gl=au'

    print(f"🔍 Searching Google: {search_query}")
    print(f"URL: {google_url}")
    print("-" * 80)

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.5',
    }

    try:
        response = requests.get(google_url, headers=headers, timeout=15)
        print(f"Status Code: {response.status_code}")

        if response.status_code == 200:
            soup = BeautifulSoup(response.content, 'html.parser')

            # Look for search result titles
            title_selectors = ['h3', '.LC20lb', '.DKV0Md']

            print("\n📋 All h3 elements found:")
            h3_elements = soup.find_all('h3')
            for i, h3 in enumerate(h3_elements[:10]):
                title = h3.get_text(strip=True)
                if title:
                    print(f"  {i+1}. {title}")

            print(f"\n🔍 Total h3 elements: {len(h3_elements)}")

            # Check if page has any content about the product
            page_text = soup.get_text().lower()
            if 'abey' in page_text:
                print("✅ Page contains 'Abey'")
            if 'fra400dt15' in page_text:
                print("✅ Page contains 'FRA400DT15'")
            if 'sink' in page_text:
                print("✅ Page contains 'sink'")

            # Look for links to Australian retailers
            links = soup.find_all('a', href=True)
            print(f"\n🔗 Found {len(links)} links")

            au_retailers = []
            for link in links[:20]:
                href = link.get('href', '')
                if any(domain in href for domain in ['bunnings.com.au', 'harveynorman.com.au', 'ebay.com.au']):
                    au_retailers.append(href)

            if au_retailers:
                print("✅ Found Australian retailer links:")
                for retailer in au_retailers[:5]:
                    print(f"  - {retailer}")
            else:
                print("❌ No Australian retailer links found")

        else:
            print(f"❌ HTTP Error: {response.status_code}")
            print(f"Response headers: {dict(response.headers)}")

    except Exception as e:
        print(f"❌ Error: {str(e)}")

if __name__ == "__main__":
    test_google_search()