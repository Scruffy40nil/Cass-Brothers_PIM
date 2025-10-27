#!/usr/bin/env python3
"""
Check raw Phoenix data - show exactly what's in each column
"""

import os
import json
from dotenv import load_dotenv
import gspread
from google.oauth2.service_account import Credentials

load_dotenv()

SUPPLIER_SHEET_ID = "1gt_DvS2E4WJNaylXYvwWfRwHzoDcRYxjmDpLevHffYQ"

def get_google_sheets_client():
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

def check_phoenix():
    print("=" * 80)
    print("PHOENIX TAPWARE RAW DATA CHECK")
    print("=" * 80)

    client = get_google_sheets_client()
    supplier_sheet = client.open_by_key(SUPPLIER_SHEET_ID)

    phoenix_ws = None
    for ws in supplier_sheet.worksheets():
        if 'PHOENIX' in ws.title.upper():
            phoenix_ws = ws
            break

    if phoenix_ws:
        data = phoenix_ws.get_all_values()

        print(f"\nTab: {phoenix_ws.title}")
        print(f"Total rows: {len(data)}")

        # Show first 15 rows with BOTH columns clearly labeled
        print(f"\nFirst 15 rows (showing both columns A and B):")
        print("-" * 80)

        for i, row in enumerate(data[:15]):
            if i == 0:
                print(f"Row {i+1} (HEADERS):")
            else:
                print(f"Row {i+1}:")

            if len(row) >= 1:
                col_a = row[0][:60] if row[0] else "(empty)"
                print(f"   Column A: {col_a}")

            if len(row) >= 2:
                col_b = row[1][:60] if row[1] else "(empty)"
                print(f"   Column B: {col_b}")

            print()

    print("=" * 80)

if __name__ == '__main__':
    check_phoenix()
