# core/shopify_manager.py
"""
Shopify Manager - Handles all Shopify API operations
Integrates with the PIM system to sync product data
"""

import requests
import json
import time
import logging
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
from config.shopify_config import get_shopify_config

logger = logging.getLogger(__name__)

@dataclass
class ShopifyProduct:
    """Shopify product data structure"""
    id: Optional[str] = None
    title: str = ""
    body_html: str = ""
    vendor: str = ""
    product_type: str = ""
    status: str = "draft"  # draft, active
    tags: str = ""
    images: List[Dict] = None
    variants: List[Dict] = None
    handle: str = ""
    seo_title: str = ""
    seo_description: str = ""
    
    def __post_init__(self):
        if self.images is None:
            self.images = []
        if self.variants is None:
            self.variants = []

class ShopifyManager:
    """Manages Shopify API operations for the PIM system"""
    
    def __init__(self):
        self.config = get_shopify_config()
        self.session = requests.Session()
        self.session.headers.update(self.config.get_headers())
        self.base_url = self.config.get_base_url()
        
        logger.info("🛍️ Shopify Manager initialized")
    
    def test_connection(self) -> Tuple[bool, str]:
        """Test connection to Shopify API"""
        is_configured, message = self.config.is_configured()
        if not is_configured:
            return False, message
        
        try:
            url = f"{self.base_url}/shop.json"
            response = self.session.get(url)
            
            if response.status_code == 200:
                shop_data = response.json()
                shop_name = shop_data.get('shop', {}).get('name', 'Unknown')
                return True, f"Connected to Shopify store: {shop_name}"
            else:
                return False, f"Shopify API error: {response.status_code} - {response.text}"
                
        except Exception as e:
            logger.error(f"❌ Shopify connection test failed: {e}")
            return False, f"Connection failed: {str(e)}"
    
    def get_product_by_id(self, product_id: str) -> Optional[ShopifyProduct]:
        """Get a product from Shopify by ID"""
        if not product_id:
            return None
        
        try:
            url = f"{self.base_url}/products/{product_id}.json"
            response = self.session.get(url)
            
            if response.status_code == 200:
                product_data = response.json().get('product', {})
                return self._convert_to_shopify_product(product_data)
            elif response.status_code == 404:
                logger.warning(f"⚠️ Product {product_id} not found in Shopify")
                return None
            else:
                logger.error(f"❌ Error fetching product {product_id}: {response.status_code}")
                return None
                
        except Exception as e:
            logger.error(f"❌ Error fetching product {product_id} from Shopify: {e}")
            return None
    
    def create_product(self, product_data: Dict[str, Any], collection_name: str = None) -> Tuple[bool, Optional[str], str]:
        """Create a new product in Shopify"""
        try:
            # Build Shopify product payload
            shopify_product = self._build_shopify_product_payload(product_data, collection_name)
            
            url = f"{self.base_url}/products.json"
            payload = {"product": shopify_product}
            
            response = self.session.post(url, json=payload)
            
            if response.status_code == 201:
                created_product = response.json().get('product', {})
                product_id = str(created_product.get('id'))
                logger.info(f"✅ Created Shopify product: {product_id}")
                return True, product_id, "Product created successfully"
            else:
                error_msg = f"Failed to create product: {response.status_code} - {response.text}"
                logger.error(f"❌ {error_msg}")
                return False, None, error_msg
                
        except Exception as e:
            error_msg = f"Error creating product: {str(e)}"
            logger.error(f"❌ {error_msg}")
            return False, None, error_msg
    
    def update_product(self, product_id: str, product_data: Dict[str, Any], collection_name: str = None) -> Tuple[bool, str]:
        """Update an existing product in Shopify"""
        try:
            # Build Shopify product payload
            shopify_product = self._build_shopify_product_payload(product_data, collection_name)
            
            url = f"{self.base_url}/products/{product_id}.json"
            payload = {"product": shopify_product}
            
            response = self.session.put(url, json=payload)
            
            if response.status_code == 200:
                logger.info(f"✅ Updated Shopify product: {product_id}")
                return True, "Product updated successfully"
            else:
                error_msg = f"Failed to update product: {response.status_code} - {response.text}"
                logger.error(f"❌ {error_msg}")
                return False, error_msg
                
        except Exception as e:
            error_msg = f"Error updating product: {str(e)}"
            logger.error(f"❌ {error_msg}")
            return False, error_msg
    
    def sync_product_image(self, product_id: str, image_url: str, alt_text: str = None) -> Tuple[bool, str]:
        """Sync product image from URL to Shopify"""
        if not image_url or image_url.strip() == '' or image_url == '-':
            return False, "No image URL provided"
        
        try:
            # Check if image already exists
            existing_images = self.get_product_images(product_id)
            
            # Check if this image URL is already uploaded
            for img in existing_images:
                if img.get('src') == image_url:
                    logger.info(f"📸 Image already exists for product {product_id}")
                    return True, "Image already exists"
            
            # Add new image
            url = f"{self.base_url}/products/{product_id}/images.json"
            payload = {
                "image": {
                    "src": image_url,
                    "alt": alt_text or self.config.SHOPIFY_IMAGE_ALT_TEXT
                }
            }
            
            response = self.session.post(url, json=payload)
            
            if response.status_code == 201:
                logger.info(f"✅ Added image to Shopify product: {product_id}")
                return True, "Image synced successfully"
            else:
                error_msg = f"Failed to sync image: {response.status_code} - {response.text}"
                logger.error(f"❌ {error_msg}")
                return False, error_msg
                
        except Exception as e:
            error_msg = f"Error syncing image: {str(e)}"
            logger.error(f"❌ {error_msg}")
            return False, error_msg
    
    def get_product_images(self, product_id: str) -> List[Dict]:
        """Get all images for a product"""
        try:
            url = f"{self.base_url}/products/{product_id}/images.json"
            response = self.session.get(url)
            
            if response.status_code == 200:
                return response.json().get('images', [])
            else:
                logger.error(f"❌ Error fetching images for product {product_id}: {response.status_code}")
                return []
                
        except Exception as e:
            logger.error(f"❌ Error fetching images for product {product_id}: {e}")
            return []
    
    def pull_product_image_urls(self, product_id: str) -> List[str]:
        """Pull image URLs from Shopify for a product"""
        images = self.get_product_images(product_id)
        return [img.get('src', '') for img in images if img.get('src')]
    
    def set_product_status(self, product_id: str, status: str) -> Tuple[bool, str]:
        """Set product status (draft/active)"""
        if status not in ['draft', 'active']:
            return False, "Status must be 'draft' or 'active'"
        
        try:
            url = f"{self.base_url}/products/{product_id}.json"
            payload = {
                "product": {
                    "id": product_id,
                    "status": status
                }
            }
            
            response = self.session.put(url, json=payload)
            
            if response.status_code == 200:
                logger.info(f"✅ Set product {product_id} status to: {status}")
                return True, f"Product status set to {status}"
            else:
                error_msg = f"Failed to update status: {response.status_code} - {response.text}"
                logger.error(f"❌ {error_msg}")
                return False, error_msg
                
        except Exception as e:
            error_msg = f"Error updating status: {str(e)}"
            logger.error(f"❌ {error_msg}")
            return False, error_msg
    
    def delete_product(self, product_id: str) -> Tuple[bool, str]:
        """Delete a product from Shopify"""
        try:
            url = f"{self.base_url}/products/{product_id}.json"
            response = self.session.delete(url)
            
            if response.status_code == 200:
                logger.info(f"✅ Deleted Shopify product: {product_id}")
                return True, "Product deleted successfully"
            else:
                error_msg = f"Failed to delete product: {response.status_code} - {response.text}"
                logger.error(f"❌ {error_msg}")
                return False, error_msg
                
        except Exception as e:
            error_msg = f"Error deleting product: {str(e)}"
            logger.error(f"❌ {error_msg}")
            return False, error_msg
    
    def bulk_sync_images(self, products_data: Dict[str, Dict]) -> Dict[str, Any]:
        """Bulk sync images for multiple products"""
        results = {
            'successful': 0,
            'failed': 0,
            'skipped': 0,
            'details': []
        }
        
        for row_num, product in products_data.items():
            shopify_id = self._get_shopify_id(product)
            image_url = self._get_image_url(product)
            
            if not shopify_id:
                results['skipped'] += 1
                results['details'].append({
                    'row': row_num,
                    'status': 'skipped',
                    'message': 'No Shopify ID'
                })
                continue
            
            if not image_url:
                results['skipped'] += 1
                results['details'].append({
                    'row': row_num,
                    'status': 'skipped',
                    'message': 'No image URL'
                })
                continue
            
            # Rate limiting
            time.sleep(self.config.SHOPIFY_RATE_LIMIT_DELAY)
            
            success, message = self.sync_product_image(shopify_id, image_url, product.get('title', ''))
            
            if success:
                results['successful'] += 1
                results['details'].append({
                    'row': row_num,
                    'status': 'success',
                    'message': message
                })
            else:
                results['failed'] += 1
                results['details'].append({
                    'row': row_num,
                    'status': 'failed',
                    'message': message
                })
        
        return results

    def fetch_all_products(self, limit: int = 250, status: Optional[str] = None,
                            fields: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Retrieve every product from Shopify with pagination.
        Returns raw product dictionaries from Shopify.
        """
        is_configured, message = self.config.is_configured()
        if not is_configured:
            logger.error(f"Shopify not configured: {message}")
            return []

        params_base = {
            'limit': min(max(limit, 1), 250),
            'order': 'id asc'
        }
        if status:
            params_base['status'] = status
        if fields:
            params_base['fields'] = ','.join(fields)

        collected: List[Dict[str, Any]] = []
        since_id: Optional[int] = None

        while True:
            params = params_base.copy()
            if since_id:
                params['since_id'] = since_id

            response = self.session.get(f"{self.base_url}/products.json", params=params)
            if response.status_code != 200:
                logger.error(f"Failed to pull Shopify products: {response.status_code} - {response.text}")
                break

            batch = response.json().get('products', [])
            if not batch:
                break

            collected.extend(batch)
            since_id = batch[-1].get('id')

            logger.info(f"Fetched {len(collected)} Shopify products so far...")
            if len(batch) < params_base['limit']:
                break

            time.sleep(self.config.SHOPIFY_RATE_LIMIT_DELAY)

        logger.info(f"Total Shopify products fetched: {len(collected)}")
        return collected
    
    def _build_shopify_product_payload(self, product_data: Dict[str, Any], collection_name: str = None) -> Dict[str, Any]:
        """Build Shopify product payload from PIM data"""
        # Map PIM fields to Shopify fields
        shopify_product = {
            "title": product_data.get('title', ''),
            "body_html": product_data.get('body_html', ''),
            "vendor": product_data.get('vendor', self.config.SHOPIFY_DEFAULT_VENDOR),
            "product_type": self._get_product_type(collection_name),
            "status": self.config.SHOPIFY_DEFAULT_STATUS,
            "tags": product_data.get('tags', ''),
            "handle": self._generate_handle(product_data.get('title', ''), product_data.get('sku', '')),
            "seo_title": product_data.get('seo_title', ''),
            "seo_description": product_data.get('seo_description', '')
        }
        
        # Add variant with SKU and price
        variant = {
            "sku": product_data.get('sku', ''),
            "price": str(product_data.get('price', '0.00')),
            "inventory_management": "shopify",
            "inventory_policy": "deny"
        }
        
        if product_data.get('weight'):
            variant["weight"] = float(product_data.get('weight', 0))
            variant["weight_unit"] = "kg"
        
        shopify_product["variants"] = [variant]
        
        # Add image if available
        image_url = self._get_image_url(product_data)
        if image_url:
            shopify_product["images"] = [{
                "src": image_url,
                "alt": product_data.get('title', self.config.SHOPIFY_IMAGE_ALT_TEXT)
            }]
        
        return shopify_product
    
    def _convert_to_shopify_product(self, product_data: Dict) -> ShopifyProduct:
        """Convert Shopify API response to ShopifyProduct object"""
        return ShopifyProduct(
            id=str(product_data.get('id', '')),
            title=product_data.get('title', ''),
            body_html=product_data.get('body_html', ''),
            vendor=product_data.get('vendor', ''),
            product_type=product_data.get('product_type', ''),
            status=product_data.get('status', 'draft'),
            tags=product_data.get('tags', ''),
            images=product_data.get('images', []),
            variants=product_data.get('variants', []),
            handle=product_data.get('handle', ''),
            seo_title=product_data.get('seo_title', ''),
            seo_description=product_data.get('seo_description', '')
        )
    
    def _get_shopify_id(self, product_data: Dict) -> Optional[str]:
        """Extract Shopify ID from product data"""
        # Check multiple possible field names for Shopify ID
        possible_fields = [
            self.config.SHOPIFY_ID_COLUMN,
            'shopify_id',
            'Column D',
            'id',
            'shopify_product_id'
        ]
        
        for field in possible_fields:
            value = product_data.get(field)
            if value and str(value).strip() and str(value) != '-':
                return str(value).strip()
        
        return None
    
    def _get_image_url(self, product_data: Dict) -> Optional[str]:
        """Extract image URL from product data"""
        possible_fields = [
            'Image URL in AF',
            'image_url',
            'Image URL',
            'imageUrl',
            'image_link',
            'photo_url'
        ]
        
        for field in possible_fields:
            value = product_data.get(field)
            if value and str(value).strip() and str(value) != '-':
                return str(value).strip()
        
        return None
    
    def _get_product_type(self, collection_name: str) -> str:
        """Get product type based on collection"""
        if not collection_name:
            return ""
        
        type_mapping = {
            'sinks': 'Kitchen Sink',
            'taps': 'Kitchen Tap',
            'lighting': 'Lighting'
        }
        
        return type_mapping.get(collection_name, collection_name.title())
    
    def _generate_handle(self, title: str, sku: str) -> str:
        """Generate Shopify handle from title and SKU"""
        if title:
            base = title.lower()
        elif sku:
            base = sku.lower()
        else:
            base = "product"
        
        # Replace spaces and special characters with hyphens
        import re
        handle = re.sub(r'[^a-z0-9\-]', '-', base)
        handle = re.sub(r'-+', '-', handle)  # Remove multiple consecutive hyphens
        handle = handle.strip('-')  # Remove leading/trailing hyphens
        
        return handle[:100]  # Shopify handle limit

# Global instance
_shopify_manager = None

def get_shopify_manager() -> ShopifyManager:
    """Get the global Shopify manager instance"""
    global _shopify_manager
    if _shopify_manager is None:
        _shopify_manager = ShopifyManager()
    return _shopify_manager
