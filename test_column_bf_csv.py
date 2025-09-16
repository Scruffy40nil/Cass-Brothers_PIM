#!/usr/bin/env python3
"""
Test column BF (FAQs) data using CSV export method
"""
import requests
import csv

def test_column_bf_csv():
    print("🔄 Testing column BF (FAQs) data via CSV export...")

    # Use the spreadsheet ID from .env
    spreadsheet_id = "1-y7zKw6ro93nsB04zbeEEEO800q2cysTnXyADnVLfw4"

    try:
        # Construct CSV export URL
        csv_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/export?format=csv&gid=0"
        print(f"📡 Fetching CSV from: {csv_url}")

        # Fetch CSV data
        response = requests.get(csv_url, timeout=30)
        response.raise_for_status()

        print("✅ Successfully fetched CSV data")

        # Parse CSV
        csv_data = response.text
        reader = csv.reader(csv_data.splitlines())
        rows = list(reader)

        print(f"✅ Parsed CSV with {len(rows)} rows")

        if len(rows) < 2:
            print("❌ No data rows found")
            return False

        headers = rows[0]
        print(f"✅ Headers: {len(headers)} columns")

        # Column BF is the 58th column (0-indexed = 57)
        bf_column_index = 57

        if len(headers) <= bf_column_index:
            print(f"❌ Column BF (index {bf_column_index}) not found. Only {len(headers)} columns available.")
            print(f"   Last few columns: {headers[-5:] if len(headers) >= 5 else headers}")
            return False

        print(f"✅ Column BF header: '{headers[bf_column_index]}'")

        # Check column BF data
        print(f"\n🔍 Checking column BF data in first 10 rows...")

        bf_data_count = 0
        for i, row in enumerate(rows[1:11], 2):  # Skip header, show rows 2-11
            if len(row) > bf_column_index:
                bf_value = row[bf_column_index].strip()
                if bf_value:
                    print(f"   Row {i}: {bf_value[:100]}{'...' if len(bf_value) > 100 else ''}")
                    bf_data_count += 1
                else:
                    print(f"   Row {i}: (empty)")
            else:
                print(f"   Row {i}: (row too short - only {len(row)} columns)")

        # Count all non-empty BF values
        total_bf_data = 0
        for row in rows[1:]:  # Skip header
            if len(row) > bf_column_index and row[bf_column_index].strip():
                total_bf_data += 1

        print(f"\n📊 Summary:")
        print(f"   Total rows: {len(rows) - 1}")  # Exclude header
        print(f"   Rows with BF data: {total_bf_data}")
        print(f"   Empty BF rows: {len(rows) - 1 - total_bf_data}")
        print(f"   BF data percentage: {(total_bf_data / (len(rows) - 1) * 100):.1f}%")

        return True

    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    success = test_column_bf_csv()
    if success:
        print("\n✅ Column BF CSV test completed!")
    else:
        print("\n❌ Column BF CSV test failed!")