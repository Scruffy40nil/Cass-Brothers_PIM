#!/usr/bin/env python3
"""
Simple test for column BF (FAQs) data retrieval
"""
import os
import sys
import json
import gspread
from google.oauth2.service_account import Credentials

def test_column_bf():
    print("🔄 Testing column BF (FAQs) data retrieval...")

    # Get credentials
    creds_json = os.environ.get('GOOGLE_CREDENTIALS_JSON')
    spreadsheet_id = os.environ.get('SINKS_SPREADSHEET_ID')

    if not creds_json:
        print("❌ GOOGLE_CREDENTIALS_JSON not found in environment")
        return False

    if not spreadsheet_id:
        print("❌ SINKS_SPREADSHEET_ID not found in environment")
        return False

    try:
        # Setup credentials
        if creds_json.startswith('{'):
            creds_dict = json.loads(creds_json)
        else:
            with open(creds_json, 'r') as f:
                creds_dict = json.load(f)

        creds = Credentials.from_service_account_info(
            creds_dict,
            scopes=['https://www.googleapis.com/auth/spreadsheets']
        )
        gc = gspread.authorize(creds)

        print("✅ Google Sheets authentication successful")

        # Open spreadsheet
        spreadsheet = gc.open_by_key(spreadsheet_id)
        worksheet = spreadsheet.worksheet('Raw_Data')

        print(f"✅ Connected to spreadsheet: {spreadsheet.title}")
        print(f"✅ Worksheet: {worksheet.title}")
        print(f"✅ Rows: {worksheet.row_count}, Cols: {worksheet.col_count}")

        # Column BF is column 58 (1-indexed)
        print("\n🔍 Checking column BF (column 58) for FAQ data...")

        # Get column BF values (FAQs)
        col_bf_values = worksheet.col_values(58)  # Column BF

        print(f"✅ Retrieved {len(col_bf_values)} values from column BF")

        # Check first few rows
        for i, value in enumerate(col_bf_values[:10], 1):
            if value and value.strip():
                print(f"   Row {i}: {value[:100]}{'...' if len(value) > 100 else ''}")
            else:
                print(f"   Row {i}: (empty)")

        # Count non-empty values
        non_empty = sum(1 for v in col_bf_values if v and v.strip())
        print(f"\n📊 Summary:")
        print(f"   Total rows with data in column BF: {non_empty}")
        print(f"   Empty rows in column BF: {len(col_bf_values) - non_empty}")

        # Test specific row retrieval
        if len(col_bf_values) > 2:  # Skip header
            test_row = 3  # Row 3 as example
            try:
                cell_value = worksheet.cell(test_row, 58).value
                print(f"\n🎯 Test cell BF{test_row}: {cell_value[:100] if cell_value else '(empty)'}{'...' if cell_value and len(cell_value) > 100 else ''}")
            except Exception as e:
                print(f"\n❌ Error reading cell BF{test_row}: {e}")

        return True

    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    success = test_column_bf()
    if success:
        print("\n✅ Column BF test completed!")
    else:
        print("\n❌ Column BF test failed!")
        sys.exit(1)