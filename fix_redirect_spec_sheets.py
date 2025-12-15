#!/usr/bin/env python3
"""
Fix Redirect Spec Sheet URLs

This script:
1. Finds spec sheet URLs that redirect to PDF downloads (not direct links)
2. Downloads the PDF files
3. Uploads them to Shopify Files
4. Updates the Shopify metafield with the new Shopify CDN URL
5. Updates the Google Sheet with the new URL

Target URLs: parisiselection.com.au/subdomains/pdf/specification.php?pid=...
"""
import os
import logging
import time
import tempfile
import requests
from typing import List, Dict, Optional, Tuple
from urllib.parse import urlparse, parse_qs
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from config.settings import get_settings
from config.shopify_config import get_shopify_config
from core.unassigned_products_manager import get_unassigned_products_manager

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

# URLs that need fixing (redirect to PDF download instead of direct link)
REDIRECT_URL_PATTERNS = [
    'parisiselection.com.au/subdomains/pdf/specification.php',
]

# Metafield config
METAFIELD_NAMESPACE = 'global'
METAFIELD_KEY = 'specification_sheet'


def is_redirect_url(url: str) -> bool:
    """Check if URL is a redirect/download URL that needs fixing."""
    if not url:
        return False
    for pattern in REDIRECT_URL_PATTERNS:
        if pattern in url:
            return True
    return False


def download_pdf(url: str) -> Tuple[Optional[bytes], Optional[str]]:
    """
    Download PDF from a redirect URL.
    Returns (pdf_bytes, filename) or (None, None) on failure.
    """
    try:
        # Follow redirects and download the file
        response = requests.get(url, timeout=60, allow_redirects=True, stream=True)
        response.raise_for_status()

        # Check if it's actually a PDF
        content_type = response.headers.get('Content-Type', '')
        if 'pdf' not in content_type.lower() and not response.content[:4] == b'%PDF':
            logger.warning(f"URL did not return a PDF: {url}")
            return None, None

        # Try to get filename from Content-Disposition header
        filename = None
        content_disp = response.headers.get('Content-Disposition', '')
        if 'filename=' in content_disp:
            filename = content_disp.split('filename=')[-1].strip('"\'')

        # Generate filename from URL if not found
        if not filename:
            parsed = urlparse(url)
            params = parse_qs(parsed.query)
            pid = params.get('pid', ['unknown'])[0]
            filename = f"spec_sheet_{pid}.pdf"

        return response.content, filename

    except Exception as e:
        logger.error(f"Failed to download PDF from {url}: {e}")
        return None, None


def upload_to_shopify_files(pdf_bytes: bytes, filename: str, config) -> Optional[str]:
    """
    Upload a PDF to Shopify Files using the GraphQL API.
    Returns the new Shopify CDN URL or None on failure.
    """
    base_url = config.get_base_url().replace('/admin/api/', '/admin/api/')
    shop_url = config.SHOPIFY_SHOP_URL
    access_token = config.SHOPIFY_ACCESS_TOKEN
    api_version = config.SHOPIFY_API_VERSION

    # Shopify Files API uses GraphQL
    graphql_url = f"https://{shop_url}/admin/api/{api_version}/graphql.json"

    headers = {
        'X-Shopify-Access-Token': access_token,
        'Content-Type': 'application/json'
    }

    try:
        # Step 1: Create staged upload target
        staged_upload_query = """
        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
            stagedUploadsCreate(input: $input) {
                stagedTargets {
                    url
                    resourceUrl
                    parameters {
                        name
                        value
                    }
                }
                userErrors {
                    field
                    message
                }
            }
        }
        """

        staged_upload_variables = {
            "input": [{
                "filename": filename,
                "mimeType": "application/pdf",
                "resource": "FILE",
                "fileSize": str(len(pdf_bytes))
            }]
        }

        response = requests.post(
            graphql_url,
            headers=headers,
            json={"query": staged_upload_query, "variables": staged_upload_variables},
            timeout=30
        )
        response.raise_for_status()
        data = response.json()

        if 'errors' in data:
            logger.error(f"GraphQL errors creating staged upload: {data['errors']}")
            return None

        staged_targets = data.get('data', {}).get('stagedUploadsCreate', {}).get('stagedTargets', [])
        if not staged_targets:
            logger.error("No staged upload targets returned")
            return None

        target = staged_targets[0]
        upload_url = target['url']
        resource_url = target['resourceUrl']
        parameters = {p['name']: p['value'] for p in target['parameters']}

        # Step 2: Upload the file to the staged URL
        files = {'file': (filename, pdf_bytes, 'application/pdf')}
        upload_response = requests.post(upload_url, data=parameters, files=files, timeout=120)

        if upload_response.status_code not in [200, 201, 204]:
            logger.error(f"Failed to upload file: {upload_response.status_code} - {upload_response.text}")
            return None

        # Step 3: Create the file in Shopify
        create_file_query = """
        mutation fileCreate($files: [FileCreateInput!]!) {
            fileCreate(files: $files) {
                files {
                    ... on GenericFile {
                        id
                        url
                    }
                }
                userErrors {
                    field
                    message
                }
            }
        }
        """

        create_file_variables = {
            "files": [{
                "originalSource": resource_url,
                "filename": filename,
                "contentType": "FILE"
            }]
        }

        response = requests.post(
            graphql_url,
            headers=headers,
            json={"query": create_file_query, "variables": create_file_variables},
            timeout=30
        )
        response.raise_for_status()
        data = response.json()

        if 'errors' in data:
            logger.error(f"GraphQL errors creating file: {data['errors']}")
            return None

        user_errors = data.get('data', {}).get('fileCreate', {}).get('userErrors', [])
        if user_errors:
            logger.error(f"User errors creating file: {user_errors}")
            return None

        files_created = data.get('data', {}).get('fileCreate', {}).get('files', [])
        if files_created and files_created[0].get('url'):
            return files_created[0]['url']

        # Sometimes the URL isn't immediately available, need to poll
        logger.info("File created but URL not immediately available, waiting...")
        time.sleep(5)

        return resource_url  # Fall back to resource URL

    except Exception as e:
        logger.error(f"Failed to upload to Shopify Files: {e}")
        return None


def update_shopify_metafield(product_id: str, new_url: str, config) -> bool:
    """Update the spec sheet metafield for a product."""
    base_url = config.get_base_url()
    headers = config.get_headers()

    # First, get existing metafields to find the ID
    url = f"{base_url}/products/{product_id}/metafields.json"

    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        data = response.json()

        metafield_id = None
        for mf in data.get('metafields', []):
            if mf.get('namespace') == METAFIELD_NAMESPACE and mf.get('key') == METAFIELD_KEY:
                metafield_id = mf.get('id')
                break

        if metafield_id:
            # Update existing metafield
            update_url = f"{base_url}/metafields/{metafield_id}.json"
            payload = {
                "metafield": {
                    "id": metafield_id,
                    "value": new_url
                }
            }
            response = requests.put(update_url, headers=headers, json=payload, timeout=30)
        else:
            # Create new metafield
            create_url = f"{base_url}/products/{product_id}/metafields.json"
            payload = {
                "metafield": {
                    "namespace": METAFIELD_NAMESPACE,
                    "key": METAFIELD_KEY,
                    "value": new_url,
                    "type": "single_line_text_field"
                }
            }
            response = requests.post(create_url, headers=headers, json=payload, timeout=30)

        if response.status_code in [200, 201]:
            logger.info(f"Updated metafield for product {product_id}")
            return True
        else:
            logger.error(f"Failed to update metafield: {response.status_code} - {response.text}")
            return False

    except Exception as e:
        logger.error(f"Error updating metafield for product {product_id}: {e}")
        return False


def main():
    settings = get_settings()
    config = get_shopify_config()

    logger.info("Fetching products from Unassigned sheet...")
    sheet_manager = get_unassigned_products_manager()
    products = sheet_manager.get_all_products()

    if not products:
        logger.info("No products found in sheet")
        return

    logger.info(f"Found {len(products)} products in sheet")

    # Find products with redirect URLs
    products_to_fix = []
    for product in products:
        spec_sheet = product.get('shopify_spec_sheet', '')
        if is_redirect_url(spec_sheet):
            products_to_fix.append(product)

    logger.info(f"Found {len(products_to_fix)} products with redirect URLs to fix")

    if not products_to_fix:
        logger.info("No redirect URLs found - nothing to do")
        return

    # Process each product
    fixed_count = 0
    failed_count = 0

    for i, product in enumerate(products_to_fix):
        product_id = product.get('id', '')
        old_url = product.get('shopify_spec_sheet', '')
        sku = product.get('variant_sku', '')

        logger.info(f"[{i+1}/{len(products_to_fix)}] Processing product {product_id} (SKU: {sku})")
        logger.info(f"  Old URL: {old_url}")

        # Step 1: Download PDF
        pdf_bytes, filename = download_pdf(old_url)
        if not pdf_bytes:
            logger.error(f"  Failed to download PDF")
            failed_count += 1
            continue

        logger.info(f"  Downloaded PDF: {filename} ({len(pdf_bytes)} bytes)")

        # Step 2: Upload to Shopify
        new_url = upload_to_shopify_files(pdf_bytes, filename, config)
        if not new_url:
            logger.error(f"  Failed to upload to Shopify")
            failed_count += 1
            continue

        logger.info(f"  New URL: {new_url}")

        # Step 3: Update Shopify metafield
        if not update_shopify_metafield(product_id, new_url, config):
            logger.error(f"  Failed to update metafield")
            failed_count += 1
            continue

        fixed_count += 1
        logger.info(f"  ✅ Fixed!")

        # Rate limiting
        time.sleep(1)

    logger.info("=" * 50)
    logger.info(f"Complete! Fixed: {fixed_count}, Failed: {failed_count}")
    logger.info("Run sync_unassigned_products.py again to update the sheet with new URLs")


if __name__ == "__main__":
    main()
