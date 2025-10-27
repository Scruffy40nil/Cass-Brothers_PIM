#!/usr/bin/env python3
"""
Search for a specific SKU in both sheets
"""

import os
import json
import sys
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

def find_sku(search_sku):
    print("=" * 80)
    print(f"SEARCHING FOR SKU: {search_sku}")
    print("=" * 80)

    client = get_google_sheets_client()

    # Search in Taps sheet
    print("\n1. SEARCHING TAPS SHEET...")
    taps_sheet = client.open_by_key(TAPS_SHEET_ID)
    taps_ws = taps_sheet.worksheet('Raw_Data')
    taps_data = taps_ws.get_all_values()

    found_in_taps = []
    for row_num, row in enumerate(taps_data, start=1):
        if len(row) > 1:
            sku = row[1].strip()  # Column B
            if search_sku.upper() in sku.upper() or sku.upper() in search_sku.upper():
                brand = row[7] if len(row) > 7 else ''
                url = row[0] if len(row) > 0 else ''
                found_in_taps.append((row_num, sku, brand, url))

    if found_in_taps:
        print(f"   ✅ Found {len(found_in_taps)} matches:")
        for row_num, sku, brand, url in found_in_taps:
            print(f"      Row {row_num}: SKU={sku} | Brand={brand} | URL={url[:50] if url else '(empty)'}...")
    else:
        print(f"   ❌ Not found in Taps sheet")

    # Search in Phoenix Tapware supplier sheet
    print("\n2. SEARCHING PHOENIX TAPWARE SUPPLIER TAB...")
    supplier_sheet = client.open_by_key(SUPPLIER_SHEET_ID)

    phoenix_ws = None
    for ws in supplier_sheet.worksheets():
        if 'PHOENIX' in ws.title.upper():
            phoenix_ws = ws
            break

    if phoenix_ws:
        data = phoenix_ws.get_all_values()

        found_in_supplier = []
        for row_num, row in enumerate(data, start=1):
            if len(row) >= 2:
                # Column A has SKU (despite header saying URL)
                col_a = row[0].strip()
                col_b = row[1].strip()

                # Check both columns
                if (search_sku.upper() in col_a.upper() or col_a.upper() in search_sku.upper() or
                    search_sku.upper() in col_b.upper() or col_b.upper() in search_sku.upper()):
                    found_in_supplier.append((row_num, col_a, col_b))

        if found_in_supplier:
            print(f"   ✅ Found {len(found_in_supplier)} matches:")
            for row_num, col_a, col_b in found_in_supplier:
                print(f"      Row {row_num}: Col A={col_a} | Col B={col_b[:50]}...")
        else:
            print(f"   ❌ Not found in Phoenix Tapware tab")

    # Also search other supplier tabs
    print("\n3. SEARCHING OTHER SUPPLIER TABS...")
    found_in_other = []

    for ws in supplier_sheet.worksheets():
        if 'PHOENIX' in ws.title.upper() or 'TABLE' in ws.title.upper() or 'SHEET' in ws.title.upper():
            continue

        try:
            data = ws.get_all_values()
            for row_num, row in enumerate(data, start=1):
                if len(row) >= 2:
                    col_a = row[0].strip()
                    col_b = row[1].strip()

                    if (search_sku.upper() in col_a.upper() or col_a.upper() in search_sku.upper() or
                        search_sku.upper() in col_b.upper() or col_b.upper() in search_sku.upper()):
                        found_in_other.append((ws.title, row_num, col_a, col_b))
                        break
        except:
            pass

    if found_in_other:
        print(f"   ✅ Found in {len(found_in_other)} other tabs:")
        for tab, row_num, col_a, col_b in found_in_other:
            print(f"      {tab}: Row {row_num} | Col A={col_a} | Col B={col_b[:50]}...")
    else:
        print(f"   ❌ Not found in other supplier tabs")

    print("\n" + "=" * 80)

if __name__ == '__main__':
    search_sku = sys.argv[1] if len(sys.argv) > 1 else "119-0600-12-1"
    find_sku(search_sku)
