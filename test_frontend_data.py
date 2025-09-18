#!/usr/bin/env python3
"""
Test the frontend API endpoint to see what data is being returned
"""

from dotenv import load_dotenv
load_dotenv()

import requests
import json

def test_frontend_api():
    """Test the API endpoint that the frontend calls"""

    print("🔍 Testing Frontend API Endpoint...")
    print("=" * 60)

    # Test the exact API call the frontend makes
    try:
        url = "http://localhost:5000/api/sinks/products/all"
        print(f"🔄 Making request to: {url}")

        response = requests.get(url, timeout=30)

        print(f"📊 Response Status: {response.status_code}")
        print(f"📊 Response Headers: {response.headers.get('content-type')}")

        if response.status_code == 200:
            data = response.json()

            print(f"✅ API Response Structure:")
            print(f"  success: {data.get('success')}")
            print(f"  total_count: {data.get('total_count')}")
            print(f"  collection: {data.get('collection')}")
            print(f"  pricing_support: {data.get('pricing_support')}")

            products = data.get('products', {})
            print(f"  products count: {len(products)}")

            if products:
                print(f"\n📋 Product Row Numbers: {list(products.keys())}")

                # Check first product
                first_row = list(products.keys())[0]
                first_product = products[first_row]

                print(f"\n📋 First Product (Row {first_row}):")
                print(f"  title: {first_product.get('title', 'N/A')}")
                print(f"  variant_sku: {first_product.get('variant_sku', 'N/A')}")
                print(f"  installation_type: {first_product.get('installation_type', 'N/A')}")
                print(f"  product_material: {first_product.get('product_material', 'N/A')}")
                print(f"  has_overflow: {first_product.get('has_overflow', 'N/A')}")
                print(f"  cutout_size_mm: {first_product.get('cutout_size_mm', 'N/A')}")

                # Check if all required fields are present
                required_fields = ['title', 'variant_sku', 'installation_type', 'product_material', 'has_overflow', 'cutout_size_mm']
                missing_fields = []

                for field in required_fields:
                    if not first_product.get(field):
                        missing_fields.append(field)

                if missing_fields:
                    print(f"⚠️ Missing/empty fields: {missing_fields}")
                else:
                    print("✅ All key fields have data")

            else:
                print("❌ No products in response")

        else:
            print(f"❌ API Error: {response.status_code}")
            print(f"Response: {response.text}")

    except requests.exceptions.ConnectionError:
        print("❌ Connection Error: Is the Flask server running on localhost:5000?")
        print("💡 Try running: python flask_app.py")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_frontend_api()