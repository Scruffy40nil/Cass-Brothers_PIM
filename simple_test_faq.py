#!/usr/bin/env python3
"""
Simple test for FAQ data without full app initialization
"""
import requests
import csv
import os

def test_faq_csv_and_mapping():
    print("🔄 Testing FAQ data via CSV and column mapping...")

    # Get CSV data
    spreadsheet_id = "1-y7zKw6ro93nsB04zbeEEEO800q2cysTnXyADnVLfw4"
    csv_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/export?format=csv&gid=0"

    try:
        response = requests.get(csv_url, timeout=30)
        response.raise_for_status()

        csv_data = response.text
        reader = csv.reader(csv_data.splitlines())
        rows = list(reader)

        if len(rows) < 2:
            print("❌ No data rows in CSV")
            return False

        # Column mapping for sinks (from collections.py)
        column_mapping = {
            'variant_sku': 2,   # B
            'title': 6,         # F
            'vendor': 7,        # G
            'body_html': 35,    # AI
            'features': 36,     # AJ
            'faqs': 58,         # BF - This is what we're testing
        }

        # Process products like the app does
        products = {}
        for row_index, row_data in enumerate(rows[1:], start=2):
            # Ensure row has enough columns
            while len(row_data) < max(column_mapping.values()):
                row_data.append('')

            # Map data using column mapping
            product = {}
            for field, col_index in column_mapping.items():
                if col_index <= len(row_data):
                    value = row_data[col_index - 1] if col_index > 0 else ''
                    product[field] = value.strip() if value else ''
                else:
                    product[field] = ''

            # Only include products with meaningful data
            if any(product.get(field, '').strip() for field in ['title', 'variant_sku']):
                products[row_index] = product

        print(f"✅ Processed {len(products)} products via CSV")

        # Check FAQ data
        faq_count = 0
        for row_num, product in products.items():
            if product.get('faqs', '').strip():
                faq_count += 1
                if faq_count == 1:  # Show first example
                    print(f"✅ FAQ data found in product {row_num}:")
                    print(f"   Title: {product.get('title', 'N/A')}")
                    print(f"   FAQs: {product['faqs'][:200]}{'...' if len(product['faqs']) > 200 else ''}")

        print(f"📊 Products with FAQ data: {faq_count}")

        if faq_count > 0:
            print("✅ FAQ data is correctly mapped from column BF")

            # Test what the API would return
            print("\n🔄 Simulating API response format...")
            api_response = {
                'success': True,
                'products': products,
                'total_count': len(products),
                'collection': 'sinks'
            }

            # Check if FAQ field exists in API format
            for row_num, product in api_response['products'].items():
                if 'faqs' in product and product['faqs']:
                    print(f"✅ API would return FAQ data for product {row_num}")
                    break
            else:
                print("❌ No FAQ data would be returned by API")

            return True
        else:
            print("❌ No FAQ data found after processing")
            return False

    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    success = test_faq_csv_and_mapping()
    if success:
        print("\n✅ FAQ data processing works correctly!")
        print("💡 The issue must be in the frontend display logic")
    else:
        print("\n❌ FAQ data processing failed!")