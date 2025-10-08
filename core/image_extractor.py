"""
Image Extraction Utility
Extracts product images from supplier URLs using og:image meta tags
"""

import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def extract_og_image(url: str, timeout: int = 10) -> Optional[str]:
    """
    Extract og:image meta tag from a URL

    Args:
        url: Product page URL
        timeout: Request timeout in seconds

    Returns:
        Image URL or None if not found
    """
    try:
        # Set user agent to avoid being blocked
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }

        response = requests.get(url, headers=headers, timeout=timeout)
        response.raise_for_status()

        soup = BeautifulSoup(response.content, 'html.parser')

        # Try og:image first (most common)
        og_image = soup.find('meta', property='og:image')
        if og_image and og_image.get('content'):
            image_url = og_image['content']
            # Make absolute URL if relative
            return urljoin(url, image_url)

        # Try twitter:image as fallback
        twitter_image = soup.find('meta', property='twitter:image')
        if twitter_image and twitter_image.get('content'):
            image_url = twitter_image['content']
            return urljoin(url, image_url)

        # Try name="twitter:image" as another fallback
        twitter_image_name = soup.find('meta', attrs={'name': 'twitter:image'})
        if twitter_image_name and twitter_image_name.get('content'):
            image_url = twitter_image_name['content']
            return urljoin(url, image_url)

        # Try to find main product image in img tags as final fallback
        # Look for images with specific classes or in specific containers
        product_image = None

        # Try common product image patterns
        for selector in [
            'img[alt*="product"]',  # Alt text contains "product"
            'img[class*="product"]',  # Class contains "product"
            'img[src*="wp-content/uploads"]',  # WordPress uploads (common for WooCommerce)
            'div[class*="product"] img:first-of-type',  # First image in product div
            'figure img',  # Images in figure tags
        ]:
            img = soup.select_one(selector)
            if img and img.get('src'):
                src = img['src']
                # Filter out small images (likely icons/thumbnails < 100px)
                if 'icon' not in src.lower() and 'logo' not in src.lower():
                    product_image = urljoin(url, src)
                    logger.info(f"Found product image via fallback selector: {selector}")
                    return product_image

        # Final fallback: Find the largest image on the page that's not a logo/icon
        # This works for sites without semantic markup
        all_images = soup.find_all('img')
        candidate_images = []

        for img in all_images:
            src = img.get('src') or img.get('data-src')
            if not src:
                continue

            src_lower = src.lower()
            # Skip common non-product images
            if any(skip in src_lower for skip in ['logo', 'icon', 'banner', 'header', 'footer', 'sprite']):
                continue

            # Try to get image dimensions from attributes
            width = img.get('width')
            height = img.get('height')

            # Estimate size (larger images are more likely to be product images)
            try:
                size = int(width or 0) * int(height or 0)
            except (ValueError, TypeError):
                size = 0

            # If no dimensions, check if filename suggests product image
            is_likely_product = any(indicator in src_lower for indicator in [
                '/files/',  # Common upload path
                '/media/',
                '/images/',
                '/uploads/',
                '/product',
                '.jpg',
                '.png'
            ])

            if size > 10000 or (is_likely_product and size > 0):  # At least 100x100 or looks like product
                candidate_images.append((size, urljoin(url, src)))

        # Return the largest candidate image
        if candidate_images:
            candidate_images.sort(reverse=True)  # Largest first
            product_image = candidate_images[0][1]
            logger.info(f"Found product image via size heuristic: {product_image}")
            return product_image

        logger.warning(f"No image found for: {url}")
        return None

    except requests.exceptions.Timeout:
        logger.error(f"Timeout extracting image from: {url}")
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching URL {url}: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error extracting image: {e}")
        return None


def extract_images_batch(urls: list, max_workers: int = 5) -> dict:
    """
    Extract images from multiple URLs concurrently

    Args:
        urls: List of URLs to extract from
        max_workers: Maximum concurrent requests

    Returns:
        Dict mapping URL to image URL (or None)
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    results = {}

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks
        future_to_url = {executor.submit(extract_og_image, url): url for url in urls}

        # Collect results as they complete
        for future in as_completed(future_to_url):
            url = future_to_url[future]
            try:
                image_url = future.result()
                results[url] = image_url
            except Exception as e:
                logger.error(f"Error processing {url}: {e}")
                results[url] = None

    return results


# For testing
if __name__ == '__main__':
    # Test with a sample product URL
    test_url = "https://www.example.com/product"
    image = extract_og_image(test_url)
    print(f"Extracted image: {image}")
