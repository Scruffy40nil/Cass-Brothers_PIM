#!/usr/bin/env python3
"""
Import Supplier Products from Google Sheet
Imports SKU/URL data from multi-tab supplier spreadsheet into SQLite
"""

import os
import sys
import csv
import requests
from io import StringIO
from dotenv import load_dotenv
import gspread
from google.oauth2.service_account import Credentials
import json
import logging

# Add project to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.supplier_db import get_supplier_db
from core.image_extractor import extract_og_image
from core.collection_detector import detect_collection

load_dotenv()
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

SPREADSHEET_ID = "1gt_DvS2E4WJNaylXYvwWfRwHzoDcRYxjmDpLevHffYQ"


def get_google_sheets_client():
    """Get authenticated Google Sheets client"""
    try:
        creds_json = os.getenv('GOOGLE_CREDENTIALS_JSON')
        if not creds_json:
            logger.error("No GOOGLE_CREDENTIALS_JSON found in environment")
            return None

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
    except Exception as e:
        logger.error(f"Failed to authenticate with Google Sheets: {e}")
        return None


def get_all_sheet_tabs(gc, spreadsheet_id):
    """Get all worksheet tabs from the spreadsheet"""
    try:
        spreadsheet = gc.open_by_key(spreadsheet_id)
        worksheets = spreadsheet.worksheets()

        tabs = []
        for ws in worksheets:
            tabs.append({
                'title': ws.title,
                'id': ws.id,
                'row_count': ws.row_count,
                'col_count': ws.col_count
            })

        return tabs
    except Exception as e:
        logger.error(f"Failed to get worksheet tabs: {e}")
        return []


def get_sheet_data(gc, spreadsheet_id, worksheet_title):
    """Get data from a specific worksheet"""
    try:
        spreadsheet = gc.open_by_key(spreadsheet_id)
        worksheet = spreadsheet.worksheet(worksheet_title)

        # Get all values
        all_values = worksheet.get_all_values()

        if not all_values or len(all_values) < 2:
            return []

        # Parse as CSV with headers
        headers = all_values[0]
        data = []

        for row in all_values[1:]:
            if len(row) >= len(headers):
                row_dict = {}
                for i, header in enumerate(headers):
                    row_dict[header.lower()] = row[i] if i < len(row) else ''
                data.append(row_dict)

        return data

    except Exception as e:
        logger.warning(f"Failed to get data from '{worksheet_title}': {e}")
        return []


def import_supplier_sheet(
    extract_images=False,
    limit_suppliers=None,
    skip_existing=True
):
    """
    Import supplier products from Google Sheet

    Args:
        extract_images: If True, extract images from URLs (slow)
        limit_suppliers: List of supplier names to import (None = all)
        skip_existing: If True, skip products already in database
    """

    # Get Google Sheets client
    gc = get_google_sheets_client()
    if not gc:
        logger.error("❌ Could not authenticate with Google Sheets")
        return

    logger.info(f"✅ Connected to Google Sheets")

    # Get all worksheet tabs
    logger.info("📋 Fetching worksheet tabs...")
    tabs = get_all_sheet_tabs(gc, SPREADSHEET_ID)

    if not tabs:
        logger.error("❌ No worksheet tabs found")
        return

    logger.info(f"✅ Found {len(tabs)} worksheet tabs")

    # Filter out metadata tabs (Supplier list, etc)
    product_tabs = [
        tab for tab in tabs
        if tab['title'] not in ['Supplier', 'Instructions', 'README']
        and tab['row_count'] > 1
    ]

    logger.info(f"📦 Found {len(product_tabs)} potential product tabs:")
    for tab in product_tabs[:20]:
        logger.info(f"   - {tab['title']} ({tab['row_count']} rows)")

    if len(product_tabs) > 20:
        logger.info(f"   ... and {len(product_tabs) - 20} more")

    # Filter by supplier list if provided
    if limit_suppliers:
        product_tabs = [
            tab for tab in product_tabs
            if tab['title'] in limit_suppliers
        ]
        logger.info(f"📌 Limited to {len(product_tabs)} suppliers: {limit_suppliers}")

    # Get supplier database
    supplier_db = get_supplier_db()

    # Process each supplier tab
    total_imported = 0
    total_updated = 0
    total_skipped = 0
    total_errors = 0

    for i, tab in enumerate(product_tabs, 1):
        supplier_name = tab['title']
        logger.info(f"\n{'='*60}")
        logger.info(f"[{i}/{len(product_tabs)}] Processing: {supplier_name}")
        logger.info(f"{'='*60}")

        # Get sheet data
        sheet_data = get_sheet_data(gc, SPREADSHEET_ID, supplier_name)

        if not sheet_data:
            logger.warning(f"⚠️  No data found in '{supplier_name}' tab")
            continue

        logger.info(f"📊 Found {len(sheet_data)} rows in '{supplier_name}'")

        # Check if data has SKU and URL columns
        first_row = sheet_data[0]
        if 'sku' not in first_row or 'url' not in first_row:
            logger.warning(f"⚠️  Tab '{supplier_name}' missing SKU or URL columns - skipping")
            continue

        # Process products
        processed = 0
        imported = 0
        updated = 0
        skipped = 0
        errors = 0

        for row in sheet_data:
            sku = row.get('sku', '').strip()
            url = row.get('url', '').strip()

            if not sku or not url:
                skipped += 1
                continue

            try:
                # Check if already exists
                if skip_existing:
                    existing = supplier_db.search_by_sku([sku])
                    if existing:
                        skipped += 1
                        continue

                # Extract image if requested
                image_url = None
                if extract_images:
                    try:
                        logger.info(f"  🖼️  Extracting image for {sku}...")
                        image_url = extract_og_image(url, timeout=10)
                    except Exception as e:
                        logger.warning(f"  ⚠️  Failed to extract image: {e}")

                # Detect collection
                collection, confidence = detect_collection('', url)

                # Import to database
                csv_row = [{
                    'sku': sku,
                    'supplier_name': supplier_name,
                    'product_url': url,
                    'product_name': '',
                    'image_url': image_url or ''
                }]

                result = supplier_db.import_from_csv(csv_row, auto_extract_images=False)

                if result['imported'] > 0:
                    imported += 1
                elif result['updated'] > 0:
                    updated += 1
                else:
                    skipped += 1

                # Update collection detection
                if collection:
                    supplier_db.update_collection_detection(sku, collection, confidence)

                processed += 1

                if processed % 50 == 0:
                    logger.info(f"  📈 Processed {processed}/{len(sheet_data)} from {supplier_name}")

            except Exception as e:
                logger.error(f"  ❌ Error importing {sku}: {e}")
                errors += 1

        logger.info(f"✅ {supplier_name} complete:")
        logger.info(f"   - Imported: {imported}")
        logger.info(f"   - Updated: {updated}")
        logger.info(f"   - Skipped: {skipped}")
        logger.info(f"   - Errors: {errors}")

        total_imported += imported
        total_updated += updated
        total_skipped += skipped
        total_errors += errors

    # Final summary
    logger.info(f"\n{'='*60}")
    logger.info(f"🎉 IMPORT COMPLETE")
    logger.info(f"{'='*60}")
    logger.info(f"Total Imported: {total_imported}")
    logger.info(f"Total Updated:  {total_updated}")
    logger.info(f"Total Skipped:  {total_skipped}")
    logger.info(f"Total Errors:   {total_errors}")
    logger.info(f"{'='*60}")


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Import supplier products from Google Sheet')
    parser.add_argument('--extract-images', action='store_true',
                       help='Extract images from URLs (slow)')
    parser.add_argument('--suppliers', nargs='+',
                       help='Specific suppliers to import (default: all)')
    parser.add_argument('--no-skip', action='store_true',
                       help='Re-import existing products (default: skip)')

    args = parser.parse_args()

    import_supplier_sheet(
        extract_images=args.extract_images,
        limit_suppliers=args.suppliers,
        skip_existing=not args.no_skip
    )
