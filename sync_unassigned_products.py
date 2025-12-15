#!/usr/bin/env python3
"""
Sync Shopify catalog into the Unassigned Products Google Sheet.
Includes metafield fetching for spec sheets.
"""
import logging
import time
import requests
from typing import List, Dict, Optional

from config.settings import get_settings
from config.shopify_config import get_shopify_config
from core.shopify_manager import ShopifyManager
from core.unassigned_products_manager import (
    get_unassigned_products_manager,
    REQUIRED_HEADERS
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

# Metafield configuration for spec sheets
SPEC_SHEET_NAMESPACE = 'global'
SPEC_SHEET_KEY = 'specification_sheet'


def _format_price(value) -> str:
    if value is None or value == '':
        return ''
    try:
        return f"{float(value):.2f}"
    except Exception:
        return str(value)


def _build_shopify_product_url(handle: str, settings) -> str:
    """Return a public Shopify product URL for the given handle."""
    if not handle:
        return ''
    base = (settings.SHOPIFY_CONFIG.get('SHOP_URL') or '').strip()
    if not base:
        return ''
    if not base.startswith('http'):
        base = f"https://{base}"
    return f"{base.rstrip('/')}/products/{handle.strip()}"


def fetch_metafields_for_product(product_id: str, config) -> Dict[str, str]:
    """Fetch metafields for a single product."""
    base_url = config.get_base_url()
    headers = config.get_headers()

    url = f"{base_url}/products/{product_id}/metafields.json"

    try:
        response = requests.get(url, headers=headers, timeout=30)
        if response.status_code == 200:
            data = response.json()
            metafields = {}
            for mf in data.get('metafields', []):
                key = f"{mf.get('namespace')}.{mf.get('key')}"
                metafields[key] = mf.get('value', '')
            return metafields
        else:
            logger.debug(f"Failed to fetch metafields for product {product_id}: {response.status_code}")
            return {}
    except Exception as e:
        logger.debug(f"Error fetching metafields for product {product_id}: {e}")
        return {}


def fetch_spec_sheets_batch(product_ids: List[str], config) -> Dict[str, str]:
    """
    Fetch spec sheet URLs for a batch of products.
    Returns a dict mapping product_id -> spec_sheet_url
    """
    spec_sheets = {}
    rate_limit_delay = config.SHOPIFY_RATE_LIMIT_DELAY

    for i, product_id in enumerate(product_ids):
        if i > 0 and i % 100 == 0:
            logger.info(f"Fetched metafields for {i}/{len(product_ids)} products...")

        metafields = fetch_metafields_for_product(product_id, config)
        spec_sheet_key = f"{SPEC_SHEET_NAMESPACE}.{SPEC_SHEET_KEY}"

        if spec_sheet_key in metafields:
            spec_sheets[product_id] = metafields[spec_sheet_key]

        # Rate limiting
        time.sleep(rate_limit_delay)

    return spec_sheets


def build_rows(shopify_products: List[dict], settings, spec_sheets: Dict[str, str]) -> List[List[str]]:
    """Transform Shopify products into sheet rows."""
    rows: List[List[str]] = []

    for product in shopify_products:
        product_id = str(product.get('id', ''))
        images = ','.join(
            [img.get('src', '') for img in product.get('images', []) if img.get('src')]
        )
        title = product.get('title', '')
        vendor = product.get('vendor', '')
        body_html = product.get('body_html', '')
        handle = product.get('handle', '')
        status = product.get('status', '')
        product_type = product.get('product_type', '')
        product_url = _build_shopify_product_url(handle, settings)

        # Get spec sheet from metafields
        spec_sheet = spec_sheets.get(product_id, '')

        for variant in product.get('variants', []):
            sku = variant.get('sku') or ''
            weight = variant.get('weight') or ''

            row = [
                product_url,                         # url
                sku,                                 # variant_sku
                product_id,                          # id
                handle,                              # handle
                title,                               # title
                vendor,                              # vendor
                images,                              # shopify_images
                str(weight),                         # Shopify Weight
                spec_sheet,                          # shopify_spec_sheet (from metafields)
                product_type,                        # shopify_collections
                product_url,                         # shopify_url
                body_html,                           # body_html
                status,                              # shopify_status
                _format_price(variant.get('price')), # shopify_price
                _format_price(variant.get('compare_at_price')),  # shopify_compare_price
            ]
            rows.append(row)

    logger.info("Prepared %s unassigned rows", len(rows))
    return rows


def main():
    settings = get_settings()
    if not settings.UNASSIGNED_SPREADSHEET_ID:
        raise SystemExit("UNASSIGNED_SPREADSHEET_ID is not configured.")

    config = get_shopify_config()
    manager = ShopifyManager()

    logger.info("Fetching all products from Shopify...")
    products = manager.fetch_all_products()
    logger.info(f"Fetched {len(products)} products from Shopify")

    # Get unique product IDs
    product_ids = list(set(str(p.get('id', '')) for p in products if p.get('id')))
    logger.info(f"Fetching metafields (spec sheets) for {len(product_ids)} unique products...")

    # Fetch spec sheets from metafields
    spec_sheets = fetch_spec_sheets_batch(product_ids, config)
    logger.info(f"Found {len(spec_sheets)} products with spec sheets")

    # Build rows with spec sheet data
    rows = build_rows(products, settings, spec_sheets)

    sheet_manager = get_unassigned_products_manager()
    success = sheet_manager.replace_products(rows)
    if not success:
        raise SystemExit("Failed to write rows to Google Sheet.")

    logger.info("✅ Unassigned products sheet updated successfully with %s rows", len(rows))


if __name__ == "__main__":
    main()
