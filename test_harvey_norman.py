#!/usr/bin/env python3
"""
Test Harvey Norman website search for FRA400DT15
"""

import requests
from bs4 import BeautifulSoup
import time

def search_harvey_norman():
    """Search Harvey Norman for FRA400DT15"""

    sku = "FRA400DT15"
    search_url = f"https://www.harveynorman.com.au/search?q={sku}"

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
    }

    print(f"🔍 Searching Harvey Norman for: {sku}")
    print(f"URL: {search_url}")
    print("-" * 80)

    try:
        response = requests.get(search_url, headers=headers, timeout=15)
        print(f"Status Code: {response.status_code}")

        if response.status_code == 200:
            soup = BeautifulSoup(response.content, 'html.parser')

            # Look for product titles in various selectors
            title_selectors = [
                'h3.product-title',
                '.product-name',
                'h2.product-title',
                '.title',
                'h3',
                '[data-testid="product-title"]',
                '.product-item-name',
                '.search-result-title'
            ]

            print("🔍 Searching for product titles...")

            found_products = []

            for selector in title_selectors:
                elements = soup.select(selector)
                for element in elements:
                    title = element.get_text(strip=True)
                    if title and len(title) > 10:
                        # Check if it contains our SKU or Abey/sink terms
                        title_lower = title.lower()
                        if (sku.lower() in title_lower or
                            ('abey' in title_lower and ('sink' in title_lower or 'kitchen' in title_lower))):
                            found_products.append(title)
                            print(f"✅ FOUND: {title}")

            if not found_products:
                print("❌ No matching products found in title selectors")

                # Check if the page has any content about the product
                page_text = soup.get_text().lower()
                if sku.lower() in page_text:
                    print("✅ Page contains the SKU - product might be there")

                    # Look for any text around the SKU
                    lines = page_text.split('\n')
                    for line in lines:
                        if sku.lower() in line and len(line.strip()) > 10:
                            print(f"📋 Line containing SKU: {line.strip()[:100]}...")

                if 'abey' in page_text:
                    print("✅ Page contains 'Abey'")

                if 'alfresco' in page_text:
                    print("✅ Page contains 'Alfresco'!")

                # Check for "no results" messages
                no_results_indicators = ['no results', 'no products found', 'sorry', 'not found']
                for indicator in no_results_indicators:
                    if indicator in page_text:
                        print(f"⚠️ Found '{indicator}' - likely no results")
                        break

            # Also check for links to product pages
            product_links = soup.find_all('a', href=True)
            product_urls = []

            for link in product_links:
                href = link.get('href', '')
                if any(term in href.lower() for term in ['product', 'item', '/p/']):
                    link_text = link.get_text(strip=True)
                    if link_text and (sku.lower() in link_text.lower() or
                                    ('abey' in link_text.lower() and 'sink' in link_text.lower())):
                        product_urls.append((href, link_text))

            if product_urls:
                print(f"\n🔗 Found {len(product_urls)} potential product links:")
                for url, text in product_urls[:3]:
                    print(f"  - {text[:60]}... | {url[:80]}...")

        else:
            print(f"❌ HTTP Error: {response.status_code}")

    except Exception as e:
        print(f"❌ Error: {str(e)}")

if __name__ == "__main__":
    search_harvey_norman()