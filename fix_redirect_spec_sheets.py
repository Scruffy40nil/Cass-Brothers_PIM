#!/usr/bin/env python3
"""
Fix Redirect Spec Sheet URLs

This script:
1. Finds spec sheet URLs that redirect to PDF downloads (not direct links)
2. Downloads the PDF files using Selenium (headless browser)
3. Uploads them to Shopify Files
4. Updates the Shopify metafield with the new Shopify CDN URL
5. Updates the Google Sheet with the new URL

Target URLs: parisiselection.com.au/subdomains/pdf/specification.php?pid=...
"""
import os
import logging
import time
import tempfile
import base64
import requests
from typing import List, Dict, Optional, Tuple
from urllib.parse import urlparse, parse_qs
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from config.shopify_config import get_shopify_config
from core.unassigned_products_manager import get_unassigned_products_manager

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

# URLs that need fixing (redirect to PDF download instead of direct link)
REDIRECT_URL_PATTERNS = [
    'parisiselection.com.au/subdomains/pdf/specification.php',
]

# URLs to skip (Cloudflare protected - need manual handling or local download)
SKIP_URL_PATTERNS = [
    'parisiselection.com.au',  # Cloudflare protected - cannot download automatically
]

# Metafield config
METAFIELD_NAMESPACE = 'global'
METAFIELD_KEY = 'specification_sheet'

# Global Selenium driver (reuse across downloads)
_selenium_driver = None


def get_selenium_driver():
    """Get or create a Selenium driver instance."""
    global _selenium_driver
    if _selenium_driver is not None:
        return _selenium_driver

    # Try undetected-chromedriver first (bypasses Cloudflare)
    try:
        import undetected_chromedriver as uc

        options = uc.ChromeOptions()
        options.add_argument('--headless=new')  # New headless mode
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--window-size=1920,1080')

        # Set download preferences
        prefs = {
            'download.default_directory': tempfile.gettempdir(),
            'download.prompt_for_download': False,
            'plugins.always_open_pdf_externally': True,
        }
        options.add_experimental_option('prefs', prefs)

        _selenium_driver = uc.Chrome(options=options, use_subprocess=True)
        logger.info("Undetected Chrome driver initialized successfully")
        return _selenium_driver

    except ImportError:
        logger.info("undetected-chromedriver not installed, trying regular Selenium")
    except Exception as e:
        logger.warning(f"Failed to initialize undetected Chrome: {e}")

    # Fallback to regular Selenium
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.chrome.service import Service

        chrome_options = Options()
        chrome_options.add_argument('--headless')
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        chrome_options.add_argument('--disable-gpu')
        chrome_options.add_argument('--window-size=1920,1080')
        chrome_options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

        prefs = {
            'download.default_directory': tempfile.gettempdir(),
            'download.prompt_for_download': False,
            'plugins.always_open_pdf_externally': True,
            'download.directory_upgrade': True,
        }
        chrome_options.add_experimental_option('prefs', prefs)

        try:
            service = Service('/usr/bin/chromedriver')
            _selenium_driver = webdriver.Chrome(service=service, options=chrome_options)
        except Exception:
            _selenium_driver = webdriver.Chrome(options=chrome_options)

        logger.info("Selenium driver initialized successfully")
        return _selenium_driver

    except ImportError:
        logger.error("Selenium not installed. Run: pip install selenium")
        return None
    except Exception as e:
        logger.error(f"Failed to initialize Selenium driver: {e}")
        return None


def close_selenium_driver():
    """Close the Selenium driver."""
    global _selenium_driver
    if _selenium_driver:
        try:
            _selenium_driver.quit()
        except Exception:
            pass
        _selenium_driver = None


def is_redirect_url(url: str) -> bool:
    """Check if URL is a redirect/download URL that needs fixing."""
    if not url:
        return False
    for pattern in REDIRECT_URL_PATTERNS:
        if pattern in url:
            return True
    return False


def should_skip_url(url: str) -> bool:
    """Check if URL should be skipped (e.g., Cloudflare protected)."""
    if not url:
        return False
    for pattern in SKIP_URL_PATTERNS:
        if pattern in url:
            return True
    return False


def download_pdf_with_selenium(url: str) -> Tuple[Optional[bytes], Optional[str]]:
    """
    Download PDF using Selenium headless browser.
    Returns (pdf_bytes, filename) or (None, None) on failure.
    """
    driver = get_selenium_driver()
    if not driver:
        return None, None

    try:
        # Navigate to URL
        driver.get(url)
        time.sleep(3)  # Wait for page/download

        # Check current URL and page source for debugging
        current_url = driver.current_url
        logger.debug(f"Current URL after navigation: {current_url}")

        # Method 1: Check if we're on a PDF (some sites serve directly)
        page_source = driver.page_source
        if '%PDF' in page_source[:100] or current_url.endswith('.pdf'):
            logger.debug("Page appears to be a PDF")

        # Method 2: Try to use Chrome DevTools Protocol to get the response
        # This is more reliable for downloads
        try:
            # Use print to PDF approach - navigate and capture
            pdf_base64 = driver.execute_cdp_cmd('Page.printToPDF', {
                'printBackground': True,
                'preferCSSPageSize': True,
            })
            if pdf_base64 and pdf_base64.get('data'):
                pdf_bytes = base64.b64decode(pdf_base64['data'])
                if len(pdf_bytes) > 1000:  # Reasonable PDF size
                    parsed = urlparse(url)
                    params = parse_qs(parsed.query)
                    pid = params.get('pid', ['unknown'])[0]
                    filename = f"spec_sheet_{pid}.pdf"
                    logger.debug(f"Got PDF via printToPDF: {len(pdf_bytes)} bytes")
                    return pdf_bytes, filename
        except Exception as e:
            logger.debug(f"CDP printToPDF failed: {e}")

        # Method 3: Try JavaScript fetch with same-origin context
        try:
            result = driver.execute_async_script("""
                var callback = arguments[arguments.length - 1];
                fetch(arguments[0], {
                    credentials: 'include',
                    mode: 'cors'
                })
                .then(response => {
                    if (!response.ok) {
                        callback({error: 'HTTP ' + response.status});
                        return;
                    }
                    return response.arrayBuffer();
                })
                .then(buffer => {
                    if (!buffer) return;
                    let binary = '';
                    const bytes = new Uint8Array(buffer);
                    for (let i = 0; i < bytes.byteLength; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    callback({data: btoa(binary), size: bytes.byteLength});
                })
                .catch(err => callback({error: err.toString()}));
            """, url)

            if result and result.get('data'):
                pdf_bytes = base64.b64decode(result['data'])
                if pdf_bytes[:4] == b'%PDF':
                    parsed = urlparse(url)
                    params = parse_qs(parsed.query)
                    pid = params.get('pid', ['unknown'])[0]
                    filename = f"spec_sheet_{pid}.pdf"
                    logger.debug(f"Got PDF via JS fetch: {len(pdf_bytes)} bytes")
                    return pdf_bytes, filename
                else:
                    logger.debug(f"JS fetch returned non-PDF: first bytes = {pdf_bytes[:20]}")
            elif result and result.get('error'):
                logger.debug(f"JS fetch error: {result['error']}")

        except Exception as e:
            logger.debug(f"JavaScript fetch failed: {e}")

        # Method 4: Check download directory for downloaded file
        download_dir = tempfile.gettempdir()
        time.sleep(2)

        for f in os.listdir(download_dir):
            if f.endswith('.pdf'):
                filepath = os.path.join(download_dir, f)
                if time.time() - os.path.getmtime(filepath) < 30:
                    with open(filepath, 'rb') as pdf_file:
                        pdf_bytes = pdf_file.read()
                    os.remove(filepath)
                    logger.debug(f"Got PDF from download dir: {f}")
                    return pdf_bytes, f

        logger.warning(f"Could not download PDF from: {url}")
        return None, None

    except Exception as e:
        logger.error(f"Selenium error downloading PDF from {url}: {e}")
        return None, None


def download_pdf(url: str) -> Tuple[Optional[bytes], Optional[str]]:
    """
    Download PDF from a redirect URL using Selenium.
    Returns (pdf_bytes, filename) or (None, None) on failure.
    """
    return download_pdf_with_selenium(url)


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
                "fileSize": str(len(pdf_bytes)),
                "httpMethod": "PUT"
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
        parameters = target['parameters']

        # Step 2: Upload the file to the staged URL using PUT
        # With httpMethod: PUT, we send the file directly with Content-Type
        upload_headers = {
            'Content-Type': 'application/pdf',
            'Content-Length': str(len(pdf_bytes))
        }

        # Add any required headers from parameters
        for param in parameters:
            if param['name'].lower().startswith('x-') or param['name'].lower() == 'acl':
                upload_headers[param['name']] = param['value']

        upload_response = requests.put(upload_url, data=pdf_bytes, headers=upload_headers, timeout=120)

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
    config = get_shopify_config()

    logger.info("Fetching products from Unassigned sheet...")
    sheet_manager = get_unassigned_products_manager()
    products = sheet_manager.get_all_products()

    if not products:
        logger.info("No products found in sheet")
        return

    logger.info(f"Found {len(products)} products in sheet")

    # Find products with redirect URLs, separating skipped (Cloudflare) from processable
    products_to_fix = []
    skipped_products = []

    for product in products:
        spec_sheet = product.get('shopify_spec_sheet', '')
        if is_redirect_url(spec_sheet):
            if should_skip_url(spec_sheet):
                skipped_products.append(product)
            else:
                products_to_fix.append(product)

    logger.info(f"Found {len(products_to_fix)} products with redirect URLs to fix")
    logger.info(f"Skipping {len(skipped_products)} products with Cloudflare-protected URLs")

    # Export skipped products to CSV for manual handling
    if skipped_products:
        skipped_file = 'skipped_spec_sheets.csv'
        with open(skipped_file, 'w') as f:
            f.write("product_id,sku,title,spec_sheet_url\n")
            for product in skipped_products:
                product_id = product.get('id', '')
                sku = product.get('variant_sku', '').replace(',', ' ').replace('"', "'")
                title = product.get('title', '').replace(',', ' ').replace('"', "'")
                spec_url = product.get('shopify_spec_sheet', '')
                f.write(f'{product_id},"{sku}","{title}",{spec_url}\n')
        logger.info(f"Exported {len(skipped_products)} skipped products to {skipped_file}")
        logger.info("These URLs are Cloudflare-protected and need manual downloading")

    if not products_to_fix:
        logger.info("No processable redirect URLs found - nothing to do")
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

    # Clean up Selenium driver
    close_selenium_driver()

    logger.info("=" * 50)
    logger.info(f"Complete! Fixed: {fixed_count}, Failed: {failed_count}")
    if skipped_products:
        logger.info(f"Skipped: {len(skipped_products)} (Cloudflare-protected - see skipped_spec_sheets.csv)")
    logger.info("Run sync_unassigned_products.py again to update the sheet with new URLs")


if __name__ == "__main__":
    try:
        main()
    finally:
        close_selenium_driver()
