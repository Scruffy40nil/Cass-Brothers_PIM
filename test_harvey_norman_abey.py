#!/usr/bin/env python3
"""
Test Harvey Norman website search for Abey products
"""

import requests
from bs4 import BeautifulSoup

def search_harvey_norman_abey():
    """Search Harvey Norman for Abey brand"""

    search_terms = ["Abey", "Abey sink", "Abey kitchen sink"]

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
    }

    for search_term in search_terms:
        search_url = f"https://www.harveynorman.com.au/search?q={search_term.replace(' ', '+')}"

        print(f"\n🔍 Searching Harvey Norman for: '{search_term}'")
        print(f"URL: {search_url}")
        print("-" * 60)

        try:
            response = requests.get(search_url, headers=headers, timeout=15)
            print(f"Status Code: {response.status_code}")

            if response.status_code == 200:
                soup = BeautifulSoup(response.content, 'html.parser')

                # Look for product titles
                title_selectors = [
                    'h3.product-title',
                    '.product-name',
                    'h2.product-title',
                    '.title',
                    'h3',
                    '[data-testid="product-title"]',
                    '.product-item-name'
                ]

                found_abey_products = []

                for selector in title_selectors:
                    elements = soup.select(selector)
                    for element in elements[:10]:  # Check first 10 results
                        title = element.get_text(strip=True)
                        if title and 'abey' in title.lower():
                            found_abey_products.append(title)

                if found_abey_products:
                    print(f"✅ Found {len(found_abey_products)} Abey products:")
                    for product in found_abey_products[:5]:
                        print(f"  - {product}")
                else:
                    print("❌ No Abey products found")

                    # Check if page contains Abey at all
                    page_text = soup.get_text().lower()
                    if 'abey' in page_text:
                        print("✅ Page mentions 'Abey' somewhere")
                    else:
                        print("❌ No mention of 'Abey' on page")

        except Exception as e:
            print(f"❌ Error: {str(e)}")

    # Also try the kitchen section directly
    kitchen_url = "https://www.harveynorman.com.au/kitchen-laundry/kitchen-sinks/"
    print(f"\n🔍 Checking Harvey Norman kitchen sinks section...")
    print(f"URL: {kitchen_url}")

    try:
        response = requests.get(kitchen_url, headers=headers, timeout=15)
        if response.status_code == 200:
            soup = BeautifulSoup(response.content, 'html.parser')
            page_text = soup.get_text().lower()

            if 'abey' in page_text:
                print("✅ Found 'Abey' in kitchen sinks section")

                # Look for product titles in this section
                titles = soup.select('h3, .product-title, .product-name')
                abey_sinks = []
                for title in titles:
                    text = title.get_text(strip=True)
                    if 'abey' in text.lower():
                        abey_sinks.append(text)

                if abey_sinks:
                    print(f"✅ Found Abey sinks in kitchen section:")
                    for sink in abey_sinks[:3]:
                        print(f"  - {sink}")
            else:
                print("❌ No 'Abey' found in kitchen sinks section")
        else:
            print(f"❌ Failed to load kitchen section: {response.status_code}")

    except Exception as e:
        print(f"❌ Error checking kitchen section: {str(e)}")

if __name__ == "__main__":
    search_harvey_norman_abey()