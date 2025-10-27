#!/usr/bin/env python3
"""
Check what tabs are in the supplier sheet and compare to what's in the database
"""

import os
import json
import sqlite3
from dotenv import load_dotenv
import gspread
from google.oauth2.service_account import Credentials

load_dotenv()

SPREADSHEET_ID = "1gt_DvS2E4WJNaylXYvwWfRwHzoDcRYxjmDpLevHffYQ"

def get_google_sheets_client():
    """Get authenticated Google Sheets client"""
    creds_json = os.getenv('GOOGLE_CREDENTIALS_JSON')
    if creds_json.startswith('{'):
        creds_dict = json.loads(creds_json)
    else:
        with open(creds_json, 'r') as f:
            creds_dict = json.load(f)

    creds = Credentials.from_service_account_info(
        creds_dict,
        scopes=['https://www.googleapis.com/auth/spreadsheets.readonly']
    )

    return gspread.authorize(creds)

def check_supplier_sheet():
    print("=" * 80)
    print("SUPPLIER SHEET ANALYSIS")
    print("=" * 80)

    # Connect to Google Sheets
    print("\n1. CONNECTING TO SUPPLIER SHEET...")
    client = get_google_sheets_client()
    spreadsheet = client.open_by_key(SPREADSHEET_ID)

    print(f"   Spreadsheet: {spreadsheet.title}")
    print(f"   URL: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}")

    # Get all worksheets
    worksheets = spreadsheet.worksheets()
    print(f"\n2. FOUND {len(worksheets)} TABS/WORKSHEETS:")
    print("   " + "-" * 76)

    tab_info = []
    for ws in worksheets:
        # Get row count (approximate - checks how many rows have data in first column)
        values = ws.col_values(1)  # Get all values in column A
        row_count = len([v for v in values if v.strip()]) - 1  # Subtract header

        tab_info.append({
            'name': ws.title,
            'rows': row_count,
            'worksheet': ws
        })

        print(f"   {ws.title:<40} | {row_count:4d} rows")

    # Check database
    print("\n3. CHECKING DATABASE...")
    db_path = 'supplier_products.db'
    if os.path.exists(db_path):
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT supplier_name, COUNT(*) as count
            FROM supplier_products
            GROUP BY supplier_name
            ORDER BY count DESC
        """)

        db_suppliers = cursor.fetchall()

        print(f"   Database has {len(db_suppliers)} suppliers:")
        for supplier, count in db_suppliers:
            print(f"      {supplier:<40} | {count:4d} products")

        # Find tabs that aren't in database
        tab_names = {info['name'] for info in tab_info}
        db_names = {supplier for supplier, _ in db_suppliers}

        missing = tab_names - db_names
        if missing:
            print(f"\n   ⚠️  TABS NOT IN DATABASE ({len(missing)}):")
            for name in sorted(missing):
                tab = next((t for t in tab_info if t['name'] == name), None)
                if tab:
                    print(f"      {name:<40} | {tab['rows']:4d} rows")

        conn.close()
    else:
        print("   ❌ Database not found")

    # Show sample data from first few tabs
    print("\n4. SAMPLE DATA FROM FIRST 3 TABS:")
    for info in tab_info[:3]:
        ws = info['worksheet']
        print(f"\n   TAB: {info['name']}")
        print("   " + "-" * 76)

        # Get headers
        headers = ws.row_values(1)
        print(f"   Headers: {', '.join(headers[:5])}")

        # Get first 2 data rows
        if info['rows'] > 0:
            for row_num in range(2, min(4, info['rows'] + 2)):
                row_data = ws.row_values(row_num)
                if row_data:
                    # Show first 3 columns
                    print(f"   Row {row_num}: {' | '.join(str(v)[:30] for v in row_data[:3])}")

    print("\n" + "=" * 80)

if __name__ == '__main__':
    check_supplier_sheet()
