#!/usr/bin/env python3
"""
Sync Shopify catalog into the Unassigned Products Google Sheet.
"""
import logging
from typing import List

from config.settings import get_settings
from core.shopify_manager import ShopifyManager
from core.unassigned_products_manager import (
    get_unassigned_products_manager,
    REQUIRED_HEADERS
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)


def _format_price(value) -> str:
    if value is None or value == '':
        return ''
    try:
        return f"{float(value):.2f}"
    except Exception:
        return str(value)


def build_rows(shopify_products: List[dict]) -> List[List[str]]:
    """Transform Shopify products into sheet rows."""
    rows: List[List[str]] = []

    for product in shopify_products:
        images = ','.join(
            [img.get('src', '') for img in product.get('images', []) if img.get('src')]
        )
        title = product.get('title', '')
        vendor = product.get('vendor', '')
        body_html = product.get('body_html', '')
        handle = product.get('handle', '')
        status = product.get('status', '')

        for variant in product.get('variants', []):
            sku = variant.get('sku') or ''
            row = [
                sku,
                str(product.get('id', '')),
                handle,
                title,
                vendor,
                body_html,
                status,
                _format_price(variant.get('price')),
                _format_price(variant.get('compare_at_price')),
                str(variant.get('weight') or ''),
                images,
                ''  # shopify_spec_sheet placeholder
            ]
            rows.append(row)

    logger.info("Prepared %s unassigned rows", len(rows))
    return rows


def main():
    settings = get_settings()
    if not settings.UNASSIGNED_SPREADSHEET_ID:
        raise SystemExit("UNASSIGNED_SPREADSHEET_ID is not configured.")

    manager = ShopifyManager()
    products = manager.fetch_all_products()
    rows = build_rows(products)

    sheet_manager = get_unassigned_products_manager()
    success = sheet_manager.replace_products(rows)
    if not success:
        raise SystemExit("Failed to write rows to Google Sheet.")

    logger.info("✅ Unassigned products sheet updated successfully with %s rows", len(rows))


if __name__ == "__main__":
    main()
