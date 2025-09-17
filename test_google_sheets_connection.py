#!/usr/bin/env python3
"""
Test Google Sheets connection to debug modal data issue
"""

from dotenv import load_dotenv
load_dotenv()

import os
import json
from core.sheets_manager import SheetsManager
from config.collections import get_collection_config

def test_google_sheets_connection():
    """Test Google Sheets connection and data retrieval"""

    print("🔍 Testing Google Sheets Connection...")
    print("=" * 60)

    # Check environment variables
    print("📋 Environment Variables:")
    print(f"  SINKS_SPREADSHEET_ID: {os.environ.get('SINKS_SPREADSHEET_ID', 'NOT SET')}")
    print(f"  GOOGLE_CREDENTIALS_JSON: {'SET' if os.environ.get('GOOGLE_CREDENTIALS_JSON') else 'NOT SET'}")
    print()

    # Check collection config
    try:
        config = get_collection_config('sinks')
        print("📋 Sinks Collection Config:")
        print(f"  Name: {config.name}")
        print(f"  Spreadsheet ID: {config.spreadsheet_id}")
        print(f"  Worksheet: {config.worksheet_name}")
        print()
    except Exception as e:
        print(f"❌ Error getting collection config: {e}")
        return

    # Test sheets manager
    try:
        print("🔄 Initializing Sheets Manager...")
        sheets_manager = SheetsManager()

        if not sheets_manager.gc:
            print("❌ Google Sheets client not initialized!")
            return

        print("✅ Google Sheets client initialized successfully")

        # Test getting spreadsheet
        print("🔄 Testing spreadsheet access...")
        spreadsheet = sheets_manager.get_spreadsheet('sinks')

        if not spreadsheet:
            print("❌ Could not access sinks spreadsheet!")
            return

        print(f"✅ Successfully accessed spreadsheet: {spreadsheet.title}")

        # Test getting worksheet
        print("🔄 Testing worksheet access...")
        worksheet = sheets_manager.get_worksheet('sinks')

        if not worksheet:
            print("❌ Could not access Raw_Data worksheet!")
            return

        print(f"✅ Successfully accessed worksheet: {worksheet.title}")
        print(f"   Rows: {worksheet.row_count}")
        print(f"   Cols: {worksheet.col_count}")

        # Test getting worksheet data directly
        print("🔄 Testing raw worksheet data...")
        all_values = worksheet.get_all_values()
        print(f"📊 Raw worksheet has {len(all_values)} total rows")

        # Check first few data rows
        if len(all_values) > 1:
            headers = all_values[0]
            print(f"   Headers (first 10): {headers[:10]}")

            for i in range(1, min(6, len(all_values))):  # Check rows 2-6
                row_data = all_values[i]
                print(f"\n📋 Row {i+1} data (first 6 fields):")
                for j, header in enumerate(headers[:6]):
                    value = row_data[j] if j < len(row_data) else ''
                    print(f"   {header}: '{value}'")

        # Test getting all products with sheets manager
        print("\n🔄 Testing product data retrieval with SheetsManager...")
        products = sheets_manager.get_all_products('sinks', force_refresh=True)

        print(f"📊 SheetsManager retrieved {len(products)} products")

        if products:
            # Show first few products
            first_rows = list(products.keys())[:3]
            print(f"   Product rows: {first_rows}")

            # Show a sample product
            if first_rows:
                sample_row = first_rows[0]
                sample_product = products[sample_row]
                print(f"\n📋 Sample Product (Row {sample_row}):")
                print(f"   Title: {sample_product.get('title', 'N/A')}")
                print(f"   SKU: {sample_product.get('variant_sku', 'N/A')}")
                print(f"   Vendor: {sample_product.get('vendor', 'N/A')}")
                print(f"   URL: {sample_product.get('url', 'N/A')}")
                print(f"   Handle: {sample_product.get('handle', 'N/A')}")

                # Check for recently updated fields from Apps Script
                print(f"   Installation Type: {sample_product.get('installation_type', 'N/A')}")
                print(f"   Min Cabinet Size: {sample_product.get('min_cabinet_size_mm', 'N/A')}")
        else:
            print("❌ No products returned by SheetsManager - this is the issue!")

        print("\n✅ Google Sheets connection test completed successfully!")

    except Exception as e:
        print(f"❌ Error testing sheets manager: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_google_sheets_connection()