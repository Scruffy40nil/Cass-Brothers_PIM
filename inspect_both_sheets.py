#!/usr/bin/env python3
"""
Inspect both sheets to understand their structure
"""

import os
import json
from dotenv import load_dotenv
import gspread
from google.oauth2.service_account import Credentials

load_dotenv()

SUPPLIER_SHEET_ID = "1gt_DvS2E4WJNaylXYvwWfRwHzoDcRYxjmDpLevHffYQ"
TAPS_SHEET_ID = "1jJ5thuNoxcITHkFAfFKPmUfaLYC3dSo2oppiN0s7i1U"

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

def inspect_sheets():
    print("=" * 80)
    print("INSPECTING BOTH GOOGLE SHEETS")
    print("=" * 80)

    client = get_google_sheets_client()

    # TAPS SHEET
    print("\n1. TAPS SHEET")
    print("-" * 80)
    taps_sheet = client.open_by_key(TAPS_SHEET_ID)
    print(f"   Title: {taps_sheet.title}")
    print(f"   URL: https://docs.google.com/spreadsheets/d/{TAPS_SHEET_ID}")

    taps_ws = taps_sheet.worksheet('Raw_Data')
    taps_headers = taps_ws.row_values(1)

    print(f"\n   Headers (first 15):")
    for i, header in enumerate(taps_headers[:15], 1):
        print(f"      Col {chr(64+i):>2} ({i:2d}): {header}")

    print(f"\n   Sample data (rows 2-4):")
    for row_num in range(2, 5):
        row = taps_ws.row_values(row_num)
        if row:
            print(f"      Row {row_num}:")
            print(f"         A (url):         {row[0][:50] if len(row) > 0 else 'empty'}...")
            print(f"         B (variant_sku): {row[1] if len(row) > 1 else 'empty'}")
            print(f"         H (brand_name):  {row[7] if len(row) > 7 else 'empty'}")

    # SUPPLIER SHEET
    print("\n\n2. SUPPLIER SHEET")
    print("-" * 80)
    supplier_sheet = client.open_by_key(SUPPLIER_SHEET_ID)
    print(f"   Title: {supplier_sheet.title}")
    print(f"   URL: https://docs.google.com/spreadsheets/d/{SUPPLIER_SHEET_ID}")

    print(f"\n   Tabs/Worksheets:")
    for ws in supplier_sheet.worksheets()[:10]:
        print(f"      - {ws.title}")
    if len(supplier_sheet.worksheets()) > 10:
        print(f"      ... and {len(supplier_sheet.worksheets()) - 10} more")

    # Check a few brand tabs
    print(f"\n   Sample Brand Tabs:")
    for brand_name in ['Phoenix Tapware', 'Parisi', 'Argent', 'Abey']:
        try:
            ws = None
            for w in supplier_sheet.worksheets():
                if w.title.strip().upper() == brand_name.upper():
                    ws = w
                    break

            if ws:
                headers = ws.row_values(1)
                row2 = ws.row_values(2) if ws.row_count > 1 else []
                row3 = ws.row_values(3) if ws.row_count > 2 else []

                print(f"\n      {brand_name}:")
                print(f"         Headers: {headers[:5]}")
                if row2:
                    print(f"         Row 2: SKU={row2[0] if len(row2) > 0 else 'N/A'} | URL={row2[1][:50] if len(row2) > 1 else 'N/A'}...")
                if row3:
                    print(f"         Row 3: SKU={row3[0] if len(row3) > 0 else 'N/A'} | URL={row3[1][:50] if len(row3) > 1 else 'N/A'}...")
        except Exception as e:
            print(f"\n      {brand_name}: Error - {e}")

    # Check if SKUs match format
    print(f"\n\n3. SKU FORMAT COMPARISON")
    print("-" * 80)

    print(f"   Taps Sheet SKUs (from rows 2-6):")
    for row_num in range(2, 7):
        row = taps_ws.row_values(row_num)
        sku = row[1] if len(row) > 1 else ''
        brand = row[7] if len(row) > 7 else ''
        print(f"      {brand:<20} | SKU: {sku}")

    print(f"\n   Supplier Sheet SKUs (Phoenix Tapware tab, rows 2-6):")
    try:
        phoenix_ws = None
        for w in supplier_sheet.worksheets():
            if 'PHOENIX' in w.title.upper():
                phoenix_ws = w
                break

        if phoenix_ws:
            for row_num in range(2, 7):
                row = phoenix_ws.row_values(row_num)
                sku = row[0] if len(row) > 0 else ''
                url = row[1][:50] if len(row) > 1 else ''
                print(f"      SKU: {sku:<20} | URL: {url}...")
    except Exception as e:
        print(f"      Error: {e}")

    print("\n" + "=" * 80)

if __name__ == '__main__':
    inspect_sheets()
