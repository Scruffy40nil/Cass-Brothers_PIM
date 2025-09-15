#!/usr/bin/env python3
"""
Quick test script to verify CSV fallback functionality
"""

import sys
sys.path.append('/workspaces/Cass-Brothers_PIM')

from core.sheets_manager import SheetsManager
import os

# Set up environment
os.environ['SINKS_SPREADSHEET_ID'] = '1-y7zKw6ro93nsB04zbeEEEO800q2cysTnXyADnVLfw4'

def test_csv_fallback():
    print("🔄 Testing CSV fallback functionality...")

    # Create sheets manager
    manager = SheetsManager()

    # Test CSV fallback directly
    products = manager.get_all_products_csv_fallback('sinks')

    print(f"📊 Found {len(products)} products")

    if products:
        # Show first product details
        first_key = next(iter(products))
        first_product = products[first_key]

        print(f"🔍 First product (row {first_key}):")
        for key, value in list(first_product.items())[:10]:  # Show first 10 fields
            print(f"  {key}: {value}")

    return len(products) > 0

if __name__ == "__main__":
    success = test_csv_fallback()
    print(f"✅ Test {'PASSED' if success else 'FAILED'}")