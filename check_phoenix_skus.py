#!/usr/bin/env python3
"""
Check Phoenix Tapware SKU formats to understand why they're not matching
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

def check_phoenix_skus():
    print("=" * 80)
    print("PHOENIX TAPWARE SKU FORMAT ANALYSIS")
    print("=" * 80)

    client = get_google_sheets_client()

    # Get Taps sheet
    print("\n1. TAPS SHEET - Phoenix Tapware SKUs")
    print("-" * 80)
    taps_sheet = client.open_by_key(TAPS_SHEET_ID)
    taps_ws = taps_sheet.worksheet('Raw_Data')
    taps_data = taps_ws.get_all_values()

    phoenix_taps = []
    for row_num, row in enumerate(taps_data[1:], start=2):
        if len(row) > 7:
            brand = row[7].strip() if len(row) > 7 else ''
            sku = row[1].strip() if len(row) > 1 else ''

            if 'PHOENIX' in brand.upper() and sku:
                phoenix_taps.append((row_num, sku))

    print(f"   Found {len(phoenix_taps)} Phoenix products in Taps sheet")
    print(f"\n   First 20 SKUs:")
    for i, (row_num, sku) in enumerate(phoenix_taps[:20], 1):
        print(f"      {i:2d}. Row {row_num:3d}: {sku}")

    # Get Supplier sheet
    print("\n\n2. SUPPLIER SHEET - Phoenix Tapware Tab")
    print("-" * 80)
    supplier_sheet = client.open_by_key(SUPPLIER_SHEET_ID)

    phoenix_ws = None
    for ws in supplier_sheet.worksheets():
        if 'PHOENIX' in ws.title.upper():
            phoenix_ws = ws
            break

    if phoenix_ws:
        data = phoenix_ws.get_all_values()
        headers = data[0]
        print(f"   Tab: {phoenix_ws.title}")
        print(f"   Headers: {headers}")

        # Find SKU column
        sku_col = None
        for i, h in enumerate(headers):
            if 'SKU' in h.upper():
                sku_col = i
                break

        if sku_col is not None:
            supplier_skus = []
            for row in data[1:21]:  # First 20
                if len(row) > sku_col:
                    sku = row[sku_col].strip()
                    if sku:
                        supplier_skus.append(sku)

            print(f"\n   Found {len(data)-1} total SKUs in supplier sheet")
            print(f"\n   First 20 SKUs:")
            for i, sku in enumerate(supplier_skus, 1):
                print(f"      {i:2d}. {sku}")

            # Try to find matches
            print("\n\n3. MATCHING ANALYSIS")
            print("-" * 80)

            taps_sku_set = {sku.upper() for _, sku in phoenix_taps}
            supplier_sku_set = {row[sku_col].strip().upper() for row in data[1:] if len(row) > sku_col and row[sku_col].strip()}

            exact_matches = taps_sku_set & supplier_sku_set
            print(f"   Exact matches: {len(exact_matches)}")

            if exact_matches:
                print(f"   Examples:")
                for sku in list(exact_matches)[:5]:
                    print(f"      - {sku}")

            # Check for pattern differences
            print(f"\n   Sample Taps SKUs:")
            for _, sku in phoenix_taps[:5]:
                print(f"      {sku}")

            print(f"\n   Sample Supplier SKUs:")
            for sku in supplier_skus[:5]:
                print(f"      {sku}")

            # Check if supplier SKUs contain taps SKUs or vice versa
            print(f"\n   Checking for partial matches...")
            partial_matches = []
            for _, taps_sku in phoenix_taps[:20]:
                for supplier_sku in supplier_skus[:50]:
                    if taps_sku.upper() in supplier_sku.upper() or supplier_sku.upper() in taps_sku.upper():
                        partial_matches.append((taps_sku, supplier_sku))
                        if len(partial_matches) >= 10:
                            break
                if len(partial_matches) >= 10:
                    break

            if partial_matches:
                print(f"   Found {len(partial_matches)} partial matches:")
                for taps_sku, supplier_sku in partial_matches[:10]:
                    print(f"      Taps: {taps_sku:<30} <-> Supplier: {supplier_sku}")
            else:
                print(f"   No partial matches found")

    print("\n" + "=" * 80)

if __name__ == '__main__':
    check_phoenix_skus()
