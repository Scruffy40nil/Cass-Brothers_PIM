#!/usr/bin/env python3
"""
Test the Flask API to see if FAQ data is returned correctly
"""
import requests
import json
import sys

def test_api_faq_data():
    print("🔄 Testing Flask API for FAQ data...")

    # Test the API endpoint that the frontend uses
    api_url = "http://localhost:5000/api/sinks/products/all"

    try:
        print(f"📡 Making request to: {api_url}")
        response = requests.get(api_url, timeout=10)

        if response.status_code == 200:
            data = response.json()
            print("✅ API response received successfully")

            if data.get('success') and 'products' in data:
                products = data['products']
                print(f"✅ Found {len(products)} products in API response")

                # Check for FAQ data
                faq_count = 0
                for row_num, product in products.items():
                    if 'faqs' in product and product['faqs'] and product['faqs'].strip():
                        faq_count += 1
                        if faq_count == 1:  # Show first example
                            print(f"✅ Example FAQ data from product {row_num}:")
                            print(f"   FAQs: {product['faqs'][:200]}{'...' if len(product['faqs']) > 200 else ''}")

                print(f"📊 Products with FAQ data: {faq_count}")

                if faq_count == 0:
                    print("❌ No FAQ data found in API response!")
                    print("🔍 Checking what fields are available...")
                    if products:
                        first_product = next(iter(products.values()))
                        print("Available fields:", list(first_product.keys()))

                return faq_count > 0
            else:
                print("❌ API response format incorrect")
                print("Response:", json.dumps(data, indent=2)[:500])
                return False
        else:
            print(f"❌ API request failed with status {response.status_code}")
            print("Response:", response.text[:500])
            return False

    except requests.exceptions.ConnectionError:
        print("❌ Connection error - Flask app is probably not running")
        print("💡 Start the Flask app with: python flask_app.py")
        return False
    except Exception as e:
        print(f"❌ Error testing API: {e}")
        return False

if __name__ == "__main__":
    success = test_api_faq_data()
    if success:
        print("\n✅ API FAQ data test completed successfully!")
    else:
        print("\n❌ API FAQ data test failed!")
        sys.exit(1)