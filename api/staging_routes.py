"""
New Products Staging API Routes - Fixed with Persistent Storage and NaN Handling
Handles CSV upload, batch processing, and publishing workflow
"""

from flask import Blueprint, request, jsonify, current_app
import pandas as pd
import uuid
import json
import os
from datetime import datetime
import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor

# Create blueprint
staging_bp = Blueprint('staging', __name__, url_prefix='/api/<collection>/staging')

# File-based persistent storage
STAGING_DATA_FILE = '/home/cassbrothers/mysite/staging_data.json'

def clean_for_json(obj):
    """Clean data structure to remove NaN values before JSON serialization"""
    if isinstance(obj, dict):
        return {k: clean_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_for_json(v) for v in obj]
    elif pd.isna(obj):  # Check for NaN/None values
        return None
    elif isinstance(obj, float) and (obj != obj):  # Alternative NaN check
        return None
    else:
        return obj

def load_staging_data():
    """Load staging data from persistent file storage"""
    try:
        if os.path.exists(STAGING_DATA_FILE):
            with open(STAGING_DATA_FILE, 'r') as f:
                return json.load(f)
        return {}
    except Exception as e:
        current_app.logger.error(f"Error loading staging data: {e}")
        return {}

def save_staging_data(data):
    """Save staging data to persistent file storage"""
    try:
        # Clean NaN values before saving
        cleaned_data = clean_for_json(data)
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(STAGING_DATA_FILE), exist_ok=True)
        with open(STAGING_DATA_FILE, 'w') as f:
            json.dump(cleaned_data, f, indent=2)
        return True
    except Exception as e:
        current_app.logger.error(f"Error saving staging data: {e}")
        return False

def get_staging_data():
    """Get current staging data (loads from file each time)"""
    return load_staging_data()

def update_staging_product(staging_id, updates):
    """Update a specific staging product and save to file"""
    staging_data = load_staging_data()
    if staging_id in staging_data:
        # Clean updates before merging
        cleaned_updates = clean_for_json(updates)
        staging_data[staging_id].update(cleaned_updates)
        save_staging_data(staging_data)
        return True
    return False

def add_staging_product(staging_id, product_data):
    """Add a new staging product and save to file"""
    staging_data = load_staging_data()
    # Clean product data before adding
    cleaned_product_data = clean_for_json(product_data)
    staging_data[staging_id] = cleaned_product_data
    save_staging_data(staging_data)
    return True

def remove_staging_product(staging_id):
    """Remove a staging product and save to file"""
    staging_data = load_staging_data()
    if staging_id in staging_data:
        del staging_data[staging_id]
        save_staging_data(staging_data)
        return True
    return False

# Built-in collection configurations
COLLECTIONS_CONFIG = {
    'sinks': {
        'name': 'Sinks & Tubs',
        'description': 'Undermount, topmount, and specialty sinks',
        'fields': ['sku', 'title', 'brand_name', 'installation_type', 'product_material']
    },
    'taps': {
        'name': 'Taps & Faucets', 
        'description': 'Kitchen and bathroom taps',
        'fields': ['sku', 'title', 'brand_name', 'finish', 'style']
    },
    'lighting': {
        'name': 'Lighting',
        'description': 'Indoor and outdoor lighting solutions', 
        'fields': ['sku', 'title', 'brand_name', 'light_type', 'wattage']
    }
}

def get_collection_config(collection_name):
    """Get configuration for a specific collection"""
    return COLLECTIONS_CONFIG.get(collection_name, {
        'name': collection_name.title(),
        'description': f'{collection_name.title()} products',
        'fields': ['sku', 'title', 'brand_name']
    })

def safe_get(value, default=''):
    """Safely get a value, replacing NaN with default"""
    if pd.isna(value):
        return default
    return str(value).strip() if value else default

class MockAIExtractor:
    """Mock AI extractor for staging system"""
    
    def extract_from_url(self, url):
        """Simulate AI extraction from URL"""
        return {
            'title': 'AI Extracted Product Title',
            'sku': f'EXTRACTED-{str(uuid.uuid4())[:8].upper()}',
            'brand_name': 'Extracted Brand',
            'description': 'AI generated product description based on URL analysis',
            'features': 'Premium quality, Modern design, Easy installation',
            'material': 'Stainless Steel',
            'style': 'Contemporary'
        }

class MockDataProcessor:
    """Mock data processor for staging system"""
    
    def process_product_data(self, data):
        """Simulate data processing and validation"""
        processed_data = clean_for_json(data.copy())
        
        # Add some processing logic
        if 'title' in processed_data and processed_data['title']:
            processed_data['title'] = str(processed_data['title']).strip().title()
        
        if 'sku' in processed_data and processed_data['sku']:
            processed_data['sku'] = str(processed_data['sku']).upper().strip()
            
        return processed_data
    
    def validate_data(self, data):
        """Simulate data validation"""
        errors = []
        
        if not data.get('sku'):
            errors.append('SKU is required')
        if not data.get('title'):
            errors.append('Title is required')
            
        return len(errors) == 0, errors

class MockSheetsManager:
    """Mock Google Sheets manager for staging system"""
    
    def add_product_to_sheet(self, collection, product_data):
        """Simulate adding product to Google Sheets"""
        current_app.logger.info(f"Mock: Adding product {product_data.get('sku')} to {collection} collection")
        return {'success': True, 'row_number': 42}
    
    def get_collection_data(self, collection):
        """Simulate getting collection data"""
        return []

class StagingManager:
    """Manages the staging workflow for new products"""
    
    def __init__(self, collection_name):
        self.collection_name = collection_name
        self.config = get_collection_config(collection_name)
        self.ai_extractor = MockAIExtractor()
        self.data_processor = MockDataProcessor()
        self.sheets_manager = MockSheetsManager()
    
    def create_staging_entry(self, csv_data, batch_id):
        """Create staging entries from CSV data"""
        staging_products = []
        
        for index, row in csv_data.iterrows():
            staging_id = f"{batch_id}_{index}"
            
            # Clean row data to handle NaN values
            original_data = {}
            for key, value in row.items():
                original_data[key] = safe_get(value)
            
            staging_entry = {
                'staging_id': staging_id,
                'batch_id': batch_id,
                'collection': self.collection_name,
                'status': 'uploaded',
                'url': safe_get(row.get('url', '')),
                'sku': safe_get(row.get('sku', '')),
                'title': safe_get(row.get('title', '')),
                'vendor': safe_get(row.get('vendor', '')),
                'brand_name': safe_get(row.get('brand_name', '')),
                'original_data': original_data,
                'extracted_data': {},
                'generated_content': {},
                'processed_images': [],
                'errors': [],
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat()
            }
            
            staging_products.append(staging_entry)
            add_staging_product(staging_id, staging_entry)
        
        return staging_products
    
    async def extract_product_data(self, staging_id):
        """Extract data from URL for a single staging product"""
        try:
            staging_data = get_staging_data()
            product = staging_data.get(staging_id)
            if not product:
                return {'success': False, 'error': 'Product not found in staging'}
            
            # Update status
            product['status'] = 'extracting'
            product['updated_at'] = datetime.now().isoformat()
            update_staging_product(staging_id, product)
            
            # Simulate extraction delay
            await asyncio.sleep(1)
            
            # Extract data using mock AI
            if product.get('url'):
                extracted_data = self.ai_extractor.extract_from_url(product['url'])
                
                # Merge with existing data, keeping original values if they exist
                for key, value in extracted_data.items():
                    original_value = product.get('original_data', {}).get(key)
                    if not original_value or original_value == '':
                        product['extracted_data'][key] = value
                    else:
                        product['extracted_data'][key] = original_value
                
                product['status'] = 'extracted'
                update_staging_product(staging_id, product)
                return {'success': True, 'data': product['extracted_data']}
            else:
                # Use existing data if no URL
                product['extracted_data'] = {
                    'title': product.get('title') or 'Product Title Required',
                    'sku': product.get('sku') or f'SKU-{str(uuid.uuid4())[:8].upper()}',
                    'brand_name': product.get('vendor') or 'Brand Required'
                }
                product['status'] = 'extracted'
                update_staging_product(staging_id, product)
                return {'success': True, 'data': product['extracted_data']}
                
        except Exception as e:
            current_app.logger.error(f"Error extracting staging product {staging_id}: {str(e)}")
            staging_data = get_staging_data()
            if staging_id in staging_data:
                product = staging_data[staging_id]
                product['status'] = 'error'
                if 'errors' not in product:
                    product['errors'] = []
                product['errors'].append(f"Extraction error: {str(e)}")
                update_staging_product(staging_id, product)
            return {'success': False, 'error': str(e)}
    
    async def generate_content(self, staging_id):
        """Generate descriptions and content for staging product"""
        try:
            staging_data = get_staging_data()
            product = staging_data.get(staging_id)
            if not product:
                return {'success': False, 'error': 'Product not found in staging'}
            
            product['status'] = 'processing'
            product['updated_at'] = datetime.now().isoformat()
            update_staging_product(staging_id, product)
            
            # Simulate content generation delay
            await asyncio.sleep(2)
            
            title = product.get('extracted_data', {}).get('title', 'Product')
            brand = product.get('extracted_data', {}).get('brand_name', 'Brand')
            
            # Generate mock content
            generated_content = {
                'body_html': f'''<div class="product-description">
<h3>{title}</h3>
<p>Experience premium quality with this exceptional {title} from {brand}. 
Crafted with attention to detail and designed for modern living.</p>

<h4>Key Features:</h4>
<ul>
<li>Premium materials and construction</li>
<li>Modern contemporary design</li>
<li>Easy installation and maintenance</li>
<li>Backed by manufacturer warranty</li>
</ul>

<h4>Specifications:</h4>
<p>This product meets the highest quality standards and is perfect for 
{self.collection_name} applications. Suitable for both residential and 
commercial use.</p>
</div>''',
                'features': f'Premium {title} • {brand} Quality • Modern Design • Easy Installation',
                'care_instructions': f'Clean with mild soap and water. Avoid abrasive cleaners. For best results, dry after each use.',
                'seo_title': f'{title} - {brand} | Premium {self.collection_name.title()}',
                'seo_description': f'Shop {title} from {brand}. Premium quality {self.collection_name} with modern design and easy installation. Free shipping available.'
            }
            
            product['generated_content'] = generated_content
            product['status'] = 'ready'
            update_staging_product(staging_id, product)
            
            return {'success': True, 'content': generated_content}
            
        except Exception as e:
            current_app.logger.error(f"Error generating content for {staging_id}: {str(e)}")
            staging_data = get_staging_data()
            if staging_id in staging_data:
                product = staging_data[staging_id]
                product['status'] = 'error'
                if 'errors' not in product:
                    product['errors'] = []
                product['errors'].append(f"Content generation error: {str(e)}")
                update_staging_product(staging_id, product)
            return {'success': False, 'error': str(e)}
    
    async def process_images(self, staging_id):
        """Process and validate images for staging product"""
        try:
            staging_data = get_staging_data()
            product = staging_data.get(staging_id)
            if not product:
                return {'success': False, 'error': 'Product not found in staging'}
            
            # Simulate image processing delay
            await asyncio.sleep(1)
            
            # Mock image processing
            processed_images = [
                'https://example.com/product-image-1.jpg',
                'https://example.com/product-image-2.jpg'
            ]
            
            product['processed_images'] = processed_images
            if 'extracted_data' not in product:
                product['extracted_data'] = {}
            product['extracted_data']['shopify_images'] = ', '.join(processed_images)
            
            update_staging_product(staging_id, product)
            return {'success': True, 'images': processed_images}
            
        except Exception as e:
            current_app.logger.error(f"Error processing images for {staging_id}: {str(e)}")
            return {'success': False, 'error': str(e)}
    
    async def publish_to_collection(self, staging_ids):
        """Publish staging products to main collection"""
        published_count = 0
        errors = []
        
        try:
            for staging_id in staging_ids:
                staging_data = get_staging_data()
                product = staging_data.get(staging_id)
                if not product:
                    errors.append(f"Product {staging_id} not found")
                    continue
                    
                if product.get('status') != 'ready':
                    errors.append(f"Product {staging_id} not ready for publishing (status: {product.get('status', 'unknown')})")
                    continue
                
                # Validate data before publishing
                extracted_data = product.get('extracted_data', {})
                is_valid, validation_errors = self.data_processor.validate_data(extracted_data)
                if not is_valid:
                    errors.append(f"Product {staging_id} validation failed: {', '.join(validation_errors)}")
                    continue
                
                # Simulate publishing to Google Sheets
                result = self.sheets_manager.add_product_to_sheet(
                    self.collection_name, 
                    extracted_data
                )
                
                if result.get('success'):
                    published_count += 1
                    current_app.logger.info(f"Published staging product {staging_id} to {self.collection_name}")
                    # Remove from staging after successful publishing
                    remove_staging_product(staging_id)
                else:
                    errors.append(f"Failed to publish {staging_id} to sheets")
            
            return {
                'success': True,
                'published_count': published_count,
                'errors': errors
            }
            
        except Exception as e:
            current_app.logger.error(f"Error publishing staging products: {str(e)}")
            return {'success': False, 'error': str(e)}

# ===============================
# API ROUTES
# ===============================

@staging_bp.route('/upload', methods=['POST'])
def upload_staging_csv(collection):
    """Upload CSV file for staging processing"""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file uploaded'})
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'})
        
        if not file.filename.endswith('.csv'):
            return jsonify({'success': False, 'error': 'File must be CSV format'})
        
        # Read CSV with proper NaN handling
        csv_data = pd.read_csv(file, keep_default_na=False, na_values=[''])
        
        # Generate batch ID
        batch_id = str(uuid.uuid4())
        
        # Create staging manager and process upload
        staging_manager = StagingManager(collection)
        staging_products = staging_manager.create_staging_entry(csv_data, batch_id)
        
        current_app.logger.info(f"Uploaded {len(staging_products)} products to staging with batch_id {batch_id}")
        
        return jsonify({
            'success': True,
            'batch_id': batch_id,
            'products_count': len(staging_products),
            'products': [p['staging_id'] for p in staging_products]
        })
        
    except Exception as e:
        current_app.logger.error(f"Error in upload endpoint: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

@staging_bp.route('/extract', methods=['POST'])
def extract_staging_product(collection):
    """Extract data for a single staging product"""
    try:
        data = request.get_json()
        staging_id = data.get('staging_id')
        
        if not staging_id:
            return jsonify({'success': False, 'error': 'staging_id required'})
        
        staging_manager = StagingManager(collection)
        
        # Run extraction in thread pool to avoid blocking
        with ThreadPoolExecutor() as executor:
            future = executor.submit(
                asyncio.run, 
                staging_manager.extract_product_data(staging_id)
            )
            result = future.result()
        
        return jsonify(result)
        
    except Exception as e:
        current_app.logger.error(f"Error in extract endpoint: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

@staging_bp.route('/generate-content', methods=['POST'])
def generate_staging_content(collection):
    """Generate content for staging product"""
    try:
        data = request.get_json()
        staging_id = data.get('staging_id')
        
        if not staging_id:
            return jsonify({'success': False, 'error': 'staging_id required'})
        
        staging_manager = StagingManager(collection)
        
        with ThreadPoolExecutor() as executor:
            future = executor.submit(
                asyncio.run, 
                staging_manager.generate_content(staging_id)
            )
            result = future.result()
        
        return jsonify(result)
        
    except Exception as e:
        current_app.logger.error(f"Error in generate-content endpoint: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

@staging_bp.route('/process-images', methods=['POST'])
def process_staging_images(collection):
    """Process images for staging product"""
    try:
        data = request.get_json()
        staging_id = data.get('staging_id')
        
        if not staging_id:
            return jsonify({'success': False, 'error': 'staging_id required'})
        
        staging_manager = StagingManager(collection)
        
        with ThreadPoolExecutor() as executor:
            future = executor.submit(
                asyncio.run, 
                staging_manager.process_images(staging_id)
            )
            result = future.result()
        
        return jsonify(result)
        
    except Exception as e:
        current_app.logger.error(f"Error in process-images endpoint: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

@staging_bp.route('/publish', methods=['POST'])
def publish_staging_products(collection):
    """Publish staging products to main collection"""
    try:
        data = request.get_json()
        staging_ids = data.get('staging_ids', [])
        
        if not staging_ids:
            return jsonify({'success': False, 'error': 'staging_ids required'})
        
        staging_manager = StagingManager(collection)
        
        with ThreadPoolExecutor() as executor:
            future = executor.submit(
                asyncio.run, 
                staging_manager.publish_to_collection(staging_ids)
            )
            result = future.result()
        
        return jsonify(result)
        
    except Exception as e:
        current_app.logger.error(f"Error in publish endpoint: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

@staging_bp.route('/batch/<batch_id>', methods=['GET'])
def get_staging_batch(collection, batch_id):
    """Get all products in a staging batch"""
    try:
        staging_data = get_staging_data()
        batch_products = {
            k: v for k, v in staging_data.items() 
            if v.get('batch_id') == batch_id and v.get('collection') == collection
        }
        
        return jsonify({
            'success': True,
            'batch_id': batch_id,
            'products': batch_products,
            'count': len(batch_products)
        })
        
    except Exception as e:
        current_app.logger.error(f"Error in batch endpoint: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

@staging_bp.route('/list', methods=['GET'])
def list_staging_products(collection):
    """List all staging products for collection"""
    try:
        staging_data = get_staging_data()
        collection_products = {
            k: v for k, v in staging_data.items() 
            if v.get('collection') == collection
        }
        
        return jsonify({
            'success': True,
            'products': collection_products,
            'count': len(collection_products)
        })
        
    except Exception as e:
        current_app.logger.error(f"Error in list endpoint: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

@staging_bp.route('/<staging_id>', methods=['GET'])
def get_staging_product(collection, staging_id):
    """Get single staging product"""
    try:
        staging_data = get_staging_data()
        product = staging_data.get(staging_id)
        
        if not product:
            return jsonify({'success': False, 'error': 'Product not found'})
        
        if product.get('collection') != collection:
            return jsonify({'success': False, 'error': 'Product not in this collection'})
        
        return jsonify({
            'success': True,
            'product': product
        })
        
    except Exception as e:
        current_app.logger.error(f"Error in get endpoint: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

@staging_bp.route('/<staging_id>', methods=['DELETE'])
def delete_staging_product(collection, staging_id):
    """Delete staging product"""
    try:
        staging_data = get_staging_data()
        if staging_id not in staging_data:
            return jsonify({'success': False, 'error': 'Product not found'})
        
        product = staging_data[staging_id]
        if product.get('collection') != collection:
            return jsonify({'success': False, 'error': 'Product not in this collection'})
        
        remove_staging_product(staging_id)
        
        return jsonify({'success': True, 'message': 'Product deleted from staging'})
        
    except Exception as e:
        current_app.logger.error(f"Error in delete endpoint: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

# ===============================
# REGISTER BLUEPRINT
# ===============================

def register_staging_routes(app):
    """Register staging routes with Flask app"""
    app.register_blueprint(staging_bp)
    app.logger.info("Staging routes registered successfully")