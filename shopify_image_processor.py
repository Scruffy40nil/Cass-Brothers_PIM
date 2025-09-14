#!/usr/bin/env python3
"""
Shopify Image Processor for Google Sheets - File Upload Version
Downloads images from column AF (Image URL), processes them, uploads to Shopify Files,
and replaces the URL in the same column AF with the new Shopify-hosted URL.
"""

import os
import json
import time
import logging
import requests
import numpy as np
import cv2
from PIL import Image
from io import BytesIO
import base64
import gspread
from google.oauth2.service_account import Credentials
from dotenv import load_dotenv
import warnings

warnings.filterwarnings("ignore")

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('shopify_image_processor.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================

class Config:
    # Shopify API credentials
    SHOPIFY_API_PASSWORD = os.environ.get('SHOPIFY_API_PASSWORD', '')  # Admin API access token
    SHOPIFY_SHOP_NAME = os.environ.get('SHOPIFY_SHOP_NAME', '')  # Your shop name (without .myshopify.com)
    
    # Google Sheets credentials (reusing from your existing setup)
    GOOGLE_CREDENTIALS_JSON = os.environ.get('GOOGLE_CREDENTIALS_JSON', '')
    SINKS_SPREADSHEET_ID = os.environ.get('SINKS_SPREADSHEET_ID', '')
    
    # Spreadsheet configuration
    WORKSHEET_NAME = 'Raw_Data'  # Same as your existing setup
    IMAGE_URL_COLUMN = 32  # Column AF (A=1, B=2, ... AF=32)
    
    # Image processing settings
    IMAGE_SIZE = (1080, 1080)  # Target image size
    ADD_MARGIN = True  # Add 70px margin
    IMAGE_QUALITY = 95  # JPEG quality
    
    # Shopify API settings
    API_VERSION = '2024-07'

config = Config()

# =============================================================================
# SHOPIFY MANAGER (Direct REST API)
# =============================================================================

# =============================================================================
# SHOPIFY MANAGER (Complete Updated Version)
# =============================================================================

class ShopifyManager:
    def __init__(self):
        self.shop_url = f"https://{config.SHOPIFY_SHOP_NAME}.myshopify.com"
        self.headers = {
            'X-Shopify-Access-Token': config.SHOPIFY_API_PASSWORD,
            'Content-Type': 'application/json'
        }
        self.test_connection()
        self.debug_available_endpoints()
    
    def test_connection(self):
        """Test Shopify API connection and file permissions"""
        try:
            if not config.SHOPIFY_API_PASSWORD or not config.SHOPIFY_SHOP_NAME:
                logger.error("❌ Missing required Shopify credentials: SHOPIFY_API_PASSWORD and SHOPIFY_SHOP_NAME")
                return False
            
            # Test connection by getting shop info
            url = f"{self.shop_url}/admin/api/{config.API_VERSION}/shop.json"
            
            # DEBUG: Print exactly what we're sending
            print(f"🔍 DEBUG - URL: {url}")
            print(f"🔍 DEBUG - Headers: {self.headers}")
            print(f"🔍 DEBUG - Shop Name from config: '{config.SHOPIFY_SHOP_NAME}'")
            print(f"🔍 DEBUG - Token from config: '{config.SHOPIFY_API_PASSWORD[:15]}...'")
            print(f"🔍 DEBUG - Shop URL: {self.shop_url}")
            
            response = requests.get(url, headers=self.headers, timeout=30)
            
            print(f"🔍 DEBUG - Response Status: {response.status_code}")
            print(f"🔍 DEBUG - Response Text: {response.text[:200]}...")
            
            if response.status_code == 200:
                shop_data = response.json()
                logger.info(f"✅ Connected to Shopify shop: {shop_data['shop']['name']}")
                
                # Test file permissions by trying to list files
                files_url = f"{self.shop_url}/admin/api/{config.API_VERSION}/files.json?limit=1"
                files_response = requests.get(files_url, headers=self.headers, timeout=30)
                
                if files_response.status_code == 200:
                    logger.info("✅ File upload permissions verified")
                    return True
                else:
                    logger.warning(f"⚠️ Files API access may be limited: {files_response.status_code}")
                    logger.warning("Make sure your private app has 'read_files' and 'write_files' scopes")
                    return True  # Still try to proceed
            else:
                logger.error(f"❌ Shopify connection failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Shopify connection error: {e}")
            return False
    
    def debug_available_endpoints(self):
        """Test what endpoints are available"""
        endpoints_to_test = [
            f"/admin/api/{config.API_VERSION}/files.json",
            f"/admin/api/{config.API_VERSION}/assets.json", 
            f"/admin/api/{config.API_VERSION}/themes.json",
            f"/admin/api/2023-10/files.json",
            f"/admin/api/2023-07/files.json",
            f"/admin/api/2023-04/files.json"
        ]
        
        logger.info("🔍 Testing available endpoints...")
        
        for endpoint in endpoints_to_test:
            try:
                url = f"{self.shop_url}{endpoint}"
                response = requests.get(url, headers=self.headers, timeout=30)
                logger.info(f"📍 {endpoint}: Status {response.status_code}")
                
                if response.status_code == 200:
                    logger.info(f"✅ {endpoint} is available!")
                elif response.status_code == 404:
                    logger.info(f"❌ {endpoint} not found")
                elif response.status_code == 401:
                    logger.info(f"🔒 {endpoint} requires different permissions")
                else:
                    logger.info(f"⚠️ {endpoint} returned {response.status_code}")
                    
            except Exception as e:
                logger.error(f"❌ Error testing {endpoint}: {e}")
    
    def upload_image_as_file(self, img_bytes, filename):
        """Upload image to Shopify Files database using multiple approaches"""
        
        # Try Approach 1: Standard Files API
        logger.info(f"🔄 Trying Files API approach 1 for {filename}")
        result = self._try_files_api_v1(img_bytes, filename)
        if result:
            return result
        
        # Try Approach 2: Different content type
        logger.info(f"🔄 Trying Files API approach 2 for {filename}")
        result = self._try_files_api_v2(img_bytes, filename)
        if result:
            return result
        
        # Try Approach 3: Multipart form data
        logger.info(f"🔄 Trying Files API approach 3 for {filename}")
        result = self._try_files_api_v3(img_bytes, filename)
        if result:
            return result
        
        # Try Approach 4: Different API version
        logger.info(f"🔄 Trying Files API approach 4 for {filename}")
        result = self._try_files_api_v4(img_bytes, filename)
        if result:
            return result
        
        # Try Approach 5: Theme Assets
        logger.info(f"🔄 Trying Assets API approach for {filename}")
        result = self.upload_via_assets(img_bytes, filename)
        if result:
            return result
        
        logger.error(f"❌ All upload approaches failed for {filename}")
        return None
    
    def _try_files_api_v1(self, img_bytes, filename):
        """Standard Files API approach"""
        try:
            img_base64 = base64.b64encode(img_bytes).decode('utf-8')
            
            file_data = {
                "file": {
                    "attachment": img_base64,
                    "filename": filename,
                    "content_type": "image/jpeg"
                }
            }
            
            url = f"{self.shop_url}/admin/api/{config.API_VERSION}/files.json"
            response = requests.post(url, headers=self.headers, json=file_data, timeout=60)
            
            if response.status_code in [200, 201]:
                result = response.json()
                return result['file']['public_url']
            else:
                logger.warning(f"Files API v1 failed: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.warning(f"Files API v1 exception: {e}")
            return None
    
    def _try_files_api_v2(self, img_bytes, filename):
        """Files API with different structure"""
        try:
            img_base64 = base64.b64encode(img_bytes).decode('utf-8')
            
            # Different data structure
            file_data = {
                "attachment": img_base64,
                "filename": filename,
                "content_type": "image/jpeg"
            }
            
            url = f"{self.shop_url}/admin/api/{config.API_VERSION}/files.json"
            response = requests.post(url, headers=self.headers, json=file_data, timeout=60)
            
            if response.status_code in [200, 201]:
                result = response.json()
                return result.get('public_url') or result.get('url') or result.get('src')
            else:
                logger.warning(f"Files API v2 failed: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.warning(f"Files API v2 exception: {e}")
            return None
    
    def _try_files_api_v3(self, img_bytes, filename):
        """Files API with multipart form data"""
        try:
            # Prepare multipart form data
            files = {
                'file': (filename, img_bytes, 'image/jpeg')
            }
            
            # Remove Content-Type header for multipart
            headers = {
                'X-Shopify-Access-Token': config.SHOPIFY_API_PASSWORD
            }
            
            url = f"{self.shop_url}/admin/api/{config.API_VERSION}/files.json"
            response = requests.post(url, headers=headers, files=files, timeout=60)
            
            if response.status_code in [200, 201]:
                result = response.json()
                return result['file']['public_url']
            else:
                logger.warning(f"Files API v3 failed: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.warning(f"Files API v3 exception: {e}")
            return None
    
    def _try_files_api_v4(self, img_bytes, filename):
        """Files API with different API version"""
        try:
            img_base64 = base64.b64encode(img_bytes).decode('utf-8')
            
            file_data = {
                "file": {
                    "attachment": img_base64,
                    "filename": filename
                }
            }
            
            # Try with older API version
            url = f"{self.shop_url}/admin/api/2023-10/files.json"
            response = requests.post(url, headers=self.headers, json=file_data, timeout=60)
            
            if response.status_code in [200, 201]:
                result = response.json()
                return result['file']['public_url']
            else:
                logger.warning(f"Files API v4 failed: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.warning(f"Files API v4 exception: {e}")
            return None
    
    def upload_via_assets(self, img_bytes, filename):
        """Upload image via Theme Assets (alternative to Files API)"""
        try:
            # First, get the main theme
            themes_url = f"{self.shop_url}/admin/api/{config.API_VERSION}/themes.json"
            themes_response = requests.get(themes_url, headers=self.headers, timeout=30)
            
            if themes_response.status_code != 200:
                logger.error(f"❌ Cannot access themes: {themes_response.status_code}")
                return None
            
            themes = themes_response.json()['themes']
            main_theme = next((t for t in themes if t['role'] == 'main'), None)
            
            if not main_theme:
                logger.error("❌ No main theme found")
                return None
            
            theme_id = main_theme['id']
            logger.info(f"📄 Using theme: {main_theme['name']} (ID: {theme_id})")
            
            # Upload image as theme asset
            img_base64 = base64.b64encode(img_bytes).decode('utf-8')
            
            # Store in assets/uploads/ folder
            asset_key = f"assets/uploads/{filename}"
            
            asset_data = {
                "asset": {
                    "key": asset_key,
                    "attachment": img_base64
                }
            }
            
            assets_url = f"{self.shop_url}/admin/api/{config.API_VERSION}/themes/{theme_id}/assets.json"
            asset_response = requests.put(assets_url, headers=self.headers, json=asset_data, timeout=60)
            
            if asset_response.status_code in [200, 201]:
                # Construct the public URL
                public_url = f"https://cdn.shopify.com/s/files/1/{config.SHOPIFY_SHOP_NAME}/files/{filename}"
                
                logger.info(f"✅ Uploaded {filename} to theme assets")
                return public_url
            else:
                logger.error(f"❌ Assets upload failed: {asset_response.status_code} - {asset_response.text}")
                return None
                
        except Exception as e:
            logger.error(f"❌ Assets upload error: {e}")
            return None
# =============================================================================
# GOOGLE SHEETS MANAGER (Same as before)
# =============================================================================

class GoogleSheetsManager:
    def __init__(self):
        self.gc = None
        self.setup_credentials()
    
    def setup_credentials(self):
        """Setup Google Sheets authentication"""
        try:
            if config.GOOGLE_CREDENTIALS_JSON:
                if config.GOOGLE_CREDENTIALS_JSON.startswith('{'):
                    creds_dict = json.loads(config.GOOGLE_CREDENTIALS_JSON)
                else:
                    with open(config.GOOGLE_CREDENTIALS_JSON, 'r') as f:
                        creds_dict = json.load(f)
                
                creds = Credentials.from_service_account_info(
                    creds_dict,
                    scopes=['https://www.googleapis.com/auth/spreadsheets']
                )
                self.gc = gspread.authorize(creds)
                logger.info("✅ Google Sheets authentication successful")
                return True
            else:
                logger.error("❌ No Google credentials found in environment")
                return False
                
        except Exception as e:
            logger.error(f"❌ Google Sheets authentication failed: {e}")
            return False
    
    def get_spreadsheet(self):
        """Get the spreadsheet"""
        if not self.gc or not config.SINKS_SPREADSHEET_ID:
            logger.error("❌ No Google Sheets client or spreadsheet ID")
            return None
        try:
            return self.gc.open_by_key(config.SINKS_SPREADSHEET_ID)
        except Exception as e:
            logger.error(f"Error accessing spreadsheet: {e}")
            return None
    
    def get_image_urls_to_process(self):
        """Get rows that have image URLs in column AF"""
        spreadsheet = self.get_spreadsheet()
        if not spreadsheet:
            return []
        
        try:
            worksheet = spreadsheet.worksheet(config.WORKSHEET_NAME)
            
            # Get all values
            all_values = worksheet.get_all_values()
            
            urls_to_process = []
            for i, row_data in enumerate(all_values[1:], start=2):  # Skip header, start at row 2
                if len(row_data) >= config.IMAGE_URL_COLUMN:
                    image_url = row_data[config.IMAGE_URL_COLUMN - 1].strip()  # Column AF
                    
                    if image_url and image_url.startswith('http'):
                        # Get SKU for filename generation
                        sku = row_data[1].strip() if len(row_data) > 1 else ''  # Column B (sku)
                        
                        urls_to_process.append({
                            'row_num': i,
                            'image_url': image_url,
                            'sku': sku
                        })
            
            logger.info(f"📋 Found {len(urls_to_process)} images to process")
            return urls_to_process
            
        except Exception as e:
            logger.error(f"Error reading image URLs: {e}")
            return []
    
    def update_image_url(self, row_num, new_url):
        """Update the image URL in column AF"""
        spreadsheet = self.get_spreadsheet()
        if not spreadsheet:
            return False
        
        try:
            worksheet = spreadsheet.worksheet(config.WORKSHEET_NAME)
            worksheet.update_cell(row_num, config.IMAGE_URL_COLUMN, new_url)
            logger.info(f"✅ Updated row {row_num} column AF with new URL")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to update row {row_num}: {e}")
            return False

# =============================================================================
# IMAGE PROCESSOR (Same as before)
# =============================================================================

class ImageProcessor:
    @staticmethod
    def resize_and_center_image(img, bg_size, add_margin):
        """Resize and center image with optional margin"""
        img_height, img_width = img.shape[:2]
        bg_height, bg_width = bg_size
        margin = 70 if add_margin else 0
        
        # Calculate new dimensions maintaining aspect ratio
        if img_height > img_width:
            new_height = bg_height - 2 * margin
            new_width = int(img_width * new_height / img_height)
        else:
            new_width = bg_width - 2 * margin
            new_height = int(img_height * new_width / img_width)
        
        # Resize image
        resized_img = cv2.resize(img, (new_width, new_height))
        
        # Create white canvas
        canvas = np.ones((bg_height, bg_width, 3), dtype=np.uint8) * 255
        
        # Center image on canvas
        y_offset = (bg_height - new_height) // 2
        x_offset = (bg_width - new_width) // 2
        canvas[y_offset:y_offset + new_height, x_offset:x_offset + new_width] = resized_img
        
        return canvas
    
    @staticmethod
    def create_image_from_url(url, bg_size, add_margin):
        """Download and process image from URL"""
        try:
            logger.info(f"📥 Downloading image from: {url}")
            
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            
            # Convert to OpenCV image
            img_arr = np.asarray(bytearray(response.content), dtype="uint8")
            img = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)
            
            if img is None:
                logger.error(f"❌ Could not decode image from {url}")
                return None
            
            # Process image
            processed = ImageProcessor.resize_and_center_image(img, bg_size, add_margin)
            
            # Convert to PIL and create bytes
            # Convert BGR to RGB for PIL
            processed_rgb = cv2.cvtColor(processed, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(processed_rgb)
            
            byte_io = BytesIO()
            pil_img.save(byte_io, 'JPEG', quality=config.IMAGE_QUALITY)
            
            logger.info(f"✅ Successfully processed image from {url}")
            return byte_io.getvalue()
            
        except Exception as e:
            logger.error(f"❌ Error processing image from {url}: {e}")
            return None

# =============================================================================
# MAIN PROCESSOR
# =============================================================================

class ImageUploadProcessor:
    def __init__(self):
        self.sheets_manager = GoogleSheetsManager()
        self.shopify_manager = ShopifyManager()
        self.image_processor = ImageProcessor()
    
    def process_all_images(self, selected_rows=None):
        """Process all images or selected rows"""
        if not self.sheets_manager.gc:
            logger.error("❌ Google Sheets not connected")
            return False
        
        # Get images to process
        images_to_process = self.sheets_manager.get_image_urls_to_process()
        
        if selected_rows:
            images_to_process = [
                img for img in images_to_process 
                if img['row_num'] in selected_rows
            ]
            logger.info(f"🎯 Processing {len(images_to_process)} selected rows")
        
        if not images_to_process:
            logger.info("📭 No images to process")
            return True
        
        logger.info(f"🚀 Starting processing of {len(images_to_process)} images")
        
        results = []
        
        for i, item in enumerate(images_to_process):
            row_num = item['row_num']
            image_url = item['image_url']
            sku = item['sku']
            
            logger.info(f"📷 Processing {i+1}/{len(images_to_process)}: Row {row_num}")
            
            try:
                # Generate filename
                filename = f"{sku}_processed.jpg" if sku else f"image_row_{row_num}_processed.jpg"
                
                # Download and process image
                img_bytes = self.image_processor.create_image_from_url(
                    image_url, 
                    config.IMAGE_SIZE, 
                    config.ADD_MARGIN
                )
                
                if not img_bytes:
                    results.append({
                        'row': row_num,
                        'success': False,
                        'error': 'Failed to process image'
                    })
                    continue
                
                # Upload to Shopify as standalone file
                new_url = self.shopify_manager.upload_image_as_file(img_bytes, filename)
                
                if new_url:
                    # Update Google Sheet with new URL
                    update_success = self.sheets_manager.update_image_url(row_num, new_url)
                    
                    results.append({
                        'row': row_num,
                        'success': update_success,
                        'new_url': new_url,
                        'message': 'Image processed and uploaded to Shopify Files'
                    })
                else:
                    results.append({
                        'row': row_num,
                        'success': False,
                        'error': 'Failed to upload to Shopify Files'
                    })
                
                # Add delay to avoid rate limiting
                time.sleep(2)
                
            except Exception as e:
                logger.error(f"❌ Error processing row {row_num}: {e}")
                results.append({
                    'row': row_num,
                    'success': False,
                    'error': str(e)
                })
        
        # Log summary
        successful = [r for r in results if r['success']]
        failed = [r for r in results if not r['success']]
        
        logger.info(f"🎉 Processing complete: {len(successful)} successful, {len(failed)} failed")
        
        return {
            'success': True,
            'total_processed': len(results),
            'successful': len(successful),
            'failed': len(failed),
            'results': results
        }

# =============================================================================
# MAIN EXECUTION
# =============================================================================

def main():
    """Main execution function"""
    logger.info("🚀 Starting Shopify Image Processor (File Upload Version)")
    
    # Check configuration
    if not config.SHOPIFY_API_PASSWORD or not config.SHOPIFY_SHOP_NAME:
        logger.error("❌ Missing required Shopify credentials in environment variables:")
        logger.error("   SHOPIFY_API_PASSWORD (Admin API access token)")
        logger.error("   SHOPIFY_SHOP_NAME (your shop name without .myshopify.com)")
        logger.error("Create a private app in Shopify Admin > Apps > Develop apps")
        logger.error("Required scopes: read_files, write_files")
        return
    
    if not config.GOOGLE_CREDENTIALS_JSON:
        logger.error("❌ Missing Google credentials in environment variables")
        return
    
    # Initialize processor
    processor = ImageUploadProcessor()
    
    # Process all images
    result = processor.process_all_images()
    
    if result:
        logger.info(f"✅ Processing completed successfully")
        logger.info(f"📊 Summary: {result['successful']}/{result['total_processed']} images processed and uploaded to Shopify Files")
    else:
        logger.error("❌ Processing failed")

if __name__ == "__main__":
    main()
    print("🏁 Done.")