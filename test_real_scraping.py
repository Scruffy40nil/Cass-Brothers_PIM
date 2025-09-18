#!/usr/bin/env python3
"""
Test direct website scraping for FRA400DT15
"""

import requests
from bs4 import BeautifulSoup
import time

def test_direct_search():
    """Test searching specific Australian sites for FRA400DT15"""

    search_urls = [
        "https://www.bunnings.com.au/search/products?q=FRA400DT15",
        "https://www.harveynorman.com.au/search?q=FRA400DT15",
        "https://www.appliancesonline.com.au/search?q=FRA400DT15",
        "https://www.thebluespace.com.au/search?q=FRA400DT15",
        "https://www.ebay.com.au/sch/i.html?_nkw=FRA400DT15",
        "https://www.google.com.au/search?tbm=shop&q=Abey+FRA400DT15"
    ]

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
    }

    for url in search_urls:
        try:
            print(f"\n🔍 Testing: {url}")
            response = requests.get(url, headers=headers, timeout=10)
            print(f"Status: {response.status_code}")

            if response.status_code == 200:
                soup = BeautifulSoup(response.content, 'html.parser')

                # Look for any text containing "alfresco" or the SKU
                text_content = soup.get_text().lower()
                if 'alfresco' in text_content or 'fra400dt15' in text_content:
                    print("✅ Found relevant content!")

                    # Extract potential product titles
                    title_selectors = ['h1', 'h2', 'h3', '.title', '.product-title', '.product-name']
                    for selector in title_selectors:
                        elements = soup.select(selector)
                        for element in elements[:5]:
                            title = element.get_text(strip=True)
                            if (title and len(title) > 10 and
                                ('alfresco' in title.lower() or 'fra400dt15' in title.lower() or
                                 ('abey' in title.lower() and 'sink' in title.lower()))):
                                print(f"  📋 Title: {title}")
                else:
                    print("❌ No relevant content found")
            else:
                print(f"❌ HTTP Error: {response.status_code}")

        except Exception as e:
            print(f"❌ Error: {str(e)}")

        time.sleep(2)  # Rate limiting

if __name__ == "__main__":
    test_direct_search()