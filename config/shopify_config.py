# config/shopify_config.py
"""
Shopify Integration Configuration
Handles Shopify API connection and settings
"""

import os
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

class ShopifyConfig:
    """Shopify configuration and validation"""

    def __init__(self):
        # Force reload environment variables for debugging
        from dotenv import load_dotenv
        load_dotenv(override=True)

        # Debug the environment variables
        raw_enabled = os.getenv('SHOPIFY_ENABLED', 'false')
        print(f"🔍 SHOPIFY_ENABLED raw: '{raw_enabled}'")
        print(f"🔍 SHOPIFY_ENABLED type: {type(raw_enabled)}")
        print(f"🔍 SHOPIFY_ENABLED lower: '{raw_enabled.lower()}'")

        # Shopify API credentials from environment
        self.SHOPIFY_SHOP_URL = os.getenv('SHOPIFY_SHOP_URL', '')  # e.g., 'your-shop.myshopify.com'
        self.SHOPIFY_ACCESS_TOKEN = os.getenv('SHOPIFY_ACCESS_TOKEN', '')
        self.SHOPIFY_API_VERSION = os.getenv('SHOPIFY_API_VERSION', '2024-01')

        # Debug the credentials
        print(f"🔍 SHOPIFY_SHOP_URL: '{self.SHOPIFY_SHOP_URL}'")
        print(f"🔍 SHOPIFY_ACCESS_TOKEN: {'✅ Set' if self.SHOPIFY_ACCESS_TOKEN else '❌ Missing'}")

        # Shopify integration settings
        self.SHOPIFY_ENABLED = raw_enabled.lower().strip() == 'true'

        # If still not working, force enable for testing
        if not self.SHOPIFY_ENABLED:
            print("⚠️ Forcing SHOPIFY_ENABLED to True for debugging")
            self.SHOPIFY_ENABLED = True

        print(f"✅ Final SHOPIFY_ENABLED value: {self.SHOPIFY_ENABLED}")

        self.SHOPIFY_DEFAULT_STATUS = os.getenv('SHOPIFY_DEFAULT_STATUS', 'draft')  # 'draft' or 'active'
        self.SHOPIFY_DEFAULT_VENDOR = os.getenv('SHOPIFY_DEFAULT_VENDOR', 'Cass Brothers')
        self.SHOPIFY_IMAGE_SYNC_ENABLED = os.getenv('SHOPIFY_IMAGE_SYNC_ENABLED', 'true').lower() == 'true'

        # Product mapping settings
        self.SHOPIFY_ID_COLUMN = os.getenv('SHOPIFY_ID_COLUMN', 'Column D')  # Column containing Shopify product ID
        self.SHOPIFY_VARIANT_ID_COLUMN = os.getenv('SHOPIFY_VARIANT_ID_COLUMN', 'shopify_variant_id')

        # Image settings
        self.SHOPIFY_IMAGE_ALT_TEXT = os.getenv('SHOPIFY_IMAGE_ALT_TEXT', 'Product Image')
        self.SHOPIFY_MAX_IMAGES = int(os.getenv('SHOPIFY_MAX_IMAGES', '10'))

        # Webhook settings (optional)
        self.SHOPIFY_WEBHOOK_SECRET = os.getenv('SHOPIFY_WEBHOOK_SECRET', '')

        # Rate limiting
        self.SHOPIFY_RATE_LIMIT_DELAY = float(os.getenv('SHOPIFY_RATE_LIMIT_DELAY', '0.5'))  # seconds between API calls

        # Collection mappings (map your collection names to Shopify collection IDs)
        self.COLLECTION_MAPPINGS = self._load_collection_mappings()

        logger.info(f"🛍️ Shopify Config Loaded - Enabled: {self.SHOPIFY_ENABLED}")

    def _load_collection_mappings(self) -> Dict[str, Optional[str]]:
        """Load collection mappings from environment variables"""
        return {
            'sinks': os.getenv('SHOPIFY_COLLECTION_SINKS', None),
            'taps': os.getenv('SHOPIFY_COLLECTION_TAPS', None),
            'lighting': os.getenv('SHOPIFY_COLLECTION_LIGHTING', None),
            # Add more collections as needed
        }

    def get_base_url(self) -> str:
        """Get the base Shopify API URL"""
        if not self.SHOPIFY_SHOP_URL:
            return ''

        # Ensure proper format
        shop_url = self.SHOPIFY_SHOP_URL
        if not shop_url.startswith('https://'):
            shop_url = f"https://{shop_url}"
        if not shop_url.endswith('.myshopify.com'):
            if not shop_url.endswith('.myshopify.com/'):
                shop_url = f"{shop_url}.myshopify.com" if not '.myshopify.com' in shop_url else shop_url

        return f"{shop_url}/admin/api/{self.SHOPIFY_API_VERSION}"

    def get_headers(self) -> Dict[str, str]:
        """Get headers for Shopify API requests"""
        return {
            'X-Shopify-Access-Token': self.SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }

    def is_configured(self) -> tuple[bool, str]:
        """Check if Shopify is properly configured"""
        if not self.SHOPIFY_ENABLED:
            return False, "Shopify integration is disabled"

        if not self.SHOPIFY_SHOP_URL:
            return False, "SHOPIFY_SHOP_URL not configured"

        if not self.SHOPIFY_ACCESS_TOKEN:
            return False, "SHOPIFY_ACCESS_TOKEN not configured"

        return True, "Shopify configuration is valid"

    def get_collection_id(self, collection_name: str) -> Optional[str]:
        """Get Shopify collection ID for a given collection name"""
        return self.COLLECTION_MAPPINGS.get(collection_name)

# Global instance
shopify_config = ShopifyConfig()

def get_shopify_config() -> ShopifyConfig:
    """Get the global Shopify configuration instance"""
    return shopify_config