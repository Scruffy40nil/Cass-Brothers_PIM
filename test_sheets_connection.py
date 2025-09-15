#!/usr/bin/env python3
"""
Test script to verify Google Sheets API connection
Run this after setting up your service account credentials
"""

import sys
import os
sys.path.append('/workspaces/Cass-Brothers_PIM')

from core.sheets_manager import SheetsManager
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_google_sheets_connection():
    print("🔄 Testing Google Sheets API connection...")
    print()

    # Check if credentials are configured
    if not os.environ.get('GOOGLE_CREDENTIALS_JSON'):
        print("❌ GOOGLE_CREDENTIALS_JSON environment variable not set")
        print("📖 Please follow the setup guide in GOOGLE_SHEETS_SETUP.md")
        print("💡 Example: export GOOGLE_CREDENTIALS_JSON='path/to/credentials.json'")
        return False

    # Check if spreadsheet ID is configured
    if not os.environ.get('SINKS_SPREADSHEET_ID'):
        print("❌ SINKS_SPREADSHEET_ID environment variable not set")
        print("💡 Example: export SINKS_SPREADSHEET_ID='1-y7zKw6ro93nsB04zbeEEEO800q2cysTnXyADnVLfw4'")
        return False

    print(f"✅ GOOGLE_CREDENTIALS_JSON: {os.environ.get('GOOGLE_CREDENTIALS_JSON')[:50]}...")
    print(f"✅ SINKS_SPREADSHEET_ID: {os.environ.get('SINKS_SPREADSHEET_ID')}")
    print()

    # Create sheets manager
    try:
        manager = SheetsManager()
        print(f"✅ SheetsManager created successfully")
        print(f"✅ Authentication status: {'Connected' if manager.gc else 'Failed'}")
        print()

        if not manager.gc:
            print("❌ Google Sheets authentication failed")
            print("📖 Please check your credentials in GOOGLE_SHEETS_SETUP.md")
            return False

    except Exception as e:
        print(f"❌ Failed to create SheetsManager: {e}")
        return False

    # Test spreadsheet access
    try:
        print("🔄 Testing spreadsheet access...")
        spreadsheet = manager.get_spreadsheet('sinks')

        if not spreadsheet:
            print("❌ Failed to access sinks spreadsheet")
            print("🔍 Common issues:")
            print("   - Service account email not shared with the spreadsheet")
            print("   - Incorrect spreadsheet ID")
            print("   - Network connectivity issues")
            return False

        print(f"✅ Successfully accessed spreadsheet: {spreadsheet.title}")
        print(f"✅ Spreadsheet URL: {spreadsheet.url}")
        print()

    except Exception as e:
        print(f"❌ Spreadsheet access failed: {e}")
        return False

    # Test worksheet access
    try:
        print("🔄 Testing worksheet access...")
        worksheet = manager.get_worksheet('sinks')

        if not worksheet:
            print("❌ Failed to access sinks worksheet")
            return False

        print(f"✅ Successfully accessed worksheet: {worksheet.title}")
        print(f"✅ Worksheet rows: {worksheet.row_count}")
        print(f"✅ Worksheet cols: {worksheet.col_count}")
        print()

    except Exception as e:
        print(f"❌ Worksheet access failed: {e}")
        return False

    # Test data retrieval
    try:
        print("🔄 Testing data retrieval...")
        products = manager.get_all_products('sinks')

        print(f"✅ Successfully retrieved {len(products)} products")

        if products:
            # Show first product
            first_row = min(products.keys())
            first_product = products[first_row]
            print(f"✅ Sample product (row {first_row}):")
            for key, value in list(first_product.items())[:5]:  # Show first 5 fields
                print(f"   {key}: {str(value)[:50]}{'...' if len(str(value)) > 50 else ''}")
        print()

    except Exception as e:
        print(f"❌ Data retrieval failed: {e}")
        return False

    print("🎉 Google Sheets API connection test PASSED!")
    print("✅ Your system is ready to use direct Google Sheets API")
    return True

if __name__ == "__main__":
    success = test_google_sheets_connection()

    if not success:
        print()
        print("❌ Test FAILED - Please follow these steps:")
        print("1. Read GOOGLE_SHEETS_SETUP.md for detailed instructions")
        print("2. Create Google service account and download credentials")
        print("3. Share your spreadsheet with the service account email")
        print("4. Set environment variables:")
        print("   export GOOGLE_CREDENTIALS_JSON='path/to/credentials.json'")
        print("   export SINKS_SPREADSHEET_ID='1-y7zKw6ro93nsB04zbeEEEO800q2cysTnXyADnVLfw4'")
        sys.exit(1)
    else:
        print("✅ Ready to use Google Sheets API!")
        sys.exit(0)