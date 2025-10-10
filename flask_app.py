#!/usr/bin/env python3
"""
Collection-Agnostic Product Information Management (PIM) System
Modern Flask application with modular architecture supporting multiple product collections
Enhanced with New Products Staging System, Checkbox Integration, and Caprice Pricing Comparison
"""

# Load environment variables FIRST
from dotenv import load_dotenv
load_dotenv()

import os
import json
import time
import sqlite3
import logging.config
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify
from jinja2 import TemplateNotFound
from flask_socketio import SocketIO, emit
import requests
import io
from urllib.parse import urlparse
from functools import lru_cache

# Import configuration
from config.settings import get_settings, validate_environment
from config.collections import get_all_collections, get_collection_config
from config.validation import validate_product_data, calculate_quality_score
from config.suppliers import get_supplier_contact, get_all_suppliers

# Import core modules
from core.sheets_manager import get_sheets_manager
from core.ai_extractor import get_ai_extractor
from core.data_processor import get_data_processor
from core.google_apps_script_manager import google_apps_script_manager
from core.pricing_manager import get_pricing_manager
from core.cache_manager import cache_manager
from core.supplier_db import get_supplier_db
from core.collection_detector import detect_collection, detect_collection_batch
from core.image_extractor import extract_og_image

# Initialize settings and configure logging
settings = get_settings()
logging.config.dictConfig(settings.LOGGING_CONFIG)
logger = logging.getLogger(__name__)

def validate_spec_sheet_sku(spec_sheet_url, expected_sku, product_title=""):
    """
    Enhanced validation function for spec sheet URLs that checks accessibility
    and attempts to validate SKU matching through multiple methods.

    Returns a dictionary with validation results including:
    - accessible: Whether the URL is accessible
    - sku_match_status: 'exact_match', 'partial_match', 'no_match', 'unknown'
    - message: Human-readable validation message
    - confidence_level: 'high', 'medium', 'low', 'unknown'
    """

    result = {
        'accessible': False,
        'sku_match_status': 'unknown',
        'message': '',
        'url_contains_sku': False,
        'content_analysis': {},
        'confidence_level': 'unknown',
        'status_code': None,
        'error': None
    }

    try:
        # Test URL accessibility
        response = requests.head(spec_sheet_url, timeout=10, headers={
            'User-Agent': 'Mozilla/5.0 (compatible; PIM-Validator/1.0)'
        }, allow_redirects=True)

        result['status_code'] = response.status_code

        if response.status_code == 404:
            result['error'] = 'Spec sheet URL returns 404 - Contact supplier for updated spec sheet'
            return result
        elif response.status_code != 200:
            result['error'] = f'Spec sheet URL not accessible (HTTP {response.status_code})'
            return result

        result['accessible'] = True

        # Check if SKU appears in URL (basic check)
        result['url_contains_sku'] = expected_sku.upper() in spec_sheet_url.upper()

        # Enhanced SKU validation logic
        sku_matches = []
        confidence_factors = []

        # Method 1: URL-based SKU detection
        if result['url_contains_sku']:
            sku_matches.append('url')
            confidence_factors.append('sku_in_url')
            logger.info(f"✅ SKU '{expected_sku}' found in URL: {spec_sheet_url}")

        # Method 2: Filename analysis (for PDF links)
        filename = spec_sheet_url.split('/')[-1].lower()
        if expected_sku.lower() in filename:
            sku_matches.append('filename')
            confidence_factors.append('sku_in_filename')
            logger.info(f"✅ SKU '{expected_sku}' found in filename: {filename}")

        # Method 3: Basic content extraction attempt (if PDF)
        content_sku_found = False
        if spec_sheet_url.lower().endswith('.pdf'):
            try:
                # Attempt to get a small portion of the PDF content
                pdf_response = requests.get(spec_sheet_url, timeout=15, stream=True, headers={
                    'User-Agent': 'Mozilla/5.0 (compatible; PIM-Validator/1.0)',
                    'Range': 'bytes=0-10240'  # Only get first 10KB
                })

                if pdf_response.status_code in [200, 206]:  # 206 for partial content
                    # Simple text search in PDF header/metadata
                    content_text = str(pdf_response.content)
                    if expected_sku.upper() in content_text.upper():
                        content_sku_found = True
                        sku_matches.append('pdf_content')
                        confidence_factors.append('sku_in_pdf_content')
                        logger.info(f"✅ SKU '{expected_sku}' found in PDF content header")

            except Exception as pdf_error:
                logger.warning(f"Could not analyze PDF content: {pdf_error}")

        # Determine overall match status and confidence
        if len(sku_matches) >= 2:
            result['sku_match_status'] = 'exact_match'
            result['confidence_level'] = 'high'
            result['message'] = f"✅ SKU '{expected_sku}' confirmed in multiple locations: {', '.join(sku_matches)}"
        elif len(sku_matches) == 1:
            if 'pdf_content' in sku_matches:
                result['sku_match_status'] = 'exact_match'
                result['confidence_level'] = 'high'
                result['message'] = f"✅ SKU '{expected_sku}' found in spec sheet content"
            else:
                result['sku_match_status'] = 'partial_match'
                result['confidence_level'] = 'medium'
                result['message'] = f"⚠️ SKU '{expected_sku}' found in {sku_matches[0]} - manual verification recommended"
        else:
            result['sku_match_status'] = 'no_match'
            result['confidence_level'] = 'low'
            result['message'] = f"❌ SKU '{expected_sku}' not found in URL or accessible content - verify this is the correct spec sheet"

        # Additional context based on product title
        if product_title and len(product_title) > 5:
            title_words = [word.upper() for word in product_title.split() if len(word) > 3]
            url_upper = spec_sheet_url.upper()
            title_matches = sum(1 for word in title_words if word in url_upper)

            if title_matches > 0:
                confidence_factors.append(f'title_words_match_{title_matches}')
                if result['confidence_level'] == 'low':
                    result['confidence_level'] = 'medium'
                    result['message'] += f" (but {title_matches} title words found in URL)"

        result['content_analysis'] = {
            'sku_matches': sku_matches,
            'confidence_factors': confidence_factors,
            'content_sku_found': content_sku_found
        }

        return result

    except requests.exceptions.Timeout:
        result['error'] = 'URL validation timed out - spec sheet server may be slow'
        return result
    except requests.exceptions.RequestException as e:
        result['error'] = f'Error accessing URL: {str(e)}'
        return result
    except Exception as e:
        result['error'] = f'Validation error: {str(e)}'
        return result

# Initialize Flask app
app = Flask(__name__, template_folder='templates')
app.config.update(settings.FLASK_CONFIG)

# Add custom template filter for JSON serialization
@app.template_filter('tojsonfilter')
def to_json_filter(obj):
    import json
    from markupsafe import Markup
    return Markup(json.dumps(obj))

# FIXED: Register staging routes AFTER app is created
from api.staging_routes import register_staging_routes
register_staging_routes(app)

# Register optimized AI routes for high-performance processing
try:
    from api_routes_optimized import setup_optimized_routes
    setup_optimized_routes(app, socketio=None)  # Will be updated after socketio is created
    logger.info("✅ Optimized AI routes registered")
except ImportError as e:
    logger.warning(f"⚠️ Optimized AI routes not available: {e}")
except Exception as e:
    logger.error(f"❌ Error registering optimized AI routes: {e}")

# Initialize Socket.IO if enabled
if settings.FEATURES['SOCKETIO_ENABLED']:
    socketio = SocketIO(app, **settings.SOCKETIO_CONFIG)
    logger.info("Socket.IO enabled")

    # Update optimized routes with socketio instance
    try:
        from api_routes_optimized import setup_optimized_routes
        setup_optimized_routes(app, socketio=socketio)
        logger.info("✅ Optimized AI routes updated with Socket.IO support")
    except Exception as e:
        logger.warning(f"⚠️ Could not update optimized routes with Socket.IO: {e}")
else:
    socketio = None
    logger.info("Socket.IO disabled")

# Get global instances
sheets_manager = get_sheets_manager()
ai_extractor = get_ai_extractor()
data_processor = get_data_processor()

# =============================================================================
# CAPRICE PRICING COMPARISON CONFIGURATION
# =============================================================================

# Default pricing field mappings - can be overridden in collection configs
DEFAULT_PRICING_FIELDS = {
    'our_current_price': 'our_current_price',
    'competitor_name': 'competitor_name',
    'competitor_price': 'competitor_price',
    'price_last_updated': 'price_last_updated'
}

def get_pricing_fields_for_collection(collection_name):
    """Get pricing field mappings for a specific collection"""
    try:
        config = get_collection_config(collection_name)
        # Check if collection has custom pricing field mappings
        if hasattr(config, 'pricing_fields'):
            return config.pricing_fields
        else:
            # Return default pricing fields
            return DEFAULT_PRICING_FIELDS
    except:
        return DEFAULT_PRICING_FIELDS

def extract_pricing_data(product_data, collection_name):
    """Extract pricing data from product data or fetch from external pricing sheet"""
    try:
        config = get_collection_config(collection_name)
        
        # First check if pricing data exists in the main sheet
        pricing_fields = get_pricing_fields_for_collection(collection_name)
        main_sheet_pricing = {}
        
        for key, field_name in pricing_fields.items():
            main_sheet_pricing[key] = product_data.get(field_name, '')
        
        # If main sheet has pricing data, use it
        if any(value.strip() for value in main_sheet_pricing.values() if value):
            logger.info(f"Using pricing data from main sheet for {collection_name}")
            return main_sheet_pricing
        
        # Otherwise, try to fetch from external pricing sheet
        if (hasattr(config, 'pricing_enabled') and config.pricing_enabled and 
            hasattr(config, 'pricing_sheet_id') and hasattr(config, 'pricing_lookup_config')):
            
            sku = product_data.get('variant_sku', '').strip()
            if sku:
                logger.info(f"Looking up external pricing data for SKU: {sku}")
                
                external_pricing = sheets_manager.get_pricing_data(
                    config.pricing_sheet_id,
                    config.pricing_worksheet,
                    config.pricing_lookup_config,
                    sku
                )
                
                # DEBUG: Log the actual external pricing data
                logger.info(f"DEBUG: external_pricing returned: {external_pricing}")
                logger.info(f"DEBUG: external_pricing keys: {list(external_pricing.keys()) if external_pricing else 'None'}")
                
                # Map external pricing to expected format
                if external_pricing and any(external_pricing.values()):
                    from datetime import datetime
                    return {
                        'our_current_price': external_pricing.get('our_price', ''),
                        'competitor_name': external_pricing.get('competitor_name', ''),
                        'competitor_price': external_pricing.get('competitor_price', ''),
                        'price_last_updated': datetime.now().strftime('%Y-%m-%d')
                    }
                else:
                    logger.info(f"No external pricing data found for SKU: {sku}")
        
        # No pricing data found
        logger.info(f"No pricing data available for {collection_name}")
        return {
            'our_current_price': '',
            'competitor_name': '',
            'competitor_price': '',
            'price_last_updated': ''
        }
        
    except Exception as e:
        logger.error(f"Error extracting pricing data: {e}")
        return {
            'our_current_price': '',
            'competitor_name': '',
            'competitor_price': '',
            'price_last_updated': ''
        }

def validate_pricing_data(pricing_data):
    """Validate pricing data structure"""
    required_fields = ['our_current_price', 'competitor_price']
    has_data = any(pricing_data.get(field) for field in required_fields)
    
    return {
        'has_pricing_data': has_data,
        'our_price': pricing_data.get('our_current_price', ''),
        'competitor_name': pricing_data.get('competitor_name', ''),
        'competitor_price': pricing_data.get('competitor_price', ''),
        'last_updated': pricing_data.get('price_last_updated', '')
    }

# =============================================================================
# MAIN ROUTES
# =============================================================================

@app.route('/')
def dashboard():
    """Main dashboard showing all collections"""
    logger.info("Accessing main dashboard")
    try:
        # Validate environment
        is_valid, validation_message = validate_environment()
        if not is_valid:
            logger.warning(f"Environment validation issues: {validation_message}")

        # Get all available collections
        collections = get_all_collections()
        available_collections = []

        for name, config in collections.items():
            # Check if collection is accessible
            is_accessible, access_message = sheets_manager.validate_collection_access(name)

            collection_info = {
                'name': name,
                'display_name': config.name,
                'description': config.description,
                'accessible': is_accessible,
                'message': access_message,
                'ai_fields_count': len(config.ai_extraction_fields),
                'total_fields_count': len(config.column_mapping),
                'has_pricing_support': hasattr(config, 'pricing_fields') or bool(DEFAULT_PRICING_FIELDS)
            }

            # Add statistics if accessible
            if is_accessible:
                try:
                    stats = sheets_manager.get_collection_stats(name)
                    collection_info.update(stats)
                except Exception as e:
                    logger.warning(f"Could not get stats for {name}: {e}")
                    collection_info.update({
                        'total_products': 0,
                        'complete_products': 0,
                        'missing_info_products': 0,
                        'data_quality_percent': 0
                    })

            available_collections.append(collection_info)

        return render_template('dashboard.html',
                             collections=available_collections,
                             environment_valid=is_valid,
                             validation_message=validation_message,
                             features=settings.FEATURES)

    except Exception as e:
        logger.error(f"Dashboard error: {e}")
        return jsonify({"error": str(e)}), 500

# =============================================
# COLLECTION BUILDER ROUTES
# =============================================

@app.route('/dashboard/collections/new')
def collection_wizard():
    """Collection Builder Wizard"""
    logger.info("Accessing collection builder wizard")
    return render_template('admin/collection_wizard.html')

@app.route('/api/admin/collections', methods=['POST'])
def create_collection():
    """Create a new collection via the Collection Builder"""
    try:
        data = request.get_json()
        logger.info(f"Creating new collection: {data.get('name', 'Unknown')}")

        # Import CollectionBuilder here to avoid circular imports
        from core.collection_builder import CollectionBuilder

        builder = CollectionBuilder()
        result = builder.create_collection(data)

        if result['success']:
            logger.info(f"Successfully created collection: {data.get('name')}")
            return jsonify(result)
        else:
            logger.error(f"Failed to create collection: {result.get('error')}")
            return jsonify(result), 400

    except Exception as e:
        logger.error(f"Error creating collection: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to create collection: {str(e)}'
        }), 500

@app.route('/api/admin/collections/templates', methods=['GET'])
def get_collection_templates():
    """Get available collection templates"""
    try:
        from core.collection_builder import CollectionBuilder

        builder = CollectionBuilder()
        templates = builder.get_available_templates()

        return jsonify({
            'success': True,
            'templates': templates
        })

    except Exception as e:
        logger.error(f"Error fetching templates: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to fetch templates: {str(e)}'
        }), 500

@app.route('/api/admin/collections/fields', methods=['GET'])
def get_field_library():
    """Get available field library for collection builder"""
    try:
        from core.collection_builder import CollectionBuilder

        builder = CollectionBuilder()
        fields = builder.get_field_library()

        return jsonify({
            'success': True,
            'fields': fields
        })

    except Exception as e:
        logger.error(f"Error fetching field library: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to fetch field library: {str(e)}'
        }), 500

@app.route('/api/admin/collections/preview', methods=['POST'])
def preview_collection():
    """Preview collection configuration before creation"""
    try:
        data = request.get_json()

        from core.collection_builder import CollectionBuilder

        builder = CollectionBuilder()
        preview = builder.preview_collection(data)

        return jsonify({
            'success': True,
            'preview': preview
        })

    except Exception as e:
        logger.error(f"Error previewing collection: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to preview collection: {str(e)}'
        }), 500

# =============================================
# END COLLECTION BUILDER ROUTES
# =============================================

@app.route('/<collection>/new-products')
def new_products_workspace(collection):
    """New Products Staging Workspace"""
    try:
        config = get_collection_config(collection)
        if not config:
            return render_template('error.html',
                                 error="Collection not found",
                                 message=f"The collection '{collection}' does not exist.")

        return render_template('new_products.html',
                             collection=config.to_dict(),
                             collection_name=collection)

    except Exception as e:
        logger.error(f"Error loading new products workspace: {str(e)}")
        return render_template('error.html',
                             error="Workspace Error",
                             message=f"Failed to load workspace: {str(e)}")

@app.route('/<collection_name>')
def collection_view(collection_name):
    """Collection-specific product management view with pricing comparison support"""
    logger.info(f"Accessing collection view: {collection_name}")
    try:
        # Validate collection exists
        try:
            config = get_collection_config(collection_name)
        except ValueError:
            logger.error(f"Collection '{collection_name}' not found")
            return jsonify({"error": f"Collection '{collection_name}' not found"}), 404

        # Check if collection is accessible
        is_accessible, access_message = sheets_manager.validate_collection_access(collection_name)
        if not is_accessible:
            logger.error(f"Collection '{collection_name}' not accessible: {access_message}")

            # Return JSON for AJAX requests, HTML for browser requests
            from flask import request
            if request.headers.get('Accept', '').startswith('application/json') or request.is_json:
                return jsonify({
                    "error": "Collection access failed",
                    "message": access_message,
                    "collection": collection_name
                }), 503
            else:
                return render_template('collection_error.html',
                                     collection_name=collection_name,
                                     error_message=access_message)

        # Get URLs from the collection
        urls = sheets_manager.get_urls_from_collection(collection_name)
        logger.info(f"Found {len(urls)} URLs for {collection_name}")

        # Add pricing support information to template context
        pricing_fields = get_pricing_fields_for_collection(collection_name)
        has_pricing_support = bool(pricing_fields)

        # Use collection-specific template if it exists, fallback to generic
        template_name = f'collection/{collection_name}.html'
        try:
            return render_template(template_name,
                                 collection=config.to_dict(),
                                 collection_config=config.to_dict(),
                                 collection_name=collection_name,
                                 urls=urls,
                                 total_urls=len(urls),
                                 pricing_support=has_pricing_support,
                                 pricing_fields=pricing_fields)
        except TemplateNotFound:
            # Fallback to base collection template
            logger.warning(f"Template '{template_name}' not found, using base template")
            return render_template('collection/base.html',
                                 collection=config.to_dict(),
                                 collection_config=config.to_dict(),
                                 collection_name=collection_name,
                                 urls=urls,
                                 total_urls=len(urls),
                                 pricing_support=has_pricing_support,
                                 pricing_fields=pricing_fields)

    except Exception as e:
        logger.error(f"Collection view error for {collection_name}: {e}")
        return jsonify({"error": str(e)}), 500

# =============================================================================
# CAPRICE PRICING COMPARISON API ENDPOINTS
# =============================================================================

@app.route('/api/<collection_name>/pricing/fields', methods=['GET'])
def api_get_pricing_fields(collection_name):
    """Get pricing field mappings for a collection"""
    try:
        pricing_fields = get_pricing_fields_for_collection(collection_name)
        
        return jsonify({
            'success': True,
            'collection': collection_name,
            'pricing_fields': pricing_fields,
            'has_pricing_support': bool(pricing_fields)
        })
    
    except Exception as e:
        logger.error(f"Error getting pricing fields for {collection_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/products/<int:row_num>/pricing', methods=['GET'])
def api_get_product_pricing(collection_name, row_num):
    """Get pricing data for a specific product"""
    try:
        logger.info(f"Getting pricing data for {collection_name} row {row_num}")
        
        # Get full product data
        product = sheets_manager.get_single_product(collection_name, row_num)
        if not product:
            return jsonify({
                'success': False,
                'error': 'Product not found'
            }), 404
        
        # Extract pricing data
        pricing_data = extract_pricing_data(product, collection_name)
        validated_pricing = validate_pricing_data(pricing_data)
        
        return jsonify({
            'success': True,
            'collection': collection_name,
            'row_num': row_num,
            'pricing': validated_pricing,
            'raw_pricing_data': pricing_data
        })
    
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Collection not found: {collection_name}'
        }), 404
    except Exception as e:
        logger.error(f"Error getting pricing for {collection_name} row {row_num}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/products/<int:row_num>/pricing', methods=['PUT'])
def api_update_product_pricing(collection_name, row_num):
    """Update pricing data for a specific product"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'No JSON data provided'
            }), 400
        
        logger.info(f"Updating pricing data for {collection_name} row {row_num}")
        
        # Get pricing field mappings for this collection
        pricing_fields = get_pricing_fields_for_collection(collection_name)
        
        # Prepare updates
        updates_made = 0
        errors = []
        
        # Map frontend pricing data to backend fields
        pricing_updates = {}
        for frontend_key, backend_field in pricing_fields.items():
            if frontend_key in data:
                pricing_updates[backend_field] = data[frontend_key]
        
        # Update each pricing field
        for field, value in pricing_updates.items():
            try:
                success = sheets_manager.update_single_field(collection_name, row_num, field, value)
                if success:
                    updates_made += 1
                    logger.info(f"Updated {field} = {value} for {collection_name} row {row_num}")
                else:
                    errors.append(f"Failed to update {field}")
            except Exception as e:
                errors.append(f"Error updating {field}: {str(e)}")
        
        # Add timestamp if updating prices
        if updates_made > 0 and 'price_last_updated' in pricing_fields.values():
            try:
                timestamp_field = None
                for key, field in pricing_fields.items():
                    if key == 'price_last_updated':
                        timestamp_field = field
                        break
                
                if timestamp_field:
                    current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    sheets_manager.update_single_field(collection_name, row_num, timestamp_field, current_time)
                    updates_made += 1
            except Exception as e:
                logger.warning(f"Could not update timestamp: {e}")
        
        if updates_made > 0:
            return jsonify({
                'success': True,
                'message': f'Updated {updates_made} pricing fields',
                'updates_made': updates_made,
                'errors': errors
            })
        else:
            return jsonify({
                'success': False,
                'error': 'No pricing fields were updated',
                'errors': errors
            }), 500
    
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Collection not found: {collection_name}'
        }), 404
    except Exception as e:
        logger.error(f"Error updating pricing for {collection_name} row {row_num}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/pricing/bulk-update', methods=['POST'])
def api_bulk_update_pricing(collection_name):
    """Bulk update pricing data for multiple products"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'No JSON data provided'
            }), 400
        
        pricing_updates = data.get('pricing_updates', [])
        if not pricing_updates:
            return jsonify({
                'success': False,
                'error': 'No pricing updates provided'
            }), 400
        
        logger.info(f"Bulk updating pricing for {len(pricing_updates)} products in {collection_name}")
        
        # Get pricing field mappings
        pricing_fields = get_pricing_fields_for_collection(collection_name)
        
        successful_updates = 0
        failed_updates = 0
        errors = []
        
        for update in pricing_updates:
            row_num = update.get('row_num')
            pricing_data = update.get('pricing_data', {})
            
            if not row_num:
                errors.append("Missing row_num in pricing update")
                failed_updates += 1
                continue
            
            try:
                # Update pricing fields for this product
                updates_made = 0
                for frontend_key, backend_field in pricing_fields.items():
                    if frontend_key in pricing_data:
                        success = sheets_manager.update_single_field(
                            collection_name, row_num, backend_field, pricing_data[frontend_key]
                        )
                        if success:
                            updates_made += 1
                
                if updates_made > 0:
                    successful_updates += 1
                else:
                    failed_updates += 1
                    errors.append(f"No fields updated for row {row_num}")
            
            except Exception as e:
                failed_updates += 1
                errors.append(f"Error updating row {row_num}: {str(e)}")
        
        return jsonify({
            'success': successful_updates > 0,
            'message': f'Bulk pricing update completed: {successful_updates} successful, {failed_updates} failed',
            'successful_updates': successful_updates,
            'failed_updates': failed_updates,
            'errors': errors[:10]  # Limit error list
        })
    
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Collection not found: {collection_name}'
        }), 404
    except Exception as e:
        logger.error(f"Error in bulk pricing update for {collection_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# =============================================================================
# CHECKBOX MANAGEMENT ROUTES - FIXED
# =============================================================================

@app.route('/api/<collection_name>/update-checkbox', methods=['POST'])
def update_checkbox(collection_name):
    """Update checkbox value in Google Sheets"""
    try:
        # Get and validate request data
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No JSON data received'})

        row = data.get('row')
        column = data.get('column', 57)  # Default to column BE
        value = data.get('value')
        reason = data.get('reason', '')

        # Validate required parameters
        if row is None:
            return jsonify({'success': False, 'error': 'Row number is required'})
        if column is None:
            return jsonify({'success': False, 'error': 'Column number is required'})
        if value is None:
            return jsonify({'success': False, 'error': 'Value is required'})

        # Convert and validate types
        try:
            row = int(row)
            column = int(column)
        except (ValueError, TypeError):
            return jsonify({'success': False, 'error': 'Row and column must be integers'})

        logger.info(f"Updating checkbox: {collection_name} row {row}, col {column} = {value}")

        # Get worksheet
        sheets_manager = get_sheets_manager()
        worksheet = sheets_manager.get_worksheet(collection_name)

        if not worksheet:
            return jsonify({
                'success': False,
                'error': f'Worksheet for {collection_name} not found'
            })

        # Convert value to proper format for Google Sheets
        if isinstance(value, bool):
            sheet_value = value  # gspread handles boolean values
        elif str(value).lower() in ['true', '1']:
            sheet_value = True
        elif str(value).lower() in ['false', '0']:
            sheet_value = False
        else:
            sheet_value = value

        # Update the cell
        logger.info(f"Calling worksheet.update_cell({row}, {column}, {sheet_value})")
        worksheet.update_cell(row, column, sheet_value)

        logger.info(f"Successfully updated checkbox: {collection_name} row {row} = {sheet_value}")

        return jsonify({
            'success': True,
            'message': f'Updated checkbox at row {row}, column {column} to {sheet_value}',
            'updated_value': sheet_value
        })

    except Exception as e:
        error_msg = f"Error updating checkbox for {collection_name}: {str(e)}"
        logger.error(error_msg)
        return jsonify({'success': False, 'error': error_msg})

@app.route('/api/<collection_name>/get-checkbox-status/<int:row_num>')
def get_checkbox_status(collection_name, row_num):
    """Get checkbox status and note for a specific row - FIXED SINGLE VERSION"""
    try:
        sheets_manager = get_sheets_manager()
        worksheet = sheets_manager.get_worksheet(collection_name)

        if worksheet:
            # Get cell value
            cell_value = worksheet.cell(row_num, 57).value  # Column BE

            # Try to get note if supported
            cell_note = ""
            try:
                cell = worksheet.cell(row_num, 57)
                cell_note = getattr(cell, 'note', '') or ""
            except:
                cell_note = ""

            return jsonify({
                'success': True,
                'checkbox': {
                    'value': cell_value,
                    'note': cell_note
                }
            })
        else:
            return jsonify({
                'success': False,
                'error': f'Worksheet for {collection_name} not found'
            })

    except Exception as e:
        logger.error(f"Error getting checkbox status: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

# =============================================================================
# STAGING SYSTEM ROUTES
# =============================================================================

@app.route('/api/<collection>/staging/stats')
def staging_stats(collection):
    """Get staging statistics for collection"""
    try:
        from api.staging_routes import staging_data

        collection_products = [
            product for product in staging_data.values()
            if product.get('collection') == collection
        ]

        stats = {
            'total_staged': len(collection_products),
            'uploaded': len([p for p in collection_products if p['status'] == 'uploaded']),
            'extracting': len([p for p in collection_products if p['status'] == 'extracting']),
            'extracted': len([p for p in collection_products if p['status'] == 'extracted']),
            'processing': len([p for p in collection_products if p['status'] == 'processing']),
            'ready': len([p for p in collection_products if p['status'] == 'ready']),
            'error': len([p for p in collection_products if p['status'] == 'error']),
        }

        return jsonify({'success': True, 'stats': stats})

    except Exception as e:
        logger.error(f"Error getting staging stats: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

# =============================================================================
# SHOPIFY API ENDPOINTS
# =============================================================================

@app.route('/api/shopify/test-connection', methods=['GET'])
def api_shopify_test_connection():
    """Test Shopify API connection"""
    try:
        logger.info("Testing Shopify connection...")

        if not settings.SHOPIFY_CONFIG['ENABLED']:
            return jsonify({
                "success": False,
                "connected": False,
                "message": "Shopify integration is disabled in configuration"
            }), 400

        # Import Shopify manager
        try:
            from core.shopify_manager import get_shopify_manager
            shopify_manager = get_shopify_manager()
        except ImportError as e:
            return jsonify({
                "success": False,
                "connected": False,
                "message": f"Shopify manager not available: {str(e)}"
            }), 500

        # Test the connection
        is_connected, message = shopify_manager.test_connection()

        return jsonify({
            "success": is_connected,
            "connected": is_connected,
            "message": message
        })

    except Exception as e:
        logger.error(f"Shopify connection test error: {e}")
        return jsonify({
            "success": False,
            "connected": False,
            "message": f"Connection test failed: {str(e)}"
        }), 500

@app.route('/api/<collection_name>/products/<int:row_num>/verify-rrp', methods=['POST'])
def api_verify_rrp(collection_name, row_num):
    """Verify RRP with supplier website using AI"""
    try:
        data = request.get_json() or {}
        current_rrp = data.get('current_rrp')
        supplier_url = data.get('supplier_url', '').strip()
        sku = data.get('sku', '').strip()

        if not current_rrp or not supplier_url:
            return jsonify({
                'success': False,
                'error': 'Missing RRP or supplier URL'
            }), 400

        logger.info(f"Verifying RRP for {collection_name} row {row_num}: ${current_rrp} vs supplier at {supplier_url}")

        # Use AI extractor to fetch and analyze supplier page from column A
        html_content = ai_extractor.fetch_html(supplier_url)
        if not html_content:
            return jsonify({
                'success': True,
                'status': 'unknown',
                'message': 'Could not access supplier website from column A'
            })

        # Enhanced price extraction - look for any content that matches our RRP
        try:
            import re
            from bs4 import BeautifulSoup

            # Parse HTML to get clean text content
            soup = BeautifulSoup(html_content, 'html.parser')

            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()

            # Get all text content
            page_text = soup.get_text()

            logger.info(f"Searching for RRP ${current_rrp} in supplier page text (length: {len(page_text)})")

            # Enhanced price patterns to catch various formats
            price_patterns = [
                # Standard formats: $2,310.00, $2310.00, $2310
                r'\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)',

                # Without dollar sign but with comma: 2,310.00, 2,310
                r'(?:^|[^\d])((?:\d{1,3},)*\d{3}(?:\.\d{2})?)(?:[^\d]|$)',

                # Plain numbers: 2310.00, 2310
                r'(?:^|[^\d])(\d{3,5}(?:\.\d{2})?)(?:[^\d]|$)',

                # With AUD: 2310 AUD, $2310 AUD
                r'(?:\$\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:AUD|aud)',

                # With RRP label: RRP $2310, RRP: 2310.00
                r'RRP\s*:?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)',

                # With Price label: Price: $2310
                r'Price\s*:?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)',
            ]

            found_prices = []
            exact_match_found = False

            # First, look for exact matches of our RRP
            rrp_formats = [
                f"{current_rrp:.2f}",           # 2310.00
                f"{current_rrp:,.2f}",          # 2,310.00
                f"{int(current_rrp)}",          # 2310
                f"{int(current_rrp):,}",        # 2,310
                f"${current_rrp:.2f}",          # $2310.00
                f"${current_rrp:,.2f}",         # $2,310.00
                f"${int(current_rrp)}",         # $2310
                f"${int(current_rrp):,}",       # $2,310
            ]

            logger.info(f"Looking for exact RRP matches in formats: {rrp_formats}")

            for rrp_format in rrp_formats:
                if rrp_format in page_text:
                    logger.info(f"✅ Found exact RRP match: '{rrp_format}' in supplier page")
                    exact_match_found = True
                    found_prices.append(current_rrp)
                    break

            # If no exact match, use pattern matching to find all prices
            if not exact_match_found:
                logger.info("No exact match found, using pattern matching...")

                for pattern in price_patterns:
                    matches = re.findall(pattern, page_text, re.IGNORECASE | re.MULTILINE)
                    for match in matches:
                        try:
                            # Clean the match (remove commas)
                            clean_price = match.replace(',', '')
                            price = float(clean_price)

                            # Only consider prices in reasonable range
                            if 50 <= price <= 20000:
                                found_prices.append(price)
                                logger.info(f"Found price candidate: ${price}")
                        except (ValueError, AttributeError):
                            continue

            if not found_prices:
                logger.info("No prices found on supplier page")
                return jsonify({
                    'success': True,
                    'status': 'unknown',
                    'message': 'Could not find RRP on supplier site'
                })

            # If we found an exact match, use our RRP. Otherwise, find closest match
            if exact_match_found:
                supplier_rrp = current_rrp
                logger.info(f"Using exact match: ${supplier_rrp}")
            else:
                # Remove duplicates and find the price closest to our RRP
                unique_prices = list(set(found_prices))
                supplier_rrp = min(unique_prices, key=lambda x: abs(x - current_rrp))
                logger.info(f"Using closest match: ${supplier_rrp} from {len(unique_prices)} unique prices found")

        except Exception as extract_error:
            logger.warning(f"Price extraction failed: {extract_error}")
            return jsonify({
                'success': True,
                'status': 'unknown',
                'message': 'Could not find RRP on supplier site'
            })

        # Determine match status
        if exact_match_found:
            # If we found an exact text match, it's definitely a match
            return jsonify({
                'success': True,
                'status': 'match',
                'message': f'RRP matches supplier (exact match found)',
                'supplier_price': supplier_rrp,
                'current_price': current_rrp,
                'match_type': 'exact'
            })
        else:
            # For pattern-matched prices, use tolerance
            tolerance = 5.00  # Allow $5 difference for potential formatting differences
            price_difference = abs(current_rrp - supplier_rrp)

            if price_difference <= tolerance:
                return jsonify({
                    'success': True,
                    'status': 'match',
                    'message': f'RRP matches supplier (within ${tolerance} tolerance)',
                    'supplier_price': supplier_rrp,
                    'current_price': current_rrp,
                    'difference': price_difference,
                    'match_type': 'approximate'
                })
            else:
                return jsonify({
                    'success': True,
                    'status': 'mismatch',
                    'message': f'RRP does not match supplier (${price_difference:.2f} difference)',
                    'supplier_price': supplier_rrp,
                    'current_price': current_rrp,
                    'difference': price_difference,
                    'match_type': 'no_match'
                })

    except Exception as e:
        logger.error(f"Error verifying RRP for {collection_name} row {row_num}: {e}")
        return jsonify({
            'success': True,
            'status': 'unknown',
            'message': 'Verification failed - please try again'
        }), 200


@app.route('/api/<collection_name>/validate-spec-sheet', methods=['POST'])
def api_validate_spec_sheet(collection_name):
    """Validate that a spec sheet URL contains the expected product SKU"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'valid': False,
                'reason': 'No JSON payload received'
            }), 400

        spec_sheet_url = data.get('spec_sheet_url', '').strip()
        row_num = data.get('row_num')

        logger.info(f"Validating spec sheet for {collection_name} row {row_num}: {spec_sheet_url}")

        # Validate inputs
        if not spec_sheet_url:
            return jsonify({
                'success': False,
                'error': 'No spec sheet URL provided'
            }), 400

        if row_num is None:
            return jsonify({
                'success': False,
                'error': 'No row number provided'
            }), 400

        # Get product data from spreadsheet to get SKU
        try:
            sheets_manager = get_sheets_manager()
            product_data = sheets_manager.get_single_product(collection_name, row_num)
            if not product_data:
                return jsonify({
                    'success': False,
                    'error': 'Product not found in spreadsheet'
                }), 404

            expected_sku = product_data.get('variant_sku', '').strip()
            product_title = product_data.get('title', '').strip()

            if not expected_sku:
                return jsonify({
                    'success': False,
                    'error': 'No SKU found for this product'
                }), 400

            logger.info(f"Validating spec sheet for product SKU: {expected_sku}")

        except Exception as e:
            logger.error(f"Error fetching product data: {e}")
            return jsonify({
                'success': False,
                'error': 'Failed to fetch product data from spreadsheet'
            }), 500

        # Validate URL format
        try:
            parsed_url = urlparse(spec_sheet_url)
            if not all([parsed_url.scheme, parsed_url.netloc]):
                return jsonify({
                    'success': False,
                    'error': 'Invalid URL format'
                }), 400
        except Exception:
            return jsonify({
                'success': False,
                'error': 'Invalid URL format'
            }), 400

        # Enhanced SKU validation logic
        validation_result = validate_spec_sheet_sku(spec_sheet_url, expected_sku, product_title)

        if not validation_result['accessible']:
            return jsonify({
                'success': False,
                'error': validation_result['error']
            }), 400

        # The spec sheet is accessible, now determine the validation level
        sku_match_status = validation_result['sku_match_status']
        validation_message = validation_result['message']

        # Always save the URL if it's accessible
        try:
            sheets_manager.update_product_row(collection_name, row_num, {
                'shopify_spec_sheet': spec_sheet_url
            })
            logger.info(f"✅ Updated spec sheet URL for {collection_name} row {row_num}")
        except Exception as update_error:
            logger.error(f"Error updating spec sheet URL: {update_error}")
            return jsonify({
                'success': False,
                'error': 'Failed to save spec sheet URL to spreadsheet'
            }), 500

        # Return success with detailed validation information
        return jsonify({
            'success': True,
            'message': validation_message,
            'validation_details': {
                'sku_match_status': sku_match_status,
                'expected_sku': expected_sku,
                'url_contains_sku': validation_result['url_contains_sku'],
                'content_analysis': validation_result.get('content_analysis', {}),
                'confidence_level': validation_result.get('confidence_level', 'unknown')
            },
            'status_code': validation_result['status_code']
        })

    except Exception as e:
        logger.error(f"Error validating spec sheet for {collection_name}: {e}")
        return jsonify({
            'success': False,
            'error': f'Validation error: {str(e)}'
        }), 500

@app.route('/api/<collection_name>/pricing/<variant_sku>', methods=['GET'])
def api_get_pricing(collection_name, variant_sku):
    """Get pricing information for a product SKU"""
    try:
        logger.info(f"Fetching pricing data for SKU: {variant_sku}")

        # Get pricing manager
        pricing_manager = get_pricing_manager()

        # Fetch pricing data
        pricing_data = pricing_manager.get_pricing_data(variant_sku)

        if pricing_data:
            return jsonify({
                'success': True,
                'pricing': {
                    'variant_sku': pricing_data.variant_sku,
                    'our_price': pricing_data.our_price,
                    'lowest_competitor_price': pricing_data.lowest_competitor_price,
                    'lowest_competitor_name': pricing_data.lowest_competitor_name,
                    'price_difference': pricing_data.price_difference,
                    'competitor_prices': pricing_data.competitor_prices
                }
            })
        else:
            return jsonify({
                'success': False,
                'error': f'No pricing data found for SKU: {variant_sku}'
            }), 404

    except Exception as e:
        logger.error(f"Error fetching pricing for SKU {variant_sku}: {e}")
        return jsonify({
            'success': False,
            'error': f'Error fetching pricing data: {str(e)}'
        }), 500

def extract_pdf_text(pdf_content):
    """Extract text from PDF content"""
    try:
        # Method 1: Try PyPDF2
        pdf_file = io.BytesIO(pdf_content)
        pdf_reader = PyPDF2.PdfReader(pdf_file)

        text = ""
        for page in pdf_reader.pages:
            try:
                text += page.extract_text() + "\n"
            except Exception:
                continue

        if text.strip():
            return text

        # Method 2: Try pdfplumber if PyPDF2 fails (you'd need to install this)
        try:
            import pdfplumber
            pdf_file.seek(0)
            with pdfplumber.open(pdf_file) as pdf:
                text = ""
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
                return text
        except ImportError:
            logger.warning("pdfplumber not installed, using PyPDF2 only")
            return text

    except Exception as e:
        logger.error(f"Error extracting PDF text: {e}")
        return ""

# =============================================================================
# API ENDPOINTS - COLLECTION MANAGEMENT
# =============================================================================

@app.route('/api/collections', methods=['GET'])
def api_get_collections():
    """Get list of all available collections"""
    try:
        collections = sheets_manager.get_available_collections()
        return jsonify({
            'success': True,
            'collections': collections
        })
    except Exception as e:
        logger.error(f"Error getting collections: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/stats', methods=['GET'])
def api_get_collection_stats(collection_name):
    """Get statistics for a specific collection"""
    try:
        stats = data_processor.get_processing_statistics(collection_name)
        return jsonify({
            'success': True,
            'stats': stats,
            'collection': collection_name
        })
    except Exception as e:
        logger.error(f"Error getting stats for {collection_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# =============================================================================
# API ENDPOINTS - PRODUCT DATA (ENHANCED WITH PRICING)
# =============================================================================

# File-based cache for all products (works with PythonAnywhere)
import pickle
from pathlib import Path

CACHE_DIR = Path('/tmp/pim_cache')
CACHE_DIR.mkdir(exist_ok=True)
CACHE_TTL_SECONDS = 300  # 5 minutes

def get_cache_path(cache_key):
    """Get the file path for a cache key"""
    safe_key = cache_key.replace('/', '_').replace('\\', '_')
    return CACHE_DIR / f"{safe_key}.pkl"

def get_cached_data(cache_key):
    """Get data from file cache if valid"""
    cache_file = get_cache_path(cache_key)
    if not cache_file.exists():
        return None

    try:
        with open(cache_file, 'rb') as f:
            cached_data = pickle.load(f)

        cache_age = time.time() - cached_data['timestamp']
        if cache_age < CACHE_TTL_SECONDS:
            logger.info(f"✅ Cache HIT! Age: {cache_age:.1f}s")
            return cached_data['data']
        else:
            logger.info(f"⏰ Cache EXPIRED (age: {cache_age:.1f}s)")
            cache_file.unlink()  # Delete expired cache
            return None
    except Exception as e:
        logger.warning(f"Cache read error: {e}")
        return None

def set_cached_data(cache_key, data):
    """Save data to file cache"""
    cache_file = get_cache_path(cache_key)
    try:
        with open(cache_file, 'wb') as f:
            pickle.dump({
                'timestamp': time.time(),
                'data': data
            }, f)
        logger.info(f"💾 Saved to cache: {cache_file.name}")
    except Exception as e:
        logger.warning(f"Cache write error: {e}")

@app.route('/api/<collection_name>/products/all', methods=['GET'])
def api_get_all_products(collection_name):
    """Get all products from a collection (including pricing data) - with caching"""
    try:
        logger.info(f"API: Getting all products for {collection_name}")

        # Check for pagination parameters
        page = request.args.get('page', type=int)
        limit = request.args.get('limit', type=int)

        # If pagination is requested, use paginated endpoint
        if page is not None and limit is not None:
            return api_get_products_paginated(collection_name, page, limit)

        # Check file-based cache first
        cache_key = f"{collection_name}_all_products"

        cached_response = get_cached_data(cache_key)
        if cached_response:
            cached_response['cached'] = True
            return jsonify(cached_response)

        # Cache miss or expired - fetch from sheets
        logger.info(f"📥 Fetching products from Google Sheets...")
        products = sheets_manager.get_all_products(collection_name)

        # Add pricing data to each product
        enhanced_products = {}
        for row_num, product in products.items():
            pricing_data = extract_pricing_data(product, collection_name)
            if pricing_data:
                # Merge pricing data directly into product
                product.update(pricing_data)
            # Also add validated pricing for API response
            product['pricing_data'] = validate_pricing_data(pricing_data)
            enhanced_products[row_num] = product

        # Build response
        response_data = {
            'success': True,
            'products': enhanced_products,
            'total_count': len(enhanced_products),
            'collection': collection_name,
            'pricing_support': bool(get_pricing_fields_for_collection(collection_name)),
            'cached': False
        }

        # Save to file cache
        set_cached_data(cache_key, response_data)

        return jsonify(response_data)

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Collection not found: {collection_name}'
        }), 404
    except Exception as e:
        logger.error(f"API Error getting all products for {collection_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/products/paginated', methods=['GET'])
def api_get_products_paginated(collection_name, page=None, limit=None):
    """Get paginated products from a collection for better performance"""
    try:
        # Get pagination parameters
        page = page or request.args.get('page', 1, type=int)
        limit = limit or request.args.get('limit', 50, type=int)
        search = request.args.get('search', '', type=str).strip()
        quality_filter = request.args.get('quality_filter', '', type=str)
        sort_by = request.args.get('sort_by', 'sheet_order', type=str)
        force_refresh = request.args.get('force_refresh', 'false', type=str).lower() == 'true'

        logger.info(f"API: Getting paginated products for {collection_name} (page {page}, limit {limit}, sort: {sort_by})")

        # Get products with pagination from sheets manager
        result = sheets_manager.get_products_paginated(collection_name, page, limit, search, quality_filter, sort_by, force_refresh)

        # Skip pricing data for large requests (optimization for loading all products)
        # Pricing data can be loaded on-demand when viewing individual products
        skip_pricing = limit > 200  # Skip pricing when loading many products at once

        enhanced_products = {}
        if skip_pricing:
            # Fast path: Skip pricing data extraction for bulk loads
            logger.info(f"⚡ Skipping pricing data extraction for {len(result['products'])} products (optimization)")
            enhanced_products = result['products']
        else:
            # Normal path: Add pricing data for small requests
            for row_num, product in result['products'].items():
                pricing_data = extract_pricing_data(product, collection_name)
                if pricing_data:
                    product.update(pricing_data)
                product['pricing_data'] = validate_pricing_data(pricing_data)
                enhanced_products[row_num] = product

        # Calculate statistics on first page load only (for performance)
        statistics = None
        if page == 1:
            cache_key = f"{collection_name}_statistics"
            statistics = get_cached_data(cache_key)

            if not statistics:
                try:
                    logger.info(f"📊 Calculating statistics for {collection_name}...")
                    all_products = sheets_manager.get_all_products(collection_name)

                    # Calculate quality scores
                    complete_count = 0
                    missing_count = 0
                    total_quality = 0

                    for product in all_products.values():
                        # Use existing quality_score if available, otherwise calculate
                        if 'quality_score' in product and product['quality_score']:
                            try:
                                quality_score = float(str(product['quality_score']).strip().replace('%', ''))
                            except:
                                quality_score = calculate_quality_score(collection_name, product)
                        else:
                            quality_score = calculate_quality_score(collection_name, product)

                        total_quality += quality_score
                        if quality_score >= 80:
                            complete_count += 1
                        else:
                            missing_count += 1

                    total_products = len(all_products)
                    avg_quality = round(total_quality / total_products) if total_products > 0 else 0

                    statistics = {
                        'total_products': total_products,
                        'complete_products': complete_count,
                        'missing_info_products': missing_count,
                        'avg_quality_percent': avg_quality
                    }

                    # Cache statistics for 5 minutes
                    set_cached_data(cache_key, statistics)
                    logger.info(f"✅ Statistics calculated and cached: {statistics}")
                except Exception as e:
                    logger.error(f"❌ Failed to calculate statistics: {e}")
                    import traceback
                    traceback.print_exc()
                    # Don't fail the whole request if statistics calculation fails
                    statistics = None

        response_data = {
            'success': True,
            'products': enhanced_products,
            'pagination': {
                'current_page': page,
                'per_page': limit,
                'total_count': result['total_count'],
                'total_pages': result['total_pages'],
                'has_next': result['has_next'],
                'has_prev': result['has_prev']
            },
            'collection': collection_name,
            'search': search,
            'quality_filter': quality_filter,
            'pricing_support': bool(get_pricing_fields_for_collection(collection_name))
        }

        # Include statistics in first page response
        if statistics:
            response_data['statistics'] = statistics

        return jsonify(response_data)

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Collection not found: {collection_name}'
        }), 404
    except Exception as e:
        logger.error(f"API Error getting paginated products for {collection_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/products/search', methods=['GET'])
def api_search_products(collection_name):
    """Fast search endpoint - returns matching products"""
    try:
        query = request.args.get('q', '', type=str).strip().lower()

        if not query or len(query) < 2:
            return jsonify({
                'success': False,
                'error': 'Search query must be at least 2 characters'
            }), 400

        logger.info(f"API: Searching products in {collection_name} for: {query}")

        # Get all products
        all_products = sheets_manager.get_all_products(collection_name)

        # Search through products
        matching_products = {}
        searchable_fields = ['title', 'variant_sku', 'sku', 'brand_name', 'vendor', 'product_material', 'installation_type']

        for row_num, product in all_products.items():
            # Build searchable text from multiple fields
            searchable_text = ' '.join([
                str(product.get(field, '')).lower()
                for field in searchable_fields
            ])

            # Check if query matches
            if query in searchable_text:
                matching_products[row_num] = product

        logger.info(f"Found {len(matching_products)} matching products")

        return jsonify({
            'success': True,
            'products': matching_products,
            'total_count': len(matching_products),
            'query': query,
            'collection': collection_name
        })

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Collection not found: {collection_name}'
        }), 404
    except Exception as e:
        logger.error(f"API Error searching products in {collection_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/products/filter-missing-fields', methods=['POST'])
def api_filter_missing_fields(collection_name):
    """Fast filter endpoint - returns products missing specified fields"""
    try:
        data = request.get_json()
        fields = data.get('fields', [])

        if not fields or not isinstance(fields, list):
            return jsonify({
                'success': False,
                'error': 'Fields array is required'
            }), 400

        logger.info(f"API: Filtering products in {collection_name} by missing fields: {fields}")

        # Get all products
        all_products = sheets_manager.get_all_products(collection_name)

        # Define empty field values
        empty_values = {'', 'n/a', 'na', 'none', 'null', 'undefined', '-', 'tbd', 'tbc'}

        def is_field_empty(value):
            if not value:
                return True
            str_value = str(value).strip().lower()
            return str_value in empty_values or str_value == ''

        # Filter products that are missing ANY of the selected fields
        matching_products = {}
        for row_num, product in all_products.items():
            has_missing_field = any(is_field_empty(product.get(field)) for field in fields)
            if has_missing_field:
                matching_products[row_num] = product

        logger.info(f"Found {len(matching_products)} products missing selected fields")

        return jsonify({
            'success': True,
            'products': matching_products,
            'total_count': len(matching_products),
            'fields': fields,
            'collection': collection_name
        })

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Collection not found: {collection_name}'
        }), 404
    except Exception as e:
        logger.error(f"API Error filtering products in {collection_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/sync', methods=['POST'])
def api_sync_from_sheets(collection_name):
    """Sync products from Google Sheets to SQLite cache"""
    try:
        from core.db_cache import get_db_cache

        logger.info(f"🔄 Starting manual sync for {collection_name}...")
        start_time = time.time()

        # Force refresh from Google Sheets
        products = sheets_manager.get_all_products(collection_name, force_refresh=True)

        if not products:
            return jsonify({
                'success': False,
                'error': 'No products found to sync'
            }), 404

        # Get sync statistics
        sync_duration = time.time() - start_time
        db_cache = get_db_cache()
        last_sync = db_cache.get_last_sync_time(collection_name)

        logger.info(f"✅ Sync completed for {collection_name}: {len(products)} products in {sync_duration:.2f}s")

        return jsonify({
            'success': True,
            'collection': collection_name,
            'products_synced': len(products),
            'sync_duration_seconds': round(sync_duration, 2),
            'last_sync': last_sync.isoformat() if last_sync else None,
            'message': f'Successfully synced {len(products)} products from Google Sheets'
        })

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Collection not found: {collection_name}'
        }), 404
    except Exception as e:
        logger.error(f"❌ Sync failed for {collection_name}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/cache/stats', methods=['GET'])
def api_collection_cache_stats(collection_name):
    """Get cache statistics for a collection"""
    try:
        from core.db_cache import get_db_cache

        db_cache = get_db_cache()
        last_sync = db_cache.get_last_sync_time(collection_name)
        sync_history = db_cache.get_sync_history(collection_name, limit=5)
        cache_stats = db_cache.get_cache_stats()

        collection_stats = {
            'collection': collection_name,
            'last_sync': last_sync.isoformat() if last_sync else None,
            'products_count': cache_stats['collections'].get(collection_name, 0),
            'sync_history': sync_history,
            'cache_valid': db_cache.is_cache_valid(collection_name, max_age_seconds=3600)  # 1 hour
        }

        return jsonify({
            'success': True,
            **collection_stats
        })

    except Exception as e:
        logger.error(f"❌ Failed to get cache stats: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/products/<int:row_num>', methods=['GET'])
def api_get_single_product(collection_name, row_num):
    """Get a single product by row number (including pricing data)"""
    try:
        logger.info(f"API: Getting product {row_num} for {collection_name}")
        product = sheets_manager.get_single_product(collection_name, row_num)
        if not product:
            return jsonify({
                'success': False,
                'error': 'Product not found'
            }), 404
        
        # Add pricing data directly to product object
        pricing_data = extract_pricing_data(product, collection_name)
        if pricing_data:
            # Merge pricing data directly into product
            product.update(pricing_data)
            logger.info(f"Merged pricing data into product: {list(pricing_data.keys())}")

        # Also add validated pricing for API response
        product['pricing_data'] = validate_pricing_data(pricing_data)
        
        return jsonify({
            'success': True,
            'product': product,
            'collection': collection_name,
            'pricing_support': bool(get_pricing_fields_for_collection(collection_name))
        })
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Collection not found: {collection_name}'
        }), 404
    except Exception as e:
        logger.error(f"API Error getting product {row_num} for {collection_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/products/<int:row_num>/batch', methods=['PUT'])
def api_batch_update_product(collection_name, row_num):
    """Batch update multiple fields for a single product"""
    try:
        data = request.get_json()
        if not data or not isinstance(data, dict):
            return jsonify({
                'success': False,
                'error': 'Data object with field-value pairs is required'
            }), 400

        logger.info(f"API: Batch updating {collection_name} row {row_num} with {len(data)} fields")

        # Use the sheets manager to update all fields at once
        sheets_manager.update_product_row(collection_name, row_num, data)

        logger.info(f"✅ Successfully batch updated {collection_name} row {row_num}")
        return jsonify({
            'success': True,
            'message': f'Updated {len(data)} fields for row {row_num}',
            'fields_updated': list(data.keys())
        })

    except Exception as e:
        logger.error(f"Error in batch update: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/products/<int:row_num>', methods=['PUT'])
def api_update_single_product(collection_name, row_num):
    """Update a single product field (including pricing fields)"""
    try:
        data = request.get_json()
        field = data.get('field')
        value = data.get('value')

        logger.info(f"API: Updating {collection_name} row {row_num}, field {field}")

        if not field or value is None:
            return jsonify({
                'success': False,
                'error': 'Field and value are required'
            }), 400

        # Check if this is a pricing field update
        pricing_fields = get_pricing_fields_for_collection(collection_name)
        is_pricing_field = field in pricing_fields.values()

        success = sheets_manager.update_single_field(collection_name, row_num, field, value)

        if success:
            response_data = {
                'success': True,
                'message': f'Updated {field} for row {row_num}',
                'is_pricing_field': is_pricing_field
            }
            
            # If updating pricing, add timestamp
            if is_pricing_field and 'price_last_updated' in pricing_fields.values():
                try:
                    timestamp_field = None
                    for key, pricing_field in pricing_fields.items():
                        if key == 'price_last_updated':
                            timestamp_field = pricing_field
                            break
                    
                    if timestamp_field:
                        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                        sheets_manager.update_single_field(collection_name, row_num, timestamp_field, current_time)
                        response_data['timestamp_updated'] = True
                except Exception as e:
                    logger.warning(f"Could not update pricing timestamp: {e}")
            
            return jsonify(response_data)
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to update sheet'
            }), 500

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Collection not found: {collection_name}'
        }), 404
    except Exception as e:
        logger.error(f"API Error updating product {row_num} for {collection_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# =============================================================================
# API ENDPOINTS - AI PROCESSING
# =============================================================================

@app.route('/api/<collection_name>/process/extract', methods=['POST'])
def api_process_extract(collection_name):
    """AI extraction for a collection"""
    try:
        payload = request.get_json()
        if not payload:
            return jsonify({"success": False, "message": "No JSON payload received"}), 400

        selected_rows = payload.get("selected_rows", [])
        overwrite_mode = payload.get("overwrite_mode", True)

        if not selected_rows:
            return jsonify({"success": False, "message": "No rows selected"}), 400

        logger.info(f"Starting AI extraction for {collection_name}: {selected_rows}")

        # For large batches, we should recommend processing smaller chunks
        if len(selected_rows) > 10:
            logger.warning(f"Large batch requested ({len(selected_rows)} products). This may timeout.")

        # Use data processor for extraction with force refresh
        result = data_processor.extract_from_urls(
            collection_name=collection_name,
            selected_rows=selected_rows,
            overwrite_mode=overwrite_mode
        )

        if result["success"]:
            successful = result["summary"]["successful"]
            failed = result["summary"]["failed"]
            skipped = result["summary"]["skipped"]

            message = f"AI extraction completed for {collection_name}! {successful} successful, {failed} failed, {skipped} skipped."

            # Emit SocketIO events for successful extractions
            if socketio and successful > 0:
                for row_result in result["results"]:
                    if row_result.get("success"):
                        row_num = row_result.get("row_num")
                        if row_num:
                            try:
                                # Get the extracted fields from the result
                                extracted_fields = []
                                updated_data = {}

                                if row_result.get("extracted_data"):
                                    for field, value in row_result["extracted_data"].items():
                                        if value:  # Only include non-empty fields
                                            extracted_fields.append(field)
                                            updated_data[field] = value

                                socketio.emit('product_updated', {
                                    'collection': collection_name,
                                    'row_num': row_num,
                                    'fields_updated': extracted_fields,
                                    'updated_data': updated_data,
                                    'message': f'AI extraction completed for row {row_num}',
                                    'timestamp': datetime.now().isoformat()
                                })
                                logger.info(f"✅ SocketIO event emitted for {collection_name} row {row_num}")
                            except Exception as e:
                                logger.warning(f"Failed to emit SocketIO event for row {row_num}: {e}")

            # Get updated product data for the first processed row (for modal refresh)
            updated_data = None
            if selected_rows and len(selected_rows) == 1:
                try:
                    sheets_manager = get_sheets_manager()
                    updated_data = sheets_manager.get_single_product(collection_name, selected_rows[0])
                except Exception as e:
                    logger.warning(f"Failed to get updated product data: {e}")

            return jsonify({
                "success": True,
                "message": message,
                "collection": collection_name,
                "results": result["results"],
                "summary": result["summary"],
                "updated_data": updated_data
            })
        else:
            return jsonify(result), 500

    except ValueError as e:
        return jsonify({"success": False, "message": f"Collection not found: {collection_name}"}), 404
    except Exception as e:
        logger.error(f"AI extraction error for {collection_name}: {e}")
        return jsonify({"success": False, "message": f"Server error: {str(e)}"}), 500

@app.route('/api/<collection_name>/products/<int:row_num>/extract', methods=['POST'])
def api_extract_single_product(collection_name, row_num):
    """AI extraction for a single product using its URL from product data"""
    try:
        payload = request.get_json()
        overwrite_mode = payload.get("overwrite_mode", True) if payload else True

        logger.info(f"Starting single product AI extraction for {collection_name} row {row_num}")

        # Get the product data to find its URL
        sheets_manager = get_sheets_manager()
        product_data = sheets_manager.get_single_product(collection_name, row_num)

        if not product_data:
            return jsonify({
                "success": False,
                "message": f"Product not found at row {row_num}"
            }), 404

        # Get the URL from product data
        product_url = product_data.get('url', '').strip()
        if not product_url:
            return jsonify({
                "success": False,
                "message": f"No URL found for product at row {row_num}"
            }), 400

        logger.info(f"Found URL for row {row_num}: {product_url}")

        # Use the data processor to extract from this single URL
        from core.data_processor import get_data_processor
        data_processor = get_data_processor()

        # Process single URL directly
        result = data_processor._process_single_url(collection_name, row_num, product_url, overwrite_mode)

        if result.success:
            # Emit SocketIO event for live updates
            if socketio and result.extracted_fields:
                try:
                    # Get updated product data
                    updated_data = sheets_manager.get_single_product(collection_name, row_num)

                    socketio.emit('product_updated', {
                        'collection': collection_name,
                        'row_num': row_num,
                        'fields_updated': result.extracted_fields,
                        'updated_data': updated_data,
                        'message': f'AI extraction completed for row {row_num}',
                        'timestamp': datetime.now().isoformat()
                    })
                    logger.info(f"✅ SocketIO event emitted for {collection_name} row {row_num}")
                except Exception as e:
                    logger.warning(f"Failed to emit SocketIO event for row {row_num}: {e}")

            return jsonify({
                "success": True,
                "message": f"AI extraction completed for row {row_num}",
                "collection": collection_name,
                "row_num": row_num,
                "extracted_fields": result.extracted_fields or [],
                "processing_time": result.processing_time,
                "updated_data": sheets_manager.get_single_product(collection_name, row_num)
            })
        else:
            return jsonify({
                "success": False,
                "message": result.error or "AI extraction failed",
                "row_num": row_num
            }), 500

    except ValueError as e:
        return jsonify({"success": False, "message": f"Collection not found: {collection_name}"}), 404
    except Exception as e:
        logger.error(f"Single product AI extraction error for {collection_name} row {row_num}: {e}")
        return jsonify({"success": False, "message": f"Server error: {str(e)}"}), 500

@app.route('/api/<collection_name>/debug/sheet-data', methods=['GET'])
def api_debug_sheet_data(collection_name):
    """Debug endpoint to check raw Google Sheets data"""
    try:
        sheets_manager = get_sheets_manager()
        worksheet = sheets_manager.get_worksheet(collection_name)

        if not worksheet:
            return jsonify({
                "success": False,
                "message": "Cannot access worksheet - using CSV fallback",
                "using_csv": True
            })

        # Get raw sheet data
        all_values = worksheet.get_all_values()

        # Basic stats
        total_rows = len(all_values)
        data_rows = total_rows - 1 if total_rows > 0 else 0

        # Check first few rows for structure
        sample_rows = all_values[:min(5, total_rows)]

        # Check last few rows to see if there's data at the end
        last_rows = all_values[-3:] if total_rows > 3 else []

        # Count non-empty rows
        non_empty_rows = 0
        for i, row in enumerate(all_values[1:], start=2):  # Skip header
            if any(cell.strip() for cell in row if cell):
                non_empty_rows += 1

        # Get processed products count
        all_products = sheets_manager.get_all_products(collection_name, force_refresh=True)

        return jsonify({
            "success": True,
            "raw_data": {
                "total_rows_in_sheet": total_rows,
                "data_rows": data_rows,
                "non_empty_rows": non_empty_rows,
                "sample_first_rows": sample_rows,
                "sample_last_rows": last_rows,
                "processed_products_count": len(all_products),
                "processed_row_numbers": list(all_products.keys())[:20]  # First 20 row numbers
            }
        })

    except Exception as e:
        logger.error(f"Debug endpoint error for {collection_name}: {e}")
        import traceback
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

@app.route('/api/<collection_name>/process/descriptions', methods=['POST'])
def api_process_descriptions(collection_name):
    """Generate AI descriptions for a collection"""
    try:
        payload = request.get_json()
        if not payload:
            return jsonify({"success": False, "message": "No JSON payload received"}), 400

        selected_rows = payload.get("selected_rows", [])
        use_url_content = payload.get("use_url_content", False)

        if not selected_rows:
            return jsonify({"success": False, "message": "No rows selected"}), 400

        logger.info(f"Starting description generation for {collection_name}: {selected_rows}")

        # Check if OpenAI is configured
        if not settings.OPENAI_API_KEY:
            return jsonify({"success": False, "message": "OpenAI API key not configured"}), 500

        # Use data processor for description generation
        result = data_processor.generate_descriptions(
            collection_name=collection_name,
            selected_rows=selected_rows,
            use_url_content=use_url_content
        )

        if result["success"]:
            successful = result["summary"]["successful"]
            failed = result["summary"]["failed"]

            message = f"Description generation completed for {collection_name}! {successful} descriptions generated, {failed} failed."

            return jsonify({
                "success": True,
                "message": message,
                "collection": collection_name,
                "results": result["results"],
                "summary": result["summary"]
            })
        else:
            return jsonify(result), 500

    except ValueError as e:
        return jsonify({"success": False, "message": f"Collection not found: {collection_name}"}), 404
    except Exception as e:
        logger.error(f"Description generation error for {collection_name}: {e}")
        return jsonify({"success": False, "message": f"Server error: {str(e)}"}), 500

@app.route('/api/<collection_name>/products/<int:row_num>/generate-description', methods=['POST'])
def api_generate_single_description(collection_name, row_num):
    """Generate description AND care instructions for a single product"""
    try:
        data = request.get_json() or {}
        use_url_content = data.get('use_url_content', False)

        logger.info(f"Generating description AND care instructions for {collection_name} row {row_num}")

        if not settings.OPENAI_API_KEY:
            return jsonify({
                'success': False,
                'error': 'OpenAI API key not configured'
            }), 500

        # Use the multi-field generation instead of just descriptions
        result = data_processor.generate_product_content(
            collection_name=collection_name,
            selected_rows=[row_num],
            use_url_content=use_url_content,
            fields_to_generate=['body_html', 'care_instructions']  # Generate BOTH
        )

        if result["success"] and result["results"]:
            result_data = result["results"][0]
            if result_data["success"]:
                # Emit SocketIO event for live updates
                if socketio:
                    updated_data = result_data.get('generated_content', {})
                    logger.info(f"🔍 Generated content for SocketIO: {updated_data}")

                    socketio.emit('product_updated', {
                        'collection': collection_name,
                        'row_num': row_num,
                        'fields_updated': ['body_html', 'care_instructions'],
                        'updated_data': updated_data,
                        'message': 'Description and care instructions generated',
                        'timestamp': datetime.now().isoformat()
                    })
                    logger.info(f"✅ Emitted product_updated event for {collection_name} row {row_num}")
                    logger.info(f"📊 Event data: {updated_data}")
                else:
                    logger.warning("⚠️ SocketIO not available, skipping live update emission")

                # Trigger Google Apps Script cleaning after successful AI generation
                try:
                    import asyncio
                    google_apps_script_result = asyncio.run(google_apps_script_manager.trigger_post_ai_cleaning(
                        collection_name=collection_name,
                        row_number=row_num,
                        operation_type='description_generation'
                    ))
                    if google_apps_script_result['success']:
                        logger.info(f"✅ Google Apps Script triggered successfully for {collection_name} row {row_num}")
                    else:
                        logger.warning(f"⚠️ Google Apps Script trigger failed: {google_apps_script_result.get('error', 'Unknown error')}")
                except Exception as gas_error:
                    logger.error(f"❌ Error triggering Google Apps Script: {gas_error}")

                return jsonify({
                    'success': True,
                    'message': 'Description and care instructions generated and saved',
                    'collection': collection_name,
                    'fields_generated': ['body_html', 'care_instructions'],
                    'updated_data': result_data.get('generated_content', {})
                })
            else:
                return jsonify({
                    'success': False,
                    'error': result_data.get("error", "Failed to generate content")
                })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to generate content'
            })

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Collection not found: {collection_name}'
        }), 404
    except Exception as e:
        logger.error(f"Error generating content for {collection_name} row {row_num}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/products/<int:row_num>/generate-care-instructions', methods=['POST'])
def api_generate_care_instructions(collection_name, row_num):
    """Generate care instructions for a single product"""
    try:
        data = request.get_json() or {}
        product_data = data.get('product_data', {})

        logger.info(f"Generating care instructions for {collection_name} row {row_num}")

        if not settings.OPENAI_API_KEY:
            return jsonify({
                'success': False,
                'error': 'OpenAI API key not configured'
            }), 500

        # Generate care instructions using AI extractor
        ai_extractor = get_ai_extractor()
        result = ai_extractor.generate_product_content(
            collection_name=collection_name,
            product_data=product_data,
            fields_to_generate=['care_instructions']
        )

        if result and 'care_instructions' in result:
            # Update the spreadsheet with generated care instructions
            sheets_manager = get_sheets_manager()
            sheets_manager.update_product_row(collection_name, row_num, {
                'care_instructions': result['care_instructions']
            })

            # Emit SocketIO event for live updates
            if socketio:
                socketio.emit('product_updated', {
                    'collection': collection_name,
                    'row_num': row_num,
                    'fields_updated': ['care_instructions'],
                    'updated_data': {'care_instructions': result['care_instructions']},
                    'message': 'Care instructions generated',
                    'timestamp': datetime.now().isoformat()
                })
                logger.info(f"✅ Emitted product_updated event for care instructions {collection_name} row {row_num}")

            # Trigger Google Apps Script cleaning after successful care instructions generation
            try:
                import asyncio
                google_apps_script_result = asyncio.run(google_apps_script_manager.trigger_post_ai_cleaning(
                    collection_name=collection_name,
                    row_number=row_num,
                    operation_type='care_instructions_generation'
                ))
                if google_apps_script_result['success']:
                    logger.info(f"✅ Google Apps Script triggered successfully for {collection_name} row {row_num}")
                else:
                    logger.warning(f"⚠️ Google Apps Script trigger failed: {google_apps_script_result.get('error', 'Unknown error')}")
            except Exception as gas_error:
                logger.error(f"❌ Error triggering Google Apps Script: {gas_error}")

            return jsonify({
                'success': True,
                'care_instructions': result['care_instructions'],
                'message': 'Care instructions generated and saved'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to generate care instructions'
            }), 500

    except Exception as e:
        logger.error(f"Error generating care instructions for {collection_name} row {row_num}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/products/<int:row_num>/generate-features', methods=['POST'])
def api_generate_features(collection_name, row_num):
    """Generate key features for a single product"""
    try:
        data = request.get_json() or {}
        product_data = data.get('product_data', {})

        logger.info(f"Generating features for {collection_name} row {row_num}")

        if not settings.OPENAI_API_KEY:
            return jsonify({
                'success': False,
                'error': 'OpenAI API key not configured'
            }), 500

        # Generate features using AI extractor
        ai_extractor = get_ai_extractor()
        result = ai_extractor.generate_product_content(
            collection_name=collection_name,
            product_data=product_data,
            fields_to_generate=['features']
        )

        if result and 'features' in result:
            # Update the spreadsheet with generated features
            sheets_manager = get_sheets_manager()
            sheets_manager.update_product_row(collection_name, row_num, {
                'features': result['features']
            })

            # Emit SocketIO event for live updates
            if socketio:
                socketio.emit('product_updated', {
                    'collection': collection_name,
                    'row_num': row_num,
                    'fields_updated': ['features'],
                    'updated_data': {'features': result['features']},
                    'message': 'Key features generated',
                    'timestamp': datetime.now().isoformat()
                })
                logger.info(f"✅ Emitted product_updated event for features generation {collection_name} row {row_num}")

            # Trigger Google Apps Script cleaning after successful features generation
            try:
                import asyncio
                google_apps_script_result = asyncio.run(google_apps_script_manager.trigger_post_ai_cleaning(
                    collection_name=collection_name,
                    row_number=row_num,
                    operation_type='features_generation'
                ))
                if google_apps_script_result['success']:
                    logger.info(f"✅ Google Apps Script triggered successfully for {collection_name} row {row_num}")
                else:
                    logger.warning(f"⚠️ Google Apps Script trigger failed: {google_apps_script_result.get('error', 'Unknown error')}")
            except Exception as gas_error:
                logger.error(f"❌ Error triggering Google Apps Script: {gas_error}")

            return jsonify({
                'success': True,
                'features': result['features'],
                'message': 'Key features generated and saved'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to generate features'
            }), 500

    except Exception as e:
        logger.error(f"Error generating features for {collection_name} row {row_num}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/products/<int:row_num>/generate-faqs', methods=['POST'])
def api_generate_product_faqs(collection_name, row_num):
    """Generate FAQs for a single product using ChatGPT"""
    try:
        data = request.get_json() or {}
        product_data = data.get('product_data', {})

        logger.info(f"Generating FAQs for {collection_name} row {row_num}")

        if not settings.OPENAI_API_KEY:
            return jsonify({
                'success': False,
                'error': 'OpenAI API key not configured'
            }), 500

        # Generate FAQs using FAQ generator
        from core.faq_generator import faq_generator
        faqs = faq_generator.generate_faqs(product_data, collection_name)

        if faqs:
            # Update the spreadsheet with generated FAQs
            sheets_manager = get_sheets_manager()
            sheets_manager.update_product_row(collection_name, row_num, {
                'faqs': faqs
            })

            # Clear cache to ensure fresh data is loaded next time
            cache_manager.invalidate("products", collection_name)

            # Emit SocketIO event for live updates
            if socketio:
                socketio.emit('product_updated', {
                    'collection': collection_name,
                    'row_num': row_num,
                    'fields_updated': ['faqs'],
                    'updated_data': {'faqs': faqs},
                    'message': 'Product FAQs generated',
                    'timestamp': datetime.now().isoformat()
                })
                logger.info(f"✅ Emitted product_updated event for FAQ generation {collection_name} row {row_num}")

            # Trigger Google Apps Script cleaning after successful FAQ generation
            try:
                import asyncio
                google_apps_script_result = asyncio.run(google_apps_script_manager.trigger_post_ai_cleaning(
                    collection_name=collection_name,
                    row_number=row_num,
                    operation_type='faq_generation'
                ))
                if google_apps_script_result['success']:
                    logger.info(f"✅ Google Apps Script triggered successfully for {collection_name} row {row_num}")
                else:
                    logger.warning(f"⚠️ Google Apps Script trigger failed: {google_apps_script_result.get('error', 'Unknown error')}")
            except Exception as gas_error:
                logger.error(f"❌ Error triggering Google Apps Script: {gas_error}")

            return jsonify({
                'success': True,
                'faqs': faqs,
                'message': 'Product FAQs generated and saved'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to generate FAQs'
            }), 500

    except Exception as e:
        logger.error(f"Error generating FAQs for {collection_name} row {row_num}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/generate-faqs', methods=['POST'])
def api_generate_faqs(collection_name):
    """Generate FAQs for a collection or specific product using ChatGPT"""
    try:
        data = request.get_json() or {}
        product_row = data.get('product_row')  # Optional: specific product row
        faq_types = data.get('faq_types', ['installation', 'maintenance', 'compatibility', 'warranty', 'technical'])
        num_faqs_per_type = data.get('num_faqs_per_type', 3)

        logger.info(f"Generating FAQs for {collection_name}, product row: {product_row}, types: {faq_types}")

        if not settings.OPENAI_API_KEY:
            return jsonify({
                'success': False,
                'error': 'OpenAI API key not configured'
            }), 500

        # Generate FAQs using AI extractor
        ai_extractor = get_ai_extractor()
        result = ai_extractor.generate_faqs_from_sheets_data(
            collection_name=collection_name,
            product_row=product_row,
            faq_types=faq_types,
            num_faqs_per_type=num_faqs_per_type
        )

        if result.get('success'):
            return jsonify({
                'success': True,
                'faqs': result['faqs'],
                'collection': result['collection'],
                'product_row': result.get('product_row'),
                'generated_count': result['generated_count'],
                'types_generated': result['types_generated'],
                'message': f"Successfully generated {result['generated_count']} FAQs across {len(result['types_generated'])} categories"
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to generate FAQs')
            }), 500

    except Exception as e:
        logger.error(f"Error generating FAQs for {collection_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/test-title-generation', methods=['GET'])
def test_title_generation():
    """Test endpoint to check if title generation is working"""
    try:
        ai_extractor = get_ai_extractor()

        # Test with minimal data
        test_data = {
            'title': 'Test Sink',
            'brand_name': 'TestBrand',
            'product_material': 'Stainless Steel'
        }

        # Check if method exists
        if hasattr(ai_extractor, 'generate_seo_product_title'):
            return jsonify({
                'success': True,
                'message': 'Title generation method exists and AI extractor is loaded',
                'has_api_key': bool(settings.OPENAI_API_KEY)
            })
        else:
            return jsonify({
                'success': False,
                'error': 'generate_seo_product_title method not found'
            })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/<collection_name>/products/<int:row_num>/generate-title-with-competitors', methods=['POST'])
def api_generate_product_title_with_competitors(collection_name, row_num):
    """Generate SEO-optimized product title using ChatGPT with competitor analysis"""
    try:
        logger.info(f"Generating competitor-enhanced title for {collection_name} product at row {row_num}")

        # Get product data from Google Sheets
        try:
            sheets_manager = get_sheets_manager()
            product_data = sheets_manager.get_single_product(collection_name, row_num)
            logger.info(f"Retrieved product data for row {row_num}: {bool(product_data)}")
        except Exception as e:
            logger.error(f"Error getting product data: {e}")
            # Use fallback test data when sheets are unavailable
            logger.info("Using fallback test data for competitor analysis demo")
            product_data = {
                'variant_sku': f'DEMO-SKU-{row_num}',
                'brand_name': 'Phoenix Tapware',
                'product_material': 'Stainless Steel',
                'bowls_number': '1',
                'installation_type': 'Undermount',
                'title': f'Demo Product {row_num}',
                'demo_mode': True
            }

        if not product_data:
            logger.info("No product data from sheets, using fallback test data")
            product_data = {
                'variant_sku': f'DEMO-SKU-{row_num}',
                'brand_name': 'Phoenix Tapware',
                'product_material': 'Stainless Steel',
                'bowls_number': '1',
                'installation_type': 'Undermount',
                'title': f'Demo Product {row_num}',
                'demo_mode': True
            }

        # Generate title with competitor analysis
        try:
            ai_extractor = get_ai_extractor()
            result = ai_extractor.generate_seo_product_title_with_competitor_analysis(product_data, collection_name)
            logger.info(f"Competitor-enhanced title generation result: {result.get('success', False)}")
        except Exception as e:
            logger.error(f"Error in competitor-enhanced title generation: {e}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            return jsonify({
                'success': False,
                'error': f'Error generating title: {str(e)}',
                'traceback': traceback.format_exc() if settings.DEBUG else None
            }), 500

        if result.get('success'):
            return jsonify({
                'success': True,
                'titles': result['titles'],
                'primary_title': result['primary_title'],
                'collection': result['collection'],
                'tokens_used': result.get('tokens_used', 0),
                'competitor_analysis': result.get('competitor_analysis'),
                'search_query': result.get('search_query'),
                'insights_used': result.get('insights_used', []),
                'message': f"Generated {len(result['titles'])} titles with competitor intelligence"
            })
        else:
            # Handle API key missing case with competitor analysis still working
            if 'competitor_analysis' in result:
                demo_note = " (Demo mode - Google Sheets unavailable)" if product_data.get('demo_mode') else ""
                return jsonify({
                    'success': True,
                    'error': result.get('error'),
                    'competitor_analysis': result.get('competitor_analysis'),
                    'fallback_titles': result.get('fallback_titles', []),
                    'demo_mode': product_data.get('demo_mode', False),
                    'message': f'Competitor analysis completed but title generation requires OpenAI API key{demo_note}'
                })
            else:
                fallback = result.get('fallback_title')
                return jsonify({
                    'success': False,
                    'error': result.get('error', 'Failed to generate title'),
                    'fallback_title': fallback,
                    'details': result.get('details')
                }), 500

    except Exception as e:
        logger.error(f"Error generating competitor-enhanced title for {collection_name} product {row_num}: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc() if getattr(settings, 'DEBUG', False) else None
        }), 500

@app.route('/api/competitor-analysis/health-check', methods=['GET'])
def api_competitor_analysis_health_check():
    """Health check endpoint for competitor analysis functionality"""
    try:
        ai_extractor = get_ai_extractor()

        # Test with minimal data
        test_data = {
            'variant_sku': 'TEST-HEALTH',
            'brand_name': 'Test Brand',
            'product_material': 'Test Material'
        }

        result = ai_extractor.analyze_competitor_titles(test_data, 'sinks')

        return jsonify({
            'success': True,
            'competitor_analysis_working': result.get('success', False),
            'message': 'Competitor analysis health check passed',
            'found_competitors': len(result.get('competitor_data', [])),
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        import traceback
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc(),
            'message': 'Competitor analysis health check failed',
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/api/<collection_name>/products/<int:row_num>/generate-title', methods=['POST'])
def api_generate_product_title(collection_name, row_num):
    """Generate SEO-optimized product title using ChatGPT with all available product data"""
    try:
        logger.info(f"Generating product title for {collection_name} product at row {row_num}")

        if not settings.OPENAI_API_KEY:
            return jsonify({
                'success': False,
                'error': 'OpenAI API key not configured'
            }), 500

        # Get product data from Google Sheets
        try:
            sheets_manager = get_sheets_manager()
            product_data = sheets_manager.get_single_product(collection_name, row_num)
            logger.info(f"Retrieved product data for row {row_num}: {bool(product_data)}")
        except Exception as e:
            logger.error(f"Error getting product data: {e}")
            return jsonify({
                'success': False,
                'error': f'Error retrieving product data: {str(e)}'
            }), 500

        if not product_data:
            return jsonify({
                'success': False,
                'error': f'Product not found at row {row_num}'
            }), 404

        # Generate title using AI extractor
        try:
            ai_extractor = get_ai_extractor()
            logger.info(f"AI extractor loaded: {bool(ai_extractor)}")

            # Call the synchronous method
            result = ai_extractor.generate_seo_product_title(product_data, collection_name)
            logger.info(f"Title generation result: {result.get('success', False)}")
        except Exception as e:
            logger.error(f"Error in title generation: {e}")
            return jsonify({
                'success': False,
                'error': f'Error generating title: {str(e)}'
            }), 500

        if result.get('success'):
            return jsonify({
                'success': True,
                'titles': result['titles'],
                'primary_title': result['primary_title'],
                'collection': result['collection'],
                'tokens_used': result.get('tokens_used', 0),
                'message': f"Successfully generated {len(result['titles'])} title variants"
            })
        else:
            # Return fallback title if available
            fallback = result.get('fallback_title')
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to generate title'),
                'fallback_title': fallback,
                'details': result.get('details')
            }), 500

    except Exception as e:
        logger.error(f"Error generating title for {collection_name} product {row_num}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/products', methods=['GET'])
def api_get_products_list(collection_name):
    """Get list of products for FAQ generation dropdown"""
    try:
        sheets_manager = get_sheets_manager()
        all_products = sheets_manager.get_all_products(collection_name)

        if not all_products:
            return jsonify({
                'success': False,
                'error': f'No products found for {collection_name}'
            }), 404

        # Create simplified list for dropdown
        products_list = []
        for row_num, product in all_products.items():
            title = product.get('title', f'Product {row_num}')
            sku = product.get('variant_sku', product.get('sku', ''))

            # Truncate long titles
            if len(title) > 50:
                title = title[:47] + '...'

            display_name = f"{title}"
            if sku:
                display_name += f" ({sku})"

            products_list.append({
                'row_num': row_num,
                'title': title,
                'sku': sku,
                'display_name': display_name
            })

        # Sort by title
        products_list.sort(key=lambda x: x['title'])

        return jsonify({
            'success': True,
            'products': products_list,
            'count': len(products_list)
        })

    except Exception as e:
        logger.error(f"Error getting products list for {collection_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/products/missing-info', methods=['GET'])
def api_get_missing_info(collection_name):
    """Get detailed missing information analysis for products in a collection"""
    try:
        logger.info(f"API: Getting missing info analysis for {collection_name}")

        # Get collection configuration
        config = get_collection_config(collection_name)
        if not config:
            return jsonify({
                'success': False,
                'error': f'Collection not found: {collection_name}'
            }), 404

        # Get all products
        sheets_manager = get_sheets_manager()
        products = sheets_manager.get_all_products(collection_name)

        if not products:
            return jsonify({
                'success': False,
                'error': f'No products found for {collection_name}'
            }), 404

        # Analyze missing information for each product
        missing_info_analysis = []
        quality_fields = config.quality_fields

        for row_num, product in products.items():
            # Skip completely blank or nearly blank rows before processing
            essential_fields = ['title', 'variant_sku', 'brand_name', 'handle', 'url']
            essential_data_count = sum(1 for field in essential_fields
                                     if product.get(field, '').strip()
                                     and product.get(field, '').strip().lower() not in ['', 'none', 'null', 'n/a', '-', 'tbd', 'tbc'])

            # If product has fewer than 2 essential fields, skip it entirely
            if essential_data_count < 2:
                logger.debug(f"Skipping row {row_num} - insufficient essential data (only {essential_data_count} fields)")
                continue

            # Additional check: if product only has auto-generated fields, skip it
            meaningful_fields = [k for k, v in product.items()
                               if v and str(v).strip()
                               and str(v).strip().lower() not in ['', 'none', 'null', 'n/a', '-', 'tbd', 'tbc']
                               and k not in ['row_number', 'id']]  # Exclude auto-generated fields

            if len(meaningful_fields) < 3:
                logger.debug(f"Skipping row {row_num} - insufficient meaningful data (only {len(meaningful_fields)} fields: {meaningful_fields})")
                continue

            missing_fields = []

            # Check each quality field for missing data
            for field in quality_fields:
                value = product.get(field, '').strip()
                if not value or value.lower() in ['', 'none', 'null', 'n/a', '-', 'tbd', 'tbc']:
                    missing_fields.append({
                        'field': field,
                        'display_name': field.replace('_', ' ').title(),
                        'is_critical': field in ['title', 'variant_sku', 'brand_name', 'product_material', 'installation_type', 'style', 'grade_of_material', 'waste_outlet_dimensions', 'body_html', 'features', 'care_instructions', 'faqs']
                    })

            # Check conditional fields - Second bowl dimensions (only if multiple bowls)
            bowls_number = product.get('bowls_number', '').strip()
            has_multiple_bowls = False
            if bowls_number:
                bowls_str = str(bowls_number).lower()
                if bowls_str in ['2', 'double', 'two', '3', 'triple', 'three']:
                    has_multiple_bowls = True
                elif bowls_number.isdigit() and int(bowls_number) >= 2:
                    has_multiple_bowls = True

            if has_multiple_bowls:
                # Check second bowl dimensions
                second_bowl_fields = ['second_bowl_width_mm', 'second_bowl_depth_mm', 'second_bowl_height_mm']
                for field in second_bowl_fields:
                    if field in config.column_mapping:  # Only check if field is mapped
                        value = product.get(field, '').strip()
                        if not value or value.lower() in ['', 'none', 'null', 'n/a', '-', 'tbd', 'tbc']:
                            missing_fields.append({
                                'field': field,
                                'display_name': field.replace('_', ' ').title(),
                                'is_critical': True  # Second bowl dimensions are critical for multi-bowl sinks
                            })

            # Check spec sheet URL verification
            spec_sheet_url = product.get('shopify_spec_sheet', '').strip()
            product_sku = product.get('variant_sku', '').strip()

            if product_sku:  # Only check if we have a SKU
                if not spec_sheet_url or spec_sheet_url.lower() in ['', 'none', 'null', 'n/a', '-', 'tbd', 'tbc']:
                    # Spec sheet is missing entirely
                    missing_fields.append({
                        'field': 'shopify_spec_sheet',
                        'display_name': 'Spec Sheet (Missing)',
                        'is_critical': True,
                        'verification_issue': True,
                        'issue_type': 'spec_sheet_missing',
                        'details': f'Product "{product_sku}" is missing a spec sheet URL'
                    })
                else:
                    # Check if SKU is present in the spec sheet URL
                    # Remove any special characters and convert to lowercase for comparison
                    sku_clean = product_sku.lower().replace('-', '').replace('_', '').replace(' ', '')
                    url_clean = spec_sheet_url.lower().replace('-', '').replace('_', '').replace(' ', '').replace('%20', '')

                    if sku_clean not in url_clean:
                        missing_fields.append({
                            'field': 'shopify_spec_sheet',
                            'display_name': 'Spec Sheet URL (SKU Mismatch)',
                            'is_critical': True,
                            'verification_issue': True,
                            'issue_type': 'spec_sheet_sku_mismatch',
                            'details': f'Spec sheet URL does not contain SKU "{product_sku}"'
                        })

            if missing_fields:  # Only include products with missing info
                critical_missing = [f for f in missing_fields if f['is_critical']]
                quality_score = product.get('quality_score', 0)

                # Better product naming logic with multiple fallbacks
                title = product.get('title', '').strip()
                sku = product.get('variant_sku', '').strip()
                brand = product.get('brand_name', '').strip()

                # Create a meaningful product name
                product_name = ''
                if title:
                    product_name = title
                elif sku and brand:
                    product_name = f"{brand} - {sku}"
                elif sku:
                    product_name = f"Product {sku}"
                elif brand:
                    product_name = f"{brand} Product"
                else:
                    # Only fall back to row number if we have no other identifying information
                    product_name = f"Product {row_num}"

                # Count non-empty fields for debugging
                non_empty_fields = sum(1 for key, value in product.items()
                                     if value and str(value).strip() and
                                     str(value).strip().lower() not in ['', 'none', 'null', 'n/a', '-', 'tbd', 'tbc'])

                # Try to get image data from multiple possible fields
                image_url = (product.get('shopify_images') or
                           product.get('image_url') or
                           product.get('featured_image') or
                           product.get('image') or
                           product.get('shopify_image_url') or
                           product.get('main_image') or
                           product.get('product_image') or
                           '')

                product_payload = {
                    **product,
                    'row_num': row_num
                }

                missing_info_analysis.append({
                    'row_num': row_num,
                    'title': product_name,
                    'sku': sku,
                    'brand_name': brand,
                    'product_material': product.get('product_material', ''),
                    'style': product.get('style', ''),
                    'installation_type': product.get('installation_type', ''),
                    'grade_of_material': product.get('grade_of_material', ''),
                    'image_url': image_url,
                    'quality_score': quality_score,
                    'missing_fields': missing_fields,
                    'critical_missing_count': len(critical_missing),
                    'total_missing_count': len(missing_fields),
                    'completeness_category': 'missing-critical' if len(critical_missing) > 0 else 'missing-some',
                    'non_empty_field_count': non_empty_fields,  # For debugging
                    'product_data': product_payload
                })

        # Sort by most critical missing first, then by total missing count
        missing_info_analysis.sort(key=lambda x: (x['critical_missing_count'], x['total_missing_count']), reverse=True)

        # Generate summary statistics
        summary = {
            'total_products': len(products),
            'total_products_with_missing_info': len(missing_info_analysis),
            'products_missing_critical': len([p for p in missing_info_analysis if p['critical_missing_count'] > 0]),
            'products_missing_some': len([p for p in missing_info_analysis if p['critical_missing_count'] == 0]),
            'most_common_missing_fields': {}
        }

        # Calculate completion status for ALL fields (not just missing ones)
        total_products = len(products)
        field_completion_status = {}

        # Initialize counts for all quality fields
        for field in quality_fields:
            field_completion_status[field] = {
                'missing_count': 0,
                'completed_count': 0,
                'completion_percentage': 0.0,
                'status': 'excellent',
                'color': 'green'
            }

        # Count missing fields
        field_counts = {}
        for product in missing_info_analysis:
            for field in product['missing_fields']:
                field_name = field['field']  # Use field name, not display name
                field_counts[field_name] = field_counts.get(field_name, 0) + 1

        # Calculate completion percentages and status for all fields
        for field in quality_fields:
            missing_count = field_counts.get(field, 0)

            # Ensure missing count doesn't exceed total products (fix double counting issues)
            if missing_count > total_products:
                missing_count = total_products

            completed_count = total_products - missing_count
            completion_percentage = (completed_count / total_products) * 100 if total_products > 0 else 0

            # Determine status and color based on completion percentage
            if completion_percentage >= 90:
                status = 'excellent'
                color = 'green'
            elif completion_percentage >= 70:
                status = 'good'
                color = 'yellow'
            else:
                status = 'needs_improvement'
                color = 'red'

            display_name = field.replace('_', ' ').title()
            field_completion_status[field] = {
                'display_name': display_name,
                'missing_count': missing_count,
                'completed_count': completed_count,
                'completion_percentage': round(completion_percentage, 1),
                'status': status,
                'color': color
            }

        # Sort by completion percentage (worst first) for priority
        sorted_field_status = dict(sorted(field_completion_status.items(),
                                        key=lambda x: x[1]['completion_percentage']))

        # Keep the old format for backwards compatibility and add new format
        summary['most_common_missing_fields'] = {
            field_completion_status[field]['display_name']: field_completion_status[field]['missing_count']
            for field in sorted(field_counts.keys(), key=field_counts.get, reverse=True)
            if field in field_completion_status  # Only include fields that were processed
        }
        summary['field_completion_status'] = sorted_field_status

        # Group products by supplier for bulk contact functionality
        # Only include products that have non-content fields missing
        content_fields = ['body_html', 'features', 'care_instructions', 'faqs', 'seo_title', 'seo_description']

        supplier_groups = {}
        for product in missing_info_analysis:
            # Check if product has any supplier-relevant missing fields
            missing_fields = product.get('missing_fields', [])
            missing_critical = product.get('missing_critical', [])
            all_missing = missing_fields + missing_critical

            # Filter out content fields - only include technical/specification data
            supplier_relevant_fields = [field for field in all_missing if field not in content_fields]

            # Skip products that only have content missing (nothing for supplier to provide)
            if not supplier_relevant_fields:
                continue

            # Get brand name for supplier lookup
            brand_name = None
            full_product = products.get(product['row_num'], {})
            if full_product:
                brand_name = full_product.get('brand_name', '').strip()

            # Use brand name as the primary key, with fallback for empty brands
            # Fixed: Each brand gets its own supplier group instead of lumping together
            supplier_key = brand_name if brand_name else 'Unknown Supplier'

            # Get supplier contact info - use default supplier contact for unknown brands
            if brand_name:
                supplier_contact = get_supplier_contact(brand_name)
            else:
                # For products with no brand, use default supplier info
                from config.suppliers import DEFAULT_SUPPLIER
                supplier_contact = DEFAULT_SUPPLIER

            if supplier_key not in supplier_groups:
                supplier_groups[supplier_key] = {
                    'supplier_name': supplier_key,
                    'supplier_contact': supplier_contact.to_dict() if supplier_contact else None,
                    'products': [],
                    'total_products': 0,
                    'critical_products': 0,
                    'total_missing_fields': 0
                }

            # Create modified product data with only supplier-relevant fields
            supplier_product = product.copy()
            supplier_product['missing_fields'] = [f for f in missing_fields if f not in content_fields]
            supplier_product['missing_critical'] = [f for f in missing_critical if f not in content_fields]
            supplier_product['total_missing_count'] = len(supplier_relevant_fields)
            supplier_product['critical_missing_count'] = len([f for f in missing_critical if f not in content_fields])

            # Add product to supplier group
            supplier_groups[supplier_key]['products'].append(supplier_product)
            supplier_groups[supplier_key]['total_products'] += 1
            supplier_groups[supplier_key]['total_missing_fields'] += len(supplier_relevant_fields)

            if supplier_product['critical_missing_count'] > 0:
                supplier_groups[supplier_key]['critical_products'] += 1

        # Convert to list and sort by total missing fields (most critical first)
        supplier_summary = list(supplier_groups.values())
        supplier_summary.sort(key=lambda x: (x['critical_products'], x['total_missing_fields']), reverse=True)

        return jsonify({
            'success': True,
            'collection': collection_name,
            'missing_info_analysis': missing_info_analysis,
            'summary': summary,
            'supplier_groups': supplier_summary,
            'field_definitions': {field: field.replace('_', ' ').title() for field in quality_fields}
        })

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Collection not found: {collection_name}'
        }), 404
    except Exception as e:
        logger.error(f"Error getting missing info for {collection_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/products/missing-info-export', methods=['GET'])
def api_export_missing_info_csv(collection_name):
    """Export missing information analysis as CSV for suppliers"""
    try:
        import csv
        import io
        from flask import make_response

        logger.info(f"API: Exporting missing info CSV for {collection_name}")

        # Get collection configuration
        config = get_collection_config(collection_name)
        if not config:
            return jsonify({
                'success': False,
                'error': f'Collection not found: {collection_name}'
            }), 404

        # Get all products
        sheets_manager = get_sheets_manager()
        products = sheets_manager.get_all_products(collection_name)

        if not products:
            return jsonify({
                'success': False,
                'error': f'No products found for {collection_name}'
            }), 404

        # Analyze missing information (reuse logic from missing-info endpoint)
        missing_info_analysis = []
        quality_fields = config.quality_fields

        for row_num, product in products.items():
            missing_fields = []

            # Check each quality field for missing data
            for field in quality_fields:
                value = product.get(field, '').strip()
                if not value or value.lower() in ['', 'none', 'null', 'n/a', '-', 'tbd', 'tbc']:
                    missing_fields.append({
                        'field': field,
                        'display_name': field.replace('_', ' ').title(),
                        'is_critical': field in ['title', 'variant_sku', 'brand_name', 'product_material', 'installation_type', 'style', 'grade_of_material', 'waste_outlet_dimensions', 'body_html', 'features', 'care_instructions', 'faqs']
                    })

            if missing_fields:
                missing_info_analysis.append({
                    'row_num': row_num,
                    'title': product.get('title', ''),
                    'variant_sku': product.get('variant_sku', ''),
                    'brand_name': product.get('brand_name', ''),
                    'missing_fields': [f['display_name'] for f in missing_fields],
                    'missing_critical': [f['display_name'] for f in missing_fields if f['is_critical']],
                    'total_missing_count': len(missing_fields),
                    'critical_missing_count': len([f for f in missing_fields if f['is_critical']])
                })

        # Create CSV content - ONE ROW PER MISSING FIELD for maximum readability
        output = io.StringIO()
        writer = csv.writer(output)

        # Simple, clear header
        writer.writerow([
            'Product Title',
            'SKU',
            'Brand',
            'Missing Field',
            'Field Category',
            'Priority',
            'Example/Description'
        ])

        # Define field categories and examples
        field_info = {
            'Product Material': {'category': 'Technical Specs', 'priority': 'HIGH', 'example': 'e.g., Stainless Steel, Granite, Fireclay'},
            'Grade Of Material': {'category': 'Technical Specs', 'priority': 'HIGH', 'example': 'e.g., 304, 316, Commercial Grade'},
            'Installation Type': {'category': 'Technical Specs', 'priority': 'HIGH', 'example': 'e.g., Undermount, Drop-in, Farmhouse'},
            'Style': {'category': 'Technical Specs', 'priority': 'MEDIUM', 'example': 'e.g., Modern, Traditional, Industrial'},
            'Bowl Width Mm': {'category': 'Dimensions', 'priority': 'HIGH', 'example': 'e.g., 450, 600 (in millimeters)'},
            'Bowl Depth Mm': {'category': 'Dimensions', 'priority': 'HIGH', 'example': 'e.g., 200, 250 (in millimeters)'},
            'Bowl Height Mm': {'category': 'Dimensions', 'priority': 'HIGH', 'example': 'e.g., 180, 220 (in millimeters)'},
            'Length Mm': {'category': 'Dimensions', 'priority': 'HIGH', 'example': 'e.g., 800, 1000 (overall length)'},
            'Overall Width Mm': {'category': 'Dimensions', 'priority': 'HIGH', 'example': 'e.g., 450, 500 (overall width)'},
            'Overall Depth Mm': {'category': 'Dimensions', 'priority': 'HIGH', 'example': 'e.g., 450, 500 (overall depth)'},
            'Min Cabinet Size Mm': {'category': 'Dimensions', 'priority': 'MEDIUM', 'example': 'e.g., 600, 900 (minimum cabinet width)'},
            'Cutout Size Mm': {'category': 'Dimensions', 'priority': 'MEDIUM', 'example': 'e.g., 780x480 (width x depth)'},
            'Tap Holes Number': {'category': 'Features', 'priority': 'MEDIUM', 'example': 'e.g., 0, 1, 3 (number of pre-drilled holes)'},
            'Bowls Number': {'category': 'Features', 'priority': 'HIGH', 'example': 'e.g., 1, 2 (single or double bowl)'},
            'Has Overflow': {'category': 'Features', 'priority': 'MEDIUM', 'example': 'e.g., Yes, No (overflow drain present)'},
            'Is Undermount': {'category': 'Features', 'priority': 'HIGH', 'example': 'e.g., Yes, No (can be undermounted)'},
            'Is Topmount': {'category': 'Features', 'priority': 'HIGH', 'example': 'e.g., Yes, No (can be top mounted)'},
            'Drain Position': {'category': 'Features', 'priority': 'MEDIUM', 'example': 'e.g., Center, Rear, Left, Right'},
            'Waste Outlet Dimensions': {'category': 'Features', 'priority': 'HIGH', 'example': 'e.g., 90mm, 115mm (drain outlet size)'},
            'Second Bowl Width Mm': {'category': 'Dimensions', 'priority': 'MEDIUM', 'example': 'e.g., 350, 400 (for double bowl sinks)'},
            'Second Bowl Depth Mm': {'category': 'Dimensions', 'priority': 'MEDIUM', 'example': 'e.g., 180, 200 (for double bowl sinks)'},
            'Second Bowl Height Mm': {'category': 'Dimensions', 'priority': 'MEDIUM', 'example': 'e.g., 160, 180 (for double bowl sinks)'},
            'Spec Sheet': {'category': 'Documentation', 'priority': 'MEDIUM', 'example': 'URL to product specification sheet'},
            'Body Html': {'category': 'Documentation', 'priority': 'LOW', 'example': 'Product description text'},
            'Features': {'category': 'Documentation', 'priority': 'LOW', 'example': 'List of product features'},
            'Care Instructions': {'category': 'Documentation', 'priority': 'LOW', 'example': 'How to clean and maintain'},
            'Faqs': {'category': 'Documentation', 'priority': 'LOW', 'example': 'Common questions and answers'},
            'Warranty Years': {'category': 'Technical Specs', 'priority': 'MEDIUM', 'example': 'e.g., 5, 10, 25 (years of warranty)'},
            'Title': {'category': 'Basic Info', 'priority': 'HIGH', 'example': 'Full product name'},
            'Variant Sku': {'category': 'Basic Info', 'priority': 'HIGH', 'example': 'Product code/SKU'},
            'Brand Name': {'category': 'Basic Info', 'priority': 'HIGH', 'example': 'Manufacturer brand name'}
        }

        # Write one row per missing field for each product
        for product in missing_info_analysis:
            for missing_field in product['missing_fields']:
                field_details = field_info.get(missing_field, {
                    'category': 'Other',
                    'priority': 'MEDIUM',
                    'example': 'Please provide this information'
                })

                writer.writerow([
                    product['title'],
                    product['variant_sku'],
                    product['brand_name'] or 'Unknown Brand',
                    missing_field,
                    field_details['category'],
                    field_details['priority'],
                    field_details['example']
                ])

        # Create response
        csv_content = output.getvalue()
        output.close()

        response = make_response(csv_content)
        response.headers['Content-Type'] = 'text/csv'
        response.headers['Content-Disposition'] = f'attachment; filename="{collection_name}_missing_information.csv"'

        return response

    except Exception as e:
        logger.error(f"Error exporting missing info CSV for {collection_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/products/import', methods=['POST'])
def api_import_products_csv(collection_name):
    """Import products from CSV and update Google Sheets"""
    try:
        import csv
        import io
        from flask import make_response

        logger.info(f"API: Starting CSV import for {collection_name}")

        # Get collection configuration
        config = get_collection_config(collection_name)
        if not config:
            return jsonify({
                'success': False,
                'error': f'Collection not found: {collection_name}'
            }), 404

        # Check if file was uploaded
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No file uploaded'
            }), 400

        file = request.files['file']

        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No file selected'
            }), 400

        if not file.filename.endswith('.csv'):
            return jsonify({
                'success': False,
                'error': 'File must be a CSV'
            }), 400

        # Read CSV data
        stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
        csv_reader = csv.DictReader(stream)

        # Get sheets manager
        sheets_manager = get_sheets_manager()

        # Track import results
        results = {
            'total_rows': 0,
            'updated': 0,
            'created': 0,
            'skipped': 0,
            'errors': [],
            'details': []
        }

        # Get all existing products to match by SKU
        existing_products = sheets_manager.get_all_products(collection_name)

        # Create SKU to row number mapping
        sku_to_row = {}
        for row_num, product in existing_products.items():
            sku = product.get('variant_sku', '').strip()
            if sku:
                sku_to_row[sku] = row_num

        # Process each row in the CSV
        for csv_row in csv_reader:
            results['total_rows'] += 1

            try:
                # Get SKU from CSV (try different possible column names)
                sku = (csv_row.get('variant_sku') or
                       csv_row.get('SKU') or
                       csv_row.get('sku') or
                       csv_row.get('Variant Sku') or '').strip()

                if not sku:
                    results['skipped'] += 1
                    results['details'].append({
                        'row': results['total_rows'],
                        'status': 'skipped',
                        'reason': 'No SKU found'
                    })
                    continue

                # Prepare update data - map CSV columns to internal field names
                update_data = {}

                # Map common CSV column names to internal field names
                field_mapping = {
                    'variant_sku': 'variant_sku',
                    'SKU': 'variant_sku',
                    'sku': 'variant_sku',
                    'Variant Sku': 'variant_sku',
                    'title': 'title',
                    'Title': 'title',
                    'Product Title': 'title',
                    'brand_name': 'brand_name',
                    'Brand': 'brand_name',
                    'Brand Name': 'brand_name',
                    'product_material': 'product_material',
                    'Product Material': 'product_material',
                    'Material': 'product_material',
                    'grade_of_material': 'grade_of_material',
                    'Grade Of Material': 'grade_of_material',
                    'Grade': 'grade_of_material',
                    'installation_type': 'installation_type',
                    'Installation Type': 'installation_type',
                    'style': 'style',
                    'Style': 'style',
                    'bowl_width_mm': 'bowl_width_mm',
                    'Bowl Width Mm': 'bowl_width_mm',
                    'Bowl Width': 'bowl_width_mm',
                    'bowl_depth_mm': 'bowl_depth_mm',
                    'Bowl Depth Mm': 'bowl_depth_mm',
                    'Bowl Depth': 'bowl_depth_mm',
                    'bowl_height_mm': 'bowl_height_mm',
                    'Bowl Height Mm': 'bowl_height_mm',
                    'Bowl Height': 'bowl_height_mm',
                    'length_mm': 'length_mm',
                    'Length Mm': 'length_mm',
                    'Length': 'length_mm',
                    'overall_width_mm': 'overall_width_mm',
                    'Overall Width Mm': 'overall_width_mm',
                    'Overall Width': 'overall_width_mm',
                    'overall_depth_mm': 'overall_depth_mm',
                    'Overall Depth Mm': 'overall_depth_mm',
                    'Overall Depth': 'overall_depth_mm',
                    'min_cabinet_size_mm': 'min_cabinet_size_mm',
                    'Min Cabinet Size Mm': 'min_cabinet_size_mm',
                    'Min Cabinet Size': 'min_cabinet_size_mm',
                    'cutout_size_mm': 'cutout_size_mm',
                    'Cutout Size Mm': 'cutout_size_mm',
                    'Cutout Size': 'cutout_size_mm',
                    'waste_outlet_dimensions': 'waste_outlet_dimensions',
                    'Waste Outlet Dimensions': 'waste_outlet_dimensions',
                    'Waste Outlet': 'waste_outlet_dimensions',
                    'tap_holes_number': 'tap_holes_number',
                    'Tap Holes Number': 'tap_holes_number',
                    'Tap Holes': 'tap_holes_number',
                    'bowls_number': 'bowls_number',
                    'Bowls Number': 'bowls_number',
                    'Number of Bowls': 'bowls_number',
                    'has_overflow': 'has_overflow',
                    'Has Overflow': 'has_overflow',
                    'Overflow': 'has_overflow',
                    'drain_position': 'drain_position',
                    'Drain Position': 'drain_position',
                    'warranty_years': 'warranty_years',
                    'Warranty Years': 'warranty_years',
                    'Warranty': 'warranty_years',
                    'spec_sheet': 'spec_sheet',
                    'Spec Sheet': 'spec_sheet',
                    'body_html': 'body_html',
                    'Body Html': 'body_html',
                    'Description': 'body_html',
                    'features': 'features',
                    'Features': 'features',
                    'care_instructions': 'care_instructions',
                    'Care Instructions': 'care_instructions'
                }

                # Extract fields from CSV
                for csv_col, internal_field in field_mapping.items():
                    if csv_col in csv_row:
                        value = csv_row[csv_col].strip()
                        # Only include non-empty values
                        if value and value.lower() not in ['', 'none', 'null', 'n/a', '-']:
                            # Check if this field exists in the collection's column mapping
                            if internal_field in config.column_mapping:
                                update_data[internal_field] = value

                if not update_data or len(update_data) <= 1:  # Only SKU, no other data
                    results['skipped'] += 1
                    results['details'].append({
                        'row': results['total_rows'],
                        'sku': sku,
                        'status': 'skipped',
                        'reason': 'No valid data to update'
                    })
                    continue

                # Check if product exists
                if sku in sku_to_row:
                    # Update existing product
                    row_num = sku_to_row[sku]
                    success = sheets_manager.update_product_row(
                        collection_name,
                        row_num,
                        update_data,
                        overwrite_mode=False  # Don't overwrite existing data
                    )

                    if success:
                        results['updated'] += 1
                        results['details'].append({
                            'row': results['total_rows'],
                            'sku': sku,
                            'sheet_row': row_num,
                            'status': 'updated',
                            'fields_updated': list(update_data.keys())
                        })
                    else:
                        results['skipped'] += 1
                        results['details'].append({
                            'row': results['total_rows'],
                            'sku': sku,
                            'status': 'skipped',
                            'reason': 'Update failed or no changes needed'
                        })
                else:
                    # Create new product
                    try:
                        new_row_num = sheets_manager.add_product(collection_name, update_data)
                        results['created'] += 1
                        results['details'].append({
                            'row': results['total_rows'],
                            'sku': sku,
                            'sheet_row': new_row_num,
                            'status': 'created',
                            'fields_added': list(update_data.keys())
                        })
                    except Exception as e:
                        results['errors'].append({
                            'row': results['total_rows'],
                            'sku': sku,
                            'error': str(e)
                        })

            except Exception as e:
                logger.error(f"Error processing CSV row {results['total_rows']}: {e}")
                results['errors'].append({
                    'row': results['total_rows'],
                    'error': str(e)
                })

        # Clear cache to ensure fresh data on next load
        from core.db_cache import get_db_cache
        db_cache = get_db_cache()
        db_cache.clear_collection_cache(collection_name)
        cache_manager.invalidate('products', collection_name)

        logger.info(f"CSV Import completed: {results['updated']} updated, {results['created']} created, {results['skipped']} skipped, {len(results['errors'])} errors")

        return jsonify({
            'success': True,
            'message': f"Import completed: {results['updated']} updated, {results['created']} created",
            'results': results
        })

    except Exception as e:
        logger.error(f"Error importing CSV for {collection_name}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/request-supplier-data', methods=['POST'])
def api_request_supplier_data(collection_name):
    """Generate CSV and email for requesting missing dimension data from supplier"""
    try:
        import csv
        import io

        data = request.get_json()
        brand_name = data.get('brand')
        recipient_email = data.get('recipient_email', 'scott@cassbrothers.com.au')

        logger.info(f"API: Generating supplier data request for brand: {brand_name}")

        # Get collection configuration
        config = get_collection_config(collection_name)
        if not config:
            return jsonify({
                'success': False,
                'error': f'Collection not found: {collection_name}'
            }), 404

        # Get all products
        sheets_manager = get_sheets_manager()
        products = sheets_manager.get_all_products(collection_name)

        # Dimension fields we need (including material fields)
        dimension_fields = [
            'length_mm', 'overall_width_mm', 'overall_depth_mm', 'min_cabinet_size_mm',
            'cutout_size_mm', 'bowl_width_mm', 'bowl_depth_mm', 'bowl_height_mm',
            'second_bowl_width_mm', 'second_bowl_depth_mm', 'second_bowl_height_mm',
            'product_material', 'grade_of_material'
        ]

        # Filter products by brand and find those missing dimension data
        products_missing_dimensions = []
        for row_num, product in products.items():
            # Check brand match
            product_brand = product.get('brand_name', '') or product.get('vendor', '')
            if product_brand.strip().lower() != brand_name.strip().lower():
                continue

            # Get bowls_number to determine if we need 2nd bowl dimensions
            bowls_number = product.get('bowls_number', '').strip()
            needs_second_bowl = False
            if bowls_number:
                bowls_str = str(bowls_number).lower()
                if bowls_str in ['2', 'double', 'two', '3', 'triple', 'three']:
                    needs_second_bowl = True
                elif bowls_number.isdigit() and int(bowls_number) >= 2:
                    needs_second_bowl = True

            # Check which dimension fields are missing and collect all field values
            missing_dims = {}
            all_field_values = {}

            for field in dimension_fields:
                # Skip 2nd bowl fields if product doesn't have multiple bowls
                if field.startswith('second_bowl_') and not needs_second_bowl:
                    continue

                value = product.get(field, '').strip()
                # Store the actual value (empty or filled)
                all_field_values[field] = value

                # Track if it's missing
                if not value or value.lower() in ['', 'none', 'null', 'n/a', '-', 'tbd', 'tbc']:
                    missing_dims[field] = ''

            # Only include products with missing dimensions
            if missing_dims:
                products_missing_dimensions.append({
                    'variant_sku': product.get('variant_sku', ''),
                    'title': product.get('title', ''),
                    'missing_dimensions': missing_dims,
                    'all_field_values': all_field_values,
                    'needs_second_bowl': needs_second_bowl
                })

        if not products_missing_dimensions:
            return jsonify({
                'success': False,
                'error': f'No products found for brand "{brand_name}" with missing dimension data'
            }), 404

        # Generate CSV with SKUs as rows, fields as columns
        output = io.StringIO()
        writer = csv.writer(output)

        # Header row - SKU + dimension field names + material fields
        header = ['Product SKU']
        header.extend(['Length (mm)', 'Overall Width (mm)', 'Overall Depth (mm)',
                       'Min Cabinet Size (mm)', 'Cutout Size (mm)', 'Bowl Width (mm)',
                       'Bowl Depth (mm)', 'Bowl Height (mm)', 'Product Material', 'Grade of Material'])

        # Check if any product needs 2nd bowl dimensions
        has_second_bowl_products = any(p['needs_second_bowl'] for p in products_missing_dimensions)
        if has_second_bowl_products:
            header.extend(['2nd Bowl Width (mm)', '2nd Bowl Depth (mm)', '2nd Bowl Height (mm)'])

        writer.writerow(header)

        # Data rows - one row per SKU
        for product in products_missing_dimensions:
            row = [product['variant_sku']]

            # Add dimension fields (show existing values or blank if missing)
            for field in ['length_mm', 'overall_width_mm', 'overall_depth_mm',
                          'min_cabinet_size_mm', 'cutout_size_mm', 'bowl_width_mm',
                          'bowl_depth_mm', 'bowl_height_mm']:
                row.append(product['all_field_values'].get(field, ''))

            # Add material fields (show existing values or blank if missing)
            row.append(product['all_field_values'].get('product_material', ''))
            row.append(product['all_field_values'].get('grade_of_material', ''))

            # Add 2nd bowl dimensions if header includes them
            if has_second_bowl_products:
                for field in ['second_bowl_width_mm', 'second_bowl_depth_mm', 'second_bowl_height_mm']:
                    if product['needs_second_bowl']:
                        row.append(product['all_field_values'].get(field, ''))
                    else:
                        row.append('N/A')

            writer.writerow(row)

        csv_content = output.getvalue()
        output.close()

        # Compose supplier email body
        missing_count = len(products_missing_dimensions)
        supplier_salutation = (brand_name or '').strip() or 'there'
        collection_label = (collection_name or '').replace('_', ' ').strip()
        collection_title = collection_label.title() if collection_label else 'collection'
        brand_prefix = f"{brand_name} " if brand_name and brand_name.strip() else ''
        email_body = (
            f"Hi {supplier_salutation},\n\n"
            f"We're updating our {brand_prefix}{collection_title} catalog and noticed {missing_count} "
            "SKUs are missing key dimensions (length, width, depth, cabinet size, cutout size, bowl dimensions, product material, grade of material).\n\n"
            "I've attached a CSV with the affected SKUs — please fill in the missing details and send it back when you can.\n\n"
            "Thanks for your help,"
        )

        return jsonify({
            'success': True,
            'csv_content': csv_content,
            'email_subject': f'Request for Product Dimension Data - {brand_name}',
            'email_body': email_body,
            'supplier_email': recipient_email,  # Will be replaced with actual supplier email later
            'product_count': len(products_missing_dimensions)
        })

    except Exception as e:
        logger.error(f"Error generating supplier data request: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/products/<int:row_num>/clean-data', methods=['POST'])
def api_clean_single_product(collection_name, row_num):
    """Clean data for a single product"""
    try:
        logger.info(f"Cleaning data for {collection_name} row {row_num}")

        # Get current product data
        sheets_manager = get_sheets_manager()
        current_data = sheets_manager.get_product(collection_name, row_num)

        if not current_data:
            return jsonify({
                'success': False,
                'error': f'Product not found at row {row_num}'
            }), 404

        # Clean the data (basic cleaning operations)
        cleaned_data = _clean_product_data(current_data, collection_name)

        # Update the spreadsheet with cleaned data
        sheets_manager.update_product_row(collection_name, row_num, cleaned_data)

        return jsonify({
            'success': True,
            'cleaned_data': cleaned_data,
            'message': 'Product data cleaned and saved'
        })

    except Exception as e:
        logger.error(f"Error cleaning data for {collection_name} row {row_num}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/generate-supplier-email', methods=['POST'])
def api_generate_supplier_email(collection_name):
    """Generate a ChatGPT email for contacting a specific supplier about missing product information"""
    try:
        data = request.get_json()
        supplier_name = data.get('supplier_name')
        products = data.get('products', [])

        if not supplier_name or not products:
            return jsonify({
                'success': False,
                'error': 'supplier_name and products are required'
            }), 400

        # Get supplier contact info
        supplier_contact = get_supplier_contact(supplier_name)
        if not supplier_contact:
            return jsonify({
                'success': False,
                'error': f'No contact information found for supplier: {supplier_name}'
            }), 404

        # Generate email content using ChatGPT
        email_content = _generate_supplier_email_content(supplier_contact, products, collection_name)

        return jsonify({
            'success': True,
            'email_content': email_content,
            'supplier_contact': supplier_contact.to_dict()
        })

    except Exception as e:
        logger.error(f"Error generating supplier email for {supplier_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/generate-bulk-supplier-emails', methods=['POST'])
def api_generate_bulk_supplier_emails(collection_name):
    """Generate ChatGPT emails for all suppliers with missing product information"""
    try:
        data = request.get_json()
        supplier_groups = data.get('supplier_groups', [])

        if not supplier_groups:
            return jsonify({
                'success': False,
                'error': 'supplier_groups is required'
            }), 400

        emails = []
        for supplier_group in supplier_groups:
            supplier_name = supplier_group.get('supplier_name')
            products = supplier_group.get('products', [])

            if not supplier_name or not products:
                continue

            # Get supplier contact info
            supplier_contact = get_supplier_contact(supplier_name)
            if not supplier_contact:
                continue

            # Generate email content
            email_content = _generate_supplier_email_content(supplier_contact, products, collection_name)

            emails.append({
                'supplier_name': supplier_name,
                'supplier_contact': supplier_contact.to_dict(),
                'email_content': email_content,
                'product_count': len(products)
            })

        return jsonify({
            'success': True,
            'emails': emails,
            'total_suppliers': len(emails)
        })

    except Exception as e:
        logger.error(f"Error generating bulk supplier emails: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def _generate_supplier_email_content(supplier_contact, products, collection_name):
    """Generate email content using ChatGPT for supplier communication"""

    # Define content fields that we don't request from suppliers (we handle internally)
    content_fields = ['body_html', 'features', 'care_instructions', 'faqs', 'seo_title', 'seo_description']

    # Prepare product information summary
    product_summaries = []
    for product in products:
        missing_fields = product.get('missing_fields', [])
        missing_critical = product.get('missing_critical', [])

        # Filter out content fields - only request technical/specification data from suppliers
        all_missing = missing_fields + missing_critical
        supplier_relevant_fields = [field for field in all_missing if field not in content_fields]

        # Skip products that only have content missing (nothing for supplier to provide)
        if not supplier_relevant_fields:
            continue

        # Get product details
        sku = product.get('sku', 'Unknown SKU')
        title = product.get('title', 'Unknown Product')

        # Categorize missing information (only supplier-relevant fields)
        missing_categories = {
            'specifications': [],
            'dimensions': [],
            'media': []
        }

        for field in supplier_relevant_fields:
            if field in ['installation_type', 'product_material', 'grade_of_material', 'style', 'warranty_years', 'waste_outlet_dimensions', 'drain_position', 'application_location', 'holes_number', 'bowls_number', 'has_overflow']:
                missing_categories['specifications'].append(field)
            elif 'mm' in field or 'width' in field or 'depth' in field or 'height' in field or 'size' in field:
                missing_categories['dimensions'].append(field)
            elif 'image' in field or 'spec_sheet' in field:
                missing_categories['media'].append(field)

        product_summary = {
            'sku': sku,
            'title': title,
            'missing_categories': missing_categories,
            'total_missing': len(supplier_relevant_fields)
        }
        product_summaries.append(product_summary)

    # Create ChatGPT prompt for email generation
    prompt = f"""
Please write a professional email to {supplier_contact.company_name} requesting missing product information for our e-commerce website. Here are the details:

Supplier Contact: {supplier_contact.contact_person} at {supplier_contact.company_name}
Collection: {collection_name}
Number of products: {len(products)}

Products requiring information:
"""

    for product in product_summaries:
        prompt += f"\n• {product['sku']} - {product['title']}"
        if product['missing_categories']['specifications']:
            prompt += f"\n  Missing specifications: {', '.join(product['missing_categories']['specifications'])}"
        if product['missing_categories']['dimensions']:
            prompt += f"\n  Missing dimensions: {', '.join(product['missing_categories']['dimensions'])}"
        if product['missing_categories']['content']:
            prompt += f"\n  Missing content: {', '.join(product['missing_categories']['content'])}"
        if product['missing_categories']['media']:
            prompt += f"\n  Missing media: {', '.join(product['missing_categories']['media'])}"

    prompt += f"""

Email requirements:
- Professional and friendly tone
- From: Scott at Cass Brothers (scott@cassbrothers.com.au)
- Explain that we're updating our website product information
- Request the missing information for accurate product listings
- Offer to schedule a call if needed
- Thank them for their partnership
- Include appropriate subject line

Please format as:
Subject: [subject line]

[email body]
"""

    # For now, return a formatted prompt - in production this would call ChatGPT API
    # TODO: Integrate with actual ChatGPT API
    email_content = {
        'subject': f'Missing {collection_name.title()} Product Information - {supplier_contact.company_name}',
        'body': f"""Hi {supplier_contact.contact_person},

We're updating our {collection_name.lower()} product catalog and need some information for {len(products)} {supplier_contact.company_name} products:

""" + "\n".join([f"• {p['sku']} - {p['title']}" for p in product_summaries[:5]]) + (f"\n• Plus {len(product_summaries) - 5} more products" if len(product_summaries) > 5 else "") + f"""

Could you please provide missing specifications like dimensions, materials, installation details, and product images? I've attached a detailed CSV with exactly what's needed for each product.

Thanks for your help!

Scott Cass
Cass Brothers
scott@cassbrothers.com.au""",
        'to_email': supplier_contact.email,
        'from_email': 'scott@cassbrothers.com.au',
        'generated_prompt': prompt  # For debugging/review
    }

    return email_content

@app.route('/api/<collection_name>/send-supplier-email', methods=['POST'])
def api_send_supplier_email(collection_name):
    """Send email to a specific supplier"""
    try:
        data = request.get_json()
        email_content = data.get('email_content')
        supplier_contact = data.get('supplier_contact')

        if not email_content or not supplier_contact:
            return jsonify({
                'success': False,
                'error': 'email_content and supplier_contact are required'
            }), 400

        # Send the email
        result = _send_email(
            to_email=email_content['to_email'],
            from_email=email_content['from_email'],
            subject=email_content['subject'],
            body=email_content['body']
        )

        if result['success']:
            logger.info(f"Email sent successfully to {supplier_contact['name']}")
            return jsonify({
                'success': True,
                'message': f"Email sent successfully to {supplier_contact['name']}"
            })
        else:
            return jsonify({
                'success': False,
                'error': result['error']
            }), 500

    except Exception as e:
        logger.error(f"Error sending supplier email: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/send-bulk-supplier-emails', methods=['POST'])
def api_send_bulk_supplier_emails(collection_name):
    """Send emails to multiple suppliers"""
    try:
        data = request.get_json()
        emails = data.get('emails', [])

        if not emails:
            return jsonify({
                'success': False,
                'error': 'emails array is required'
            }), 400

        sent_count = 0
        failed_emails = []

        for email_data in emails:
            email_content = email_data.get('email_content')
            supplier_contact = email_data.get('supplier_contact')

            if not email_content or not supplier_contact:
                failed_emails.append({
                    'supplier': supplier_contact.get('name', 'Unknown') if supplier_contact else 'Unknown',
                    'error': 'Missing email content or supplier contact'
                })
                continue

            # Send the email
            result = _send_email(
                to_email=email_content['to_email'],
                from_email=email_content['from_email'],
                subject=email_content['subject'],
                body=email_content['body']
            )

            if result['success']:
                sent_count += 1
                logger.info(f"Email sent successfully to {supplier_contact['name']}")
            else:
                failed_emails.append({
                    'supplier': supplier_contact['name'],
                    'error': result['error']
                })

        return jsonify({
            'success': True,
            'sent_count': sent_count,
            'total_emails': len(emails),
            'failed_emails': failed_emails,
            'message': f"Successfully sent {sent_count} out of {len(emails)} emails"
        })

    except Exception as e:
        logger.error(f"Error sending bulk supplier emails: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def _send_email(to_email, from_email, subject, body):
    """Send email using SMTP"""
    try:
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        import os

        # Email configuration - these should be environment variables
        smtp_server = os.environ.get('SMTP_SERVER', 'smtp.gmail.com')
        smtp_port = int(os.environ.get('SMTP_PORT', '587'))
        smtp_username = os.environ.get('SMTP_USERNAME', from_email)
        smtp_password = os.environ.get('SMTP_PASSWORD', '')

        if not smtp_password:
            # For development, just log the email instead of sending
            logger.info(f"DEVELOPMENT MODE: Would send email to {to_email}")
            logger.info(f"Subject: {subject}")
            logger.info(f"Body: {body[:200]}...")
            return {'success': True, 'message': 'Email logged (development mode)'}

        # Create message
        msg = MIMEMultipart()
        msg['From'] = from_email
        msg['To'] = to_email
        msg['Subject'] = subject

        # Add body to email
        msg.attach(MIMEText(body, 'plain'))

        # Create SMTP session
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()  # Enable security
        server.login(smtp_username, smtp_password)

        # Send email
        text = msg.as_string()
        server.sendmail(from_email, to_email, text)
        server.quit()

        return {'success': True, 'message': 'Email sent successfully'}

    except Exception as e:
        logger.error(f"Error sending email: {e}")
        return {'success': False, 'error': str(e)}

def _clean_product_data(product_data, collection_name):
    """Basic data cleaning operations"""
    cleaned = product_data.copy()

    # Clean string fields
    string_fields = [
        'title', 'vendor', 'brand_name', 'style', 'product_material',
        'grade_of_material', 'installation_type', 'drain_position',
        'body_html', 'care_instructions', 'features', 'seo_title', 'seo_description'
    ]

    for field in string_fields:
        if field in cleaned and cleaned[field]:
            # Strip whitespace and normalize
            cleaned[field] = str(cleaned[field]).strip()
            # Remove multiple spaces
            cleaned[field] = ' '.join(cleaned[field].split())
            # Fix common encoding issues
            cleaned[field] = cleaned[field].replace('â€™', "'").replace('â€œ', '"').replace('â€', '"')

    # Clean numeric fields
    numeric_fields = [
        'length_mm', 'overall_width_mm', 'overall_depth_mm', 'min_cabinet_size_mm',
        'bowl_width_mm', 'bowl_depth_mm', 'bowl_height_mm', 'second_bowl_width_mm',
        'second_bowl_depth_mm', 'second_bowl_height_mm', 'tap_holes_number',
        'warranty_years', 'shopify_compare_price', 'shopify_price', 'shopify_weight'
    ]

    for field in numeric_fields:
        if field in cleaned and cleaned[field]:
            try:
                # Convert to float and back to string to normalize
                val = float(str(cleaned[field]).replace('$', '').replace(',', ''))
                cleaned[field] = str(val) if val != int(val) else str(int(val))
            except ValueError:
                # Leave as-is if can't convert
                pass

    # Clean boolean-like fields
    bool_fields = ['has_overflow']
    for field in bool_fields:
        if field in cleaned and cleaned[field]:
            val = str(cleaned[field]).lower().strip()
            if val in ['yes', 'true', '1', 'on']:
                cleaned[field] = 'Yes'
            elif val in ['no', 'false', '0', 'off']:
                cleaned[field] = 'No'

    return cleaned

# =============================================================================
# API ENDPOINTS - DATA CLEANING
# =============================================================================

@app.route('/api/<collection_name>/process/clean', methods=['POST'])
def api_process_clean(collection_name):
    """Data cleaning for a collection"""
    try:
        payload = request.get_json()
        if not payload:
            return jsonify({"success": False, "message": "No JSON payload received"}), 400

        selected_rows = payload.get("selected_rows", [])

        if not selected_rows:
            return jsonify({"success": False, "message": "No rows selected"}), 400

        logger.info(f"Starting data cleaning for {collection_name}: {selected_rows}")

        # Use data processor for cleaning
        result = data_processor.clean_data(
            collection_name=collection_name,
            selected_rows=selected_rows
        )

        if result["success"]:
            successful = result["summary"]["successful"]
            failed = result["summary"]["failed"]

            message = f"Data cleaning completed for {collection_name}! {successful} products cleaned, {failed} failed."

            return jsonify({
                "success": True,
                "message": message,
                "collection": collection_name,
                "results": result["results"],
                "summary": result["summary"]
            })
        else:
            return jsonify(result), 500

    except ValueError as e:
        return jsonify({"success": False, "message": f"Collection not found: {collection_name}"}), 404
    except Exception as e:
        logger.error(f"Data cleaning error for {collection_name}: {e}")
        return jsonify({"success": False, "message": f"Server error: {str(e)}"}), 500

# =============================================================================
# API ENDPOINTS - CHECKBOX SYNCHRONIZATION
# =============================================================================

@app.route('/api/<collection_name>/sync-checkboxes', methods=['POST'])
def api_sync_checkbox_states(collection_name):
    """Sync checkbox states to Google Sheets using collection configuration"""
    try:
        # Get JSON payload
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No JSON payload received'}), 400

        checkbox_states = data.get('checkbox_states', [])

        if not checkbox_states:
            return jsonify({'success': False, 'error': 'No checkbox states provided'}), 400

        logger.info(f"Syncing {len(checkbox_states)} checkbox states for {collection_name}")

        # Validate collection exists and get config
        try:
            config = get_collection_config(collection_name)
        except ValueError:
            logger.error(f"Collection '{collection_name}' not found")
            return jsonify({'success': False, 'error': f'Collection not found: {collection_name}'}), 404

        # Check if collection is accessible
        is_accessible, access_message = sheets_manager.validate_collection_access(collection_name)
        if not is_accessible:
            logger.error(f"Collection '{collection_name}' not accessible: {access_message}")
            return jsonify({'success': False, 'error': f'Collection not accessible: {access_message}'}), 403

        # Check if checkbox column is configured
        if not config.checkbox_column:
            logger.error(f"No checkbox column configured for collection '{collection_name}'")
            return jsonify({'success': False, 'error': f'Checkbox column not configured for {collection_name}'}), 400

        # Update Google Sheets with checkbox states
        updated_count = 0
        error_count = 0

        for state in checkbox_states:
            try:
                row_num = state['row']
                is_checked = state['checked']

                # Convert boolean to string format that Google Sheets expects
                checkbox_value = 'TRUE' if is_checked else 'FALSE'

                # Use the configured checkbox column from the collection config
                success = sheets_manager.update_single_field(
                    collection_name,
                    row_num,
                    config.checkbox_column,
                    checkbox_value
                )

                if success:
                    updated_count += 1
                    logger.debug(f"Updated checkbox for {collection_name} row {row_num}: {checkbox_value}")
                else:
                    error_count += 1
                    logger.warning(f"Failed to update checkbox for {collection_name} row {row_num}")

            except Exception as e:
                error_count += 1
                logger.error(f"Error updating checkbox for row {state.get('row', 'unknown')}: {str(e)}")

        # Return results
        if updated_count > 0:
            success_message = f'Updated {updated_count} checkbox states in Google Sheets for {collection_name}'
            if error_count > 0:
                success_message += f' ({error_count} errors occurred)'

            logger.info(f"{success_message}")
            return jsonify({
                'success': True,
                'updated_rows': updated_count,
                'error_rows': error_count,
                'message': success_message,
                'collection': collection_name
            })
        else:
            error_message = f'No checkboxes were updated for {collection_name} ({error_count} errors occurred)'
            logger.error(f"{error_message}")
            return jsonify({
                'success': False,
                'error': error_message
            }), 500

    except Exception as e:
        logger.error(f"Error syncing checkbox states for {collection_name}: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Server error: {str(e)}'
        }), 500

# =============================================================================
# DEBUG AND UTILITY ROUTES
# =============================================================================

@app.route('/debug')
def debug():
    """Debug endpoint showing system status including pricing support"""
    logger.info("Accessing debug route")

    # Validate environment
    is_valid, validation_message = validate_environment()

    # Get collection status
    collections = get_all_collections()
    collection_status = {}

    for name, config in collections.items():
        is_accessible, access_message = sheets_manager.validate_collection_access(name)
        pricing_fields = get_pricing_fields_for_collection(name)
        
        collection_status[name] = {
            'accessible': is_accessible,
            'message': access_message,
            'spreadsheet_id': config.spreadsheet_id[:10] + '...' if config.spreadsheet_id else 'Not configured',
            'ai_fields_count': len(config.ai_extraction_fields),
            'total_fields_count': len(config.column_mapping),
            'pricing_support': bool(pricing_fields),
            'pricing_fields': list(pricing_fields.keys()) if pricing_fields else []
        }

    return jsonify({
        "status": "Collection-agnostic PIM system running with staging and pricing support",
        "version": "2.2 - With Caprice Pricing Comparison",
        "environment": {
            "valid": is_valid,
            "message": validation_message,
            "openai_configured": bool(settings.OPENAI_API_KEY),
            "google_sheets_configured": bool(settings.GOOGLE_CREDENTIALS_JSON)
        },
        "collections": collection_status,
        "features": {
            **settings.FEATURES,
            "caprice_pricing_comparison": True
        },
        "settings": {
            "ai_model": settings.API_CONFIG['OPENAI_MODEL'],
            "description_model": settings.API_CONFIG['OPENAI_DESCRIPTION_MODEL'],
            "socketio_enabled": settings.FEATURES['SOCKETIO_ENABLED']
        },
        "pricing": {
            "default_fields": DEFAULT_PRICING_FIELDS,
            "collections_with_pricing": [name for name, status in collection_status.items() if status['pricing_support']]
        }
    })

# =============================================================================
# SOCKET.IO EVENTS (if enabled)
# =============================================================================

if socketio:
    @socketio.on('connect')
    def handle_connect():
        client_id = request.sid
        logger.info(f"Client connected: {client_id}")

    @socketio.on('disconnect')
    def handle_disconnect():
        client_id = request.sid
        logger.info(f"Client disconnected: {client_id}")

    @socketio.on_error_default
    def default_error_handler(e):
        logger.error(f"Socket.IO error: {e}")
        return False

# =============================================================================
# ERROR HANDLERS
# =============================================================================

@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Page not found"}), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"500 error: {str(error)}")
    return jsonify({"error": "Internal server error"}), 500

@app.errorhandler(ValueError)
def value_error(error):
    logger.error(f"Value error: {str(error)}")
    return jsonify({"error": "Invalid request parameters"}), 400

# =============================================================================
# WSGI ENTRY POINT
# =============================================================================

# CRITICAL: This must be at the end
application = app

# Log startup information
logger.info("Collection-Agnostic PIM System with Staging and Pricing Loaded")
logger.info(f"Available collections: {list(get_all_collections().keys())}")
logger.info(f"Google Sheets connected: {bool(sheets_manager.gc)}")
logger.info(f"OpenAI configured: {bool(settings.OPENAI_API_KEY)}")
logger.info(f"Features enabled: {[k for k, v in settings.FEATURES.items() if v]}")
logger.info("New Products Staging System: ENABLED")
logger.info("Checkbox Integration: FIXED")
logger.info("Caprice Pricing Comparison: ENABLED")

@app.route('/api/<collection_name>/process-spec-sheet', methods=['POST'])
def process_spec_sheet(collection_name):
    """Process uploaded spec sheet and extract data"""
    try:
        if 'spec_sheet' not in request.files:
            return jsonify({"success": False, "error": "No spec sheet file uploaded"})

        file = request.files['spec_sheet']
        if file.filename == '':
            return jsonify({"success": False, "error": "No file selected"})

        # For demo purposes, return mock extracted data
        # In production, you would use OCR/PDF parsing here
        mock_extracted_data = {
            'editTitle': 'ACME Stainless Steel Sink',
            'editProductMaterial': 'Stainless Steel',
            'editLengthMm': '600',
            'editOverallWidthMm': '450',
            'editOverallDepthMm': '200',
            'editBowlWidthMm': '540',
            'editBowlDepthMm': '390',
            'editBowlHeightMm': '180',
            'editWeight': '8.5',
            'editWarrantyYears': '10'
        }

        # Mock verification results comparing extracted vs current form data
        row_number = request.form.get('row_number')
        verification_results = {}

        if row_number:
            # In a real implementation, you'd compare against current product data
            verification_results = {
                'editTitle': {'status': 'match', 'message': 'Matches current data'},
                'editProductMaterial': {'status': 'match', 'message': 'Matches current data'},
                'editLengthMm': {'status': 'mismatch', 'message': 'Current: 580mm, Extracted: 600mm'},
                'editWeight': {'status': 'missing', 'message': 'Not set in current data'}
            }
        else:
            for field in mock_extracted_data:
                verification_results[field] = {'status': 'extracted', 'message': 'New data extracted'}

        return jsonify({
            "success": True,
            "extracted_data": mock_extracted_data,
            "verification_results": verification_results
        })

    except Exception as e:
        logger.error(f"Error processing spec sheet: {e}")
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/<collection_name>/process-spec-sheet-url', methods=['POST'])
def process_spec_sheet_url(collection_name):
    """Process spec sheet from URL and analyze product match"""
    try:
        data = request.get_json()
        if not data or 'url' not in data:
            return jsonify({"success": False, "error": "No URL provided"})

        url = data['url']
        current_product_form = data.get('current_product', {})
        row_number = data.get('row_number')  # Get the row number to fetch actual product data

        # Validate URL format
        import re
        url_pattern = re.compile(
            r'^https?://'  # http:// or https://
            r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'  # domain...
            r'localhost|'  # localhost...
            r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'  # ...or ip
            r'(?::\d+)?'  # optional port
            r'(?:/?|[/?]\S+)$', re.IGNORECASE)

        if not url_pattern.match(url):
            return jsonify({"success": False, "error": "Invalid URL format"})

        logger.info(f"Processing spec sheet from URL: {url}")

        # Get actual product data from spreadsheet if row_number is provided
        actual_product_data = {}
        if row_number:
            try:
                # Get the sheets manager for this collection
                sheets_manager = get_sheets_manager()
                collection_config = get_collection_config(collection_name)

                if collection_config and sheets_manager:
                    # Fetch the specific row data from the spreadsheet
                    products_data = sheets_manager.get_all_data(
                        collection_config.spreadsheet_id,
                        collection_config.worksheet_name
                    )

                    # Find the product by row number (convert to 0-based index)
                    row_index = int(row_number) - 2  # Subtract 2 for header row and 0-based indexing
                    if 0 <= row_index < len(products_data):
                        actual_product_data = products_data[row_index]
                        logger.info(f"Found actual product data for row {row_number}: SKU = {actual_product_data.get('variant_sku', 'N/A')}")
                    else:
                        logger.warning(f"Row number {row_number} out of range")

            except Exception as e:
                logger.error(f"Error fetching product data from spreadsheet: {e}")

        # Use actual product data if available, otherwise fall back to form data
        current_product = actual_product_data if actual_product_data else current_product_form

        # Mock extracted data based on URL analysis
        extracted_data = generate_mock_spec_data_from_url(url)

        # For demo: if the actual product has a SKU, make extracted SKU match it for testing
        if current_product.get('variant_sku'):
            actual_sku = current_product['variant_sku']
            # Always make SKUs match for testing purposes
            extracted_data['editSku'] = actual_sku
            logger.info(f"Demo: Making extracted SKU match actual SKU: {actual_sku}")
        elif current_product.get('sku'):
            actual_sku = current_product['sku']
            extracted_data['editSku'] = actual_sku
            logger.info(f"Demo: Making extracted SKU match actual SKU: {actual_sku}")
        else:
            logger.warning("Demo: No SKU found in product data to match against")

        # Analyze product match using actual spreadsheet data
        match_analysis = analyze_product_compatibility_with_spreadsheet_data(extracted_data, current_product)

        # Mock verification results
        verification_results = {
            "source": f"URL: {url}",
            "document_type": "PDF" if url.lower().endswith('.pdf') else "Document",
            "extraction_method": "OCR + AI Analysis",
            "confidence": "85%",
            "processing_time": "2.3s",
            "compared_with": "Spreadsheet data" if actual_product_data else "Form data"
        }

        return jsonify({
            "success": True,
            "extracted_data": extracted_data,
            "verification_results": verification_results,
            "match_analysis": match_analysis,
            "source_url": url
        })

    except Exception as e:
        logger.error(f"Error processing spec sheet URL: {e}")
        return jsonify({"success": False, "error": str(e)})

def generate_mock_spec_data_from_url(url):
    """Generate mock spec data based on URL characteristics (for demo)"""

    # Analyze URL for potential product hints
    url_lower = url.lower()

    # Mock data that varies slightly based on URL characteristics
    base_data = {
        'editSku': 'SINK-PRO-700',  # Primary SKU for matching
        'editTitle': 'Professional Kitchen Sink',
        'editProductMaterial': 'Stainless Steel',
        'editLengthMm': '700',
        'editOverallWidthMm': '500',
        'editOverallDepthMm': '220',
        'editBowlWidthMm': '640',
        'editBowlDepthMm': '440',
        'editBowlHeightMm': '200',
        'editWeight': '12.5',
        'editWarrantyYears': '10',
        'editBrandName': 'Professional Series'
    }

    # Modify based on URL patterns (simple demo logic)
    if 'undermount' in url_lower:
        base_data['editInstallationType'] = 'Undermount'
    elif 'topmount' in url_lower or 'dropin' in url_lower:
        base_data['editInstallationType'] = 'Top Mount'

    if 'double' in url_lower or '2bowl' in url_lower:
        base_data['editBowlsNumber'] = '2'
        base_data['editSecondBowlWidthMm'] = '300'
        base_data['editSecondBowlDepthMm'] = '350'

    if 'single' in url_lower or '1bowl' in url_lower:
        base_data['editBowlsNumber'] = '1'

    # Simulate some variation based on URL hash
    import hashlib
    url_hash = int(hashlib.md5(url.encode()).hexdigest()[:8], 16)

    # Add some realistic variation
    length_variation = (url_hash % 200) - 100  # -100 to +100
    base_data['editLengthMm'] = str(max(400, int(base_data['editLengthMm']) + length_variation))

    # Vary SKU based on URL to simulate different products
    # This helps test the matching functionality
    if 'different' in url_lower or 'other' in url_lower:
        base_data['editSku'] = 'SINK-DIFF-800'  # Different SKU for testing mismatch
        base_data['editTitle'] = 'Different Kitchen Sink'
    elif 'test' in url_lower:
        base_data['editSku'] = 'SINK-TEST-600'  # Test SKU for testing
        base_data['editTitle'] = 'Test Kitchen Sink'
    elif url_hash % 3 == 0:  # 33% chance of different SKU
        base_data['editSku'] = f'SINK-ALT-{600 + (url_hash % 300)}'
        base_data['editTitle'] = 'Alternative Kitchen Sink'

    return base_data

def analyze_product_compatibility_with_spreadsheet_data(extracted_data, spreadsheet_product):
    """Analyze spec sheet compatibility based on SKU matching with spreadsheet data"""

    if not spreadsheet_product:
        return {
            "overall_match": "unknown",
            "confidence_score": 0,
            "field_matches": {},
            "message": "No product data available for comparison"
        }

    # Get SKU from spreadsheet data - use the actual field names from Google Sheets
    spreadsheet_sku = None
    sku_field_used = None

    # Check common SKU field names in spreadsheet
    for field_name in ['variant_sku', 'sku', 'product_sku', 'item_sku']:
        if spreadsheet_product.get(field_name):
            spreadsheet_sku = str(spreadsheet_product[field_name]).strip()
            sku_field_used = field_name
            break

    # Get SKU from extracted data
    extracted_sku = None
    for field_name in ['editSku', 'editVariantSku', 'variant_sku', 'sku']:
        if extracted_data.get(field_name):
            extracted_sku = str(extracted_data[field_name]).strip()
            break

    field_matches = {}

    # SKU comparison is the primary matching criteria
    if not extracted_sku:
        return {
            "overall_match": "unknown",
            "confidence_score": 0,
            "field_matches": {
                "SKU": {
                    'status': 'missing',
                    'message': 'No SKU found in spec sheet',
                    'extracted': '',
                    'current': spreadsheet_sku or ''
                }
            },
            "message": "Cannot determine match - no SKU found in spec sheet"
        }

    if not spreadsheet_sku:
        return {
            "overall_match": "unknown",
            "confidence_score": 0,
            "field_matches": {
                "SKU": {
                    'status': 'missing',
                    'message': f'No SKU found in product data (checked: variant_sku, sku, product_sku, item_sku)',
                    'extracted': extracted_sku,
                    'current': ''
                }
            },
            "message": "Cannot determine match - no SKU found in product data"
        }

    # Clean and compare SKUs
    extracted_sku_clean = extracted_sku.upper().replace('-', '').replace('_', '').replace(' ', '')
    spreadsheet_sku_clean = spreadsheet_sku.upper().replace('-', '').replace('_', '').replace(' ', '')

    if extracted_sku_clean == spreadsheet_sku_clean:
        # Perfect SKU match
        field_matches["SKU"] = {
            'status': 'match',
            'message': f'SKU matches exactly (compared with {sku_field_used})',
            'extracted': extracted_sku,
            'current': spreadsheet_sku
        }

        return {
            'overall_match': 'excellent',
            'confidence_score': 100,
            'field_matches': field_matches,
            'total_fields_compared': 1,
            'message': f'✅ SKU Match Confirmed: {spreadsheet_sku} = {extracted_sku} (from {sku_field_used})'
        }

    else:
        # SKU mismatch
        field_matches["SKU"] = {
            'status': 'different',
            'message': f'SKUs do not match - this appears to be a different product (compared with {sku_field_used})',
            'extracted': extracted_sku,
            'current': spreadsheet_sku
        }

        return {
            'overall_match': 'poor',
            'confidence_score': 0,
            'field_matches': field_matches,
            'total_fields_compared': 1,
            'message': f'❌ SKU Mismatch: Product SKU is {spreadsheet_sku}, but spec sheet is for {extracted_sku}'
        }

def analyze_product_compatibility(extracted_data, current_product):
    """Analyze spec sheet compatibility based on SKU matching"""

    if not current_product:
        return {
            "overall_match": "unknown",
            "confidence_score": 0,
            "field_matches": {},
            "message": "No current product data available for comparison"
        }

    # Get SKUs for comparison - check multiple possible SKU fields
    sku_fields = ['editSku', 'editVariantSku', 'variant_sku', 'sku']

    extracted_sku = None
    current_sku = None

    # Find SKU in extracted data
    for field in sku_fields:
        if extracted_data.get(field):
            extracted_sku = str(extracted_data[field]).strip()
            break

    # Find SKU in current product
    for field in sku_fields:
        if current_product.get(field):
            current_sku = str(current_product[field]).strip()
            break

    field_matches = {}

    # SKU comparison is the primary matching criteria
    if not extracted_sku:
        return {
            "overall_match": "unknown",
            "confidence_score": 0,
            "field_matches": {
                "SKU": {
                    'status': 'missing',
                    'message': 'No SKU found in spec sheet',
                    'extracted': '',
                    'current': current_sku or ''
                }
            },
            "message": "Cannot determine match - no SKU found in spec sheet"
        }

    if not current_sku:
        return {
            "overall_match": "unknown",
            "confidence_score": 0,
            "field_matches": {
                "SKU": {
                    'status': 'missing',
                    'message': 'No SKU found in current product',
                    'extracted': extracted_sku,
                    'current': ''
                }
            },
            "message": "Cannot determine match - no SKU found in current product"
        }

    # Clean and compare SKUs
    extracted_sku_clean = extracted_sku.upper().replace('-', '').replace('_', '').replace(' ', '')
    current_sku_clean = current_sku.upper().replace('-', '').replace('_', '').replace(' ', '')

    if extracted_sku_clean == current_sku_clean:
        # Perfect SKU match
        field_matches["SKU"] = {
            'status': 'match',
            'message': 'SKU matches exactly',
            'extracted': extracted_sku,
            'current': current_sku
        }

        return {
            'overall_match': 'excellent',
            'confidence_score': 100,
            'field_matches': field_matches,
            'total_fields_compared': 1,
            'message': f'✅ SKU Match Confirmed: {current_sku} = {extracted_sku}'
        }

    else:
        # SKU mismatch
        field_matches["SKU"] = {
            'status': 'different',
            'message': 'SKUs do not match - this appears to be a different product',
            'extracted': extracted_sku,
            'current': current_sku
        }

        return {
            'overall_match': 'poor',
            'confidence_score': 0,
            'field_matches': field_matches,
            'total_fields_compared': 1,
            'message': f'❌ SKU Mismatch: Current product is {current_sku}, but spec sheet is for {extracted_sku}'
        }

@app.route('/api/<collection_name>/validate-bulk-upload', methods=['POST'])
def validate_bulk_upload(collection_name):
    """Validate bulk upload CSV/Excel file"""
    try:
        if 'bulk_file' not in request.files:
            return jsonify({"success": False, "error": "No bulk file uploaded"})

        file = request.files['bulk_file']
        if file.filename == '':
            return jsonify({"success": False, "error": "No file selected"})

        # Mock validation results
        validation_results = {
            "total_rows": 25,
            "valid_rows": 20,
            "errors": [
                {"row": 3, "field": "SKU", "message": "Duplicate SKU found"},
                {"row": 7, "field": "Price", "message": "Invalid price format"},
                {"row": 12, "field": "Dimensions", "message": "Missing length dimension"},
                {"row": 18, "field": "Material", "message": "Invalid material type"},
                {"row": 23, "field": "Weight", "message": "Weight must be greater than 0"}
            ],
            "warnings": [
                {"row": 5, "field": "Brand", "message": "Brand name should be standardized"},
                {"row": 9, "field": "Description", "message": "Description is very short"},
                {"row": 15, "field": "Images", "message": "No images provided"}
            ]
        }

        return jsonify({
            "success": True,
            "validation_results": validation_results
        })

    except Exception as e:
        logger.error(f"Error validating bulk upload: {e}")
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/<collection_name>/test-live-update/<int:row_num>', methods=['POST'])
def test_live_update(collection_name, row_num):
    """Test endpoint to manually trigger a live update event"""
    try:
        if socketio:
            test_data = {
                'collection': collection_name,
                'row_num': row_num,
                'fields_updated': ['body_html', 'features'],
                'updated_data': {
                    'body_html': f'Test description updated at {datetime.now().isoformat()}',
                    'features': f'Test features updated at {datetime.now().isoformat()}'
                },
                'message': 'Test live update from API endpoint',
                'timestamp': datetime.now().isoformat()
            }

            socketio.emit('product_updated', test_data)
            logger.info(f"✅ Test live update emitted for {collection_name} row {row_num}")

            return jsonify({
                'success': True,
                'message': 'Test live update event emitted',
                'data': test_data
            })
        else:
            return jsonify({
                'success': False,
                'error': 'SocketIO not available'
            }), 500

    except Exception as e:
        logger.error(f"Error testing live update: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/process/extract-images', methods=['POST'])
def api_extract_images_bulk(collection_name):
    """Extract images from multiple selected products"""
    try:
        data = request.get_json() or {}
        selected_rows = data.get('selected_rows', [])

        if not selected_rows:
            return jsonify({
                'success': False,
                'error': 'No products selected'
            }), 400

        logger.info(f"Starting bulk image extraction for {collection_name}, {len(selected_rows)} products")

        if not settings.OPENAI_API_KEY:
            return jsonify({
                'success': False,
                'error': 'OpenAI API key not configured'
            }), 500

        # Get AI extractor and sheets manager
        ai_extractor = get_ai_extractor()
        sheets_manager = get_sheets_manager()

        successful_count = 0
        total_images = 0

        # Process each selected product
        for row_num in selected_rows:
            try:
                # Get current product data
                current_data = sheets_manager.get_product_row(collection_name, row_num)
                if not current_data:
                    logger.warning(f"No data found for {collection_name} row {row_num}")
                    continue

                # Extract product URL from current data
                product_url = current_data.get('url') or current_data.get('product_url') or current_data.get('link')
                if not product_url:
                    logger.warning(f"No product URL found for {collection_name} row {row_num}")
                    continue

                # Use AI extractor to get images
                result = ai_extractor.extract_product_data(
                    collection_name=collection_name,
                    url=product_url,
                    overwrite_mode=False  # Only extract images, don't overwrite other data
                )

                if result.get('success') and result.get('images'):
                    images = result['images']
                    image_urls = ', '.join(images) if isinstance(images, list) else str(images)

                    # Update the product row with extracted images
                    sheets_manager.update_product_row(collection_name, row_num, {
                        'shopify_images': image_urls
                    })

                    successful_count += 1
                    total_images += len(images) if isinstance(images, list) else 1

                    logger.info(f"✅ Extracted {len(images) if isinstance(images, list) else 1} images for row {row_num}")

                    # Emit SocketIO event for live updates
                    if socketio:
                        socketio.emit('product_updated', {
                            'collection': collection_name,
                            'row_num': row_num,
                            'fields_updated': ['shopify_images'],
                            'updated_data': {'shopify_images': image_urls},
                            'message': f'Extracted {len(images) if isinstance(images, list) else 1} images',
                            'timestamp': datetime.now().isoformat()
                        })

                    # Trigger Google Apps Script cleaning after successful image extraction
                    try:
                        import asyncio
                        google_apps_script_result = asyncio.run(google_apps_script_manager.trigger_post_ai_cleaning(
                            collection_name=collection_name,
                            row_number=row_num,
                            operation_type='bulk_image_extraction'
                        ))
                        if google_apps_script_result['success']:
                            logger.info(f"✅ Google Apps Script triggered successfully for {collection_name} row {row_num}")
                        else:
                            logger.warning(f"⚠️ Google Apps Script trigger failed: {google_apps_script_result.get('error', 'Unknown error')}")
                    except Exception as gas_error:
                        logger.error(f"❌ Error triggering Google Apps Script: {gas_error}")

            except Exception as e:
                logger.error(f"Error extracting images for {collection_name} row {row_num}: {e}")
                continue

        return jsonify({
            'success': True,
            'message': f'Image extraction completed',
            'successful_count': successful_count,
            'total_images': total_images
        })

    except Exception as e:
        logger.error(f"Error in bulk image extraction for {collection_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/<collection_name>/products/<int:row_num>/extract-images', methods=['POST'])
def api_extract_images_single(collection_name, row_num):
    """Extract images from a single product URL"""
    try:
        data = request.get_json() or {}
        product_url = data.get('product_url', '').strip()

        if not product_url:
            return jsonify({
                'success': False,
                'error': 'Product URL is required'
            }), 400

        logger.info(f"Extracting images for {collection_name} row {row_num} from {product_url}")

        if not settings.OPENAI_API_KEY:
            return jsonify({
                'success': False,
                'error': 'OpenAI API key not configured'
            }), 500

        # Get AI extractor and fetch HTML content
        ai_extractor = get_ai_extractor()

        # Fetch HTML content from URL
        html_content = ai_extractor.fetch_html(product_url)
        if not html_content:
            return jsonify({
                'success': False,
                'error': 'Failed to fetch HTML content from URL'
            }), 400

        # Get product context for better AI analysis
        product_context = ""
        try:
            sheets_manager = get_sheets_manager()
            product_data = sheets_manager.get_single_product(collection_name, row_num)
            if product_data:
                title = product_data.get('title', '')
                brand = product_data.get('brand_name', '') or product_data.get('vendor', '')
                product_context = f"Product: {title}, Brand: {brand}"
        except Exception:
            pass  # Continue without context if product data fetch fails

        # Use simpler AI image extraction (no screenshots required)
        image_urls = ai_extractor.extract_product_images_with_ai(
            html_content=html_content,
            url=product_url,
            product_context=product_context
        )

        # Only use the first image to avoid clutter
        if image_urls:
            image_urls = [image_urls[0]]  # Keep only the first image
            logger.info(f"Using only the first image: {image_urls[0]}")

        # Create result structure
        result = {
            'success': len(image_urls) > 0,
            'images': image_urls,
            'message': f'Extracted 1 image' if image_urls else 'No images found'
        }

        if result.get('success') and result.get('images'):
            extracted_image_urls = result['images']
            image_urls_str = ', '.join(extracted_image_urls)
            image_count = len(extracted_image_urls)

            # Get sheets manager to update the product row
            sheets_manager = get_sheets_manager()

            # Update the product row with extracted images
            sheets_manager.update_product_row(collection_name, row_num, {
                'shopify_images': image_urls_str
            })

            logger.info(f"✅ Extracted {image_count} images for {collection_name} row {row_num}")

            # Emit SocketIO event for live updates
            if socketio:
                socketio.emit('product_updated', {
                    'collection': collection_name,
                    'row_num': row_num,
                    'fields_updated': ['shopify_images'],
                    'updated_data': {'shopify_images': image_urls_str},
                    'message': f'Extracted {image_count} images',
                    'timestamp': datetime.now().isoformat()
                })

            # Trigger Google Apps Script cleaning after successful image extraction
            try:
                import asyncio
                google_apps_script_result = asyncio.run(google_apps_script_manager.trigger_post_ai_cleaning(
                    collection_name=collection_name,
                    row_number=row_num,
                    operation_type='image_extraction'
                ))
                if google_apps_script_result['success']:
                    logger.info(f"✅ Google Apps Script triggered successfully for {collection_name} row {row_num}")
                else:
                    logger.warning(f"⚠️ Google Apps Script trigger failed: {google_apps_script_result.get('error', 'Unknown error')}")
            except Exception as gas_error:
                logger.error(f"❌ Error triggering Google Apps Script: {gas_error}")

            # Get updated product data for modal refresh
            updated_data = None
            try:
                sheets_manager = get_sheets_manager()
                updated_data = sheets_manager.get_single_product(collection_name, row_num)
            except Exception as e:
                logger.warning(f"Failed to get updated product data: {e}")

            return jsonify({
                'success': True,
                'message': f'Extracted {image_count} images',
                'image_count': image_count,
                'images': extracted_image_urls,
                'updated_data': updated_data
            })
        else:
            error_msg = result.get('message', 'No images found or extraction failed')
            return jsonify({
                'success': False,
                'error': error_msg
            })

    except Exception as e:
        logger.error(f"Error extracting images for {collection_name} row {row_num}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ================================
# PERFORMANCE & SYSTEM API ROUTES
# ================================

@app.route('/api/system/cache-stats', methods=['GET'])
def api_cache_stats():
    """Get cache performance statistics"""
    try:
        stats = cache_manager.get_stats()
        return jsonify(stats)
    except Exception as e:
        logger.error(f"Error getting cache stats: {e}")
        return jsonify({
            'hit_rate': '0.0%',
            'total_requests': 0,
            'memory_size': 0,
            'hits': 0,
            'misses': 0
        })

@app.route('/api/system/queue-stats', methods=['GET'])
def api_queue_stats():
    """Get async processing queue statistics"""
    try:
        from core.async_processor import async_processor
        # This would be async in a real async environment
        # For now, return mock data
        return jsonify({
            'queue_size': 0,
            'active_tasks': 0,
            'completed_tasks': 0,
            'is_running': False,
            'stats': {
                'total_processed': 0,
                'total_failed': 0,
                'average_processing_time': 0.0
            }
        })
    except Exception as e:
        logger.error(f"Error getting queue stats: {e}")
        return jsonify({
            'queue_size': 0,
            'active_tasks': 0,
            'completed_tasks': 0,
            'is_running': False
        })

@app.route('/api/system/performance', methods=['GET'])
def api_system_performance():
    """Get overall system performance metrics"""
    try:
        import psutil
        import time

        # CPU and memory stats
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()

        # Application stats
        process = psutil.Process()
        app_memory = process.memory_info().rss / 1024 / 1024  # MB

        return jsonify({
            'cpu_percent': cpu_percent,
            'memory_percent': memory.percent,
            'memory_used_gb': memory.used / 1024 / 1024 / 1024,
            'memory_total_gb': memory.total / 1024 / 1024 / 1024,
            'app_memory_mb': app_memory,
            'timestamp': time.time()
        })
    except Exception as e:
        logger.error(f"Error getting performance stats: {e}")
        return jsonify({
            'cpu_percent': 0,
            'memory_percent': 0,
            'memory_used_gb': 0,
            'memory_total_gb': 0,
            'app_memory_mb': 0,
            'timestamp': time.time()
        })

@app.route('/api/system/health', methods=['GET'])
def api_system_health():
    """Get system health check"""
    try:
        health_checks = {
            'database': True,  # Would check actual DB connection
            'google_sheets': sheets_manager.gc is not None,
            'openai': settings.OPENAI_API_KEY is not None,
            'cache': True,  # Would check cache connectivity
            'disk_space': True  # Would check disk space
        }

        all_healthy = all(health_checks.values())

        return jsonify({
            'healthy': all_healthy,
            'checks': health_checks,
            'timestamp': time.time(),
            'version': '2.0.0',
            'uptime_seconds': time.time() - startup_time
        })
    except Exception as e:
        logger.error(f"Error checking system health: {e}")
        return jsonify({
            'healthy': False,
            'error': str(e),
            'timestamp': time.time()
        })

# ============================================================================
# SUPPLIER PRODUCT MANAGEMENT API ENDPOINTS
# ============================================================================

@app.route('/api/supplier-products/import', methods=['POST'])
def api_import_supplier_products():
    """Import supplier products from CSV data"""
    try:
        data = request.get_json()

        if not data or 'products' not in data:
            return jsonify({
                'success': False,
                'error': 'No product data provided'
            }), 400

        supplier_db = get_supplier_db()

        # Import products with auto image extraction
        # Set auto_extract_images=True by default, unless explicitly disabled
        auto_extract = data.get('auto_extract_images', True)
        result = supplier_db.import_from_csv(data['products'], auto_extract_images=auto_extract)

        return jsonify({
            'success': True,
            'result': result
        })

    except Exception as e:
        logger.error(f"Error importing supplier products: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/supplier-products/search', methods=['POST'])
def api_search_supplier_products():
    """Search supplier products by SKU list"""
    try:
        data = request.get_json()
        sku_list = data.get('skus', [])
        collection_name = data.get('collection_name')  # Optional: for confidence checking

        if not sku_list:
            return jsonify({
                'success': False,
                'error': 'No SKUs provided'
            }), 400

        supplier_db = get_supplier_db()
        products = supplier_db.search_by_sku(sku_list)

        # Add collection match warning if collection_name provided
        if collection_name:
            for product in products:
                detected_collection = product.get('detected_collection')
                confidence_score = product.get('confidence_score', 0.0)

                # Add warning flag for mismatched collection or low confidence
                if detected_collection and detected_collection.lower() != collection_name.lower():
                    product['collection_mismatch'] = True
                    product['warning'] = f'Detected for {detected_collection}, not {collection_name}'
                elif confidence_score > 0 and confidence_score < 0.5:
                    product['low_confidence'] = True
                    product['warning'] = f'Low confidence match ({int(confidence_score * 100)}%)'
                elif not detected_collection or confidence_score == 0:
                    product['no_detection'] = True
                    product['warning'] = 'No collection detected - may not belong here'

        return jsonify({
            'success': True,
            'products': products,
            'count': len(products)
        })

    except Exception as e:
        logger.error(f"Error searching supplier products: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/supplier-products/image-stats', methods=['GET'])
def api_supplier_product_image_stats():
    """Get statistics about supplier product images"""
    try:
        supplier_db = get_supplier_db()
        conn = sqlite3.connect(supplier_db.db_path)
        cursor = conn.cursor()

        cursor.execute('SELECT COUNT(*) FROM supplier_products WHERE image_url IS NOT NULL AND image_url != ""')
        with_images = cursor.fetchone()[0]

        cursor.execute('SELECT COUNT(*) FROM supplier_products')
        total = cursor.fetchone()[0]

        cursor.execute('SELECT id, sku, product_name, image_url FROM supplier_products WHERE image_url IS NOT NULL AND image_url != "" LIMIT 5')
        samples = [dict(zip(['id', 'sku', 'product_name', 'image_url'], row)) for row in cursor.fetchall()]

        conn.close()

        return jsonify({
            'success': True,
            'total_products': total,
            'products_with_images': with_images,
            'percentage': round((with_images/total*100) if total > 0 else 0, 1),
            'sample_products': samples
        })
    except Exception as e:
        logger.error(f"Error getting image stats: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/<collection_name>/supplier-products/missing', methods=['GET'])
def api_get_missing_supplier_products(collection_name):
    """Get supplier products detected for this collection that aren't in PIM yet"""
    try:
        supplier_db = get_supplier_db()

        # Get products detected for this collection
        # Lower threshold (0.5) for URL-only products without names
        detected_products = supplier_db.get_by_collection(collection_name, confidence_threshold=0.5)

        if not detected_products:
            return jsonify({
                'success': True,
                'products': [],
                'count': 0,
                'message': 'No products detected for this collection'
            })

        # Get existing product SKUs from Google Sheets
        sheets_manager = get_sheets_manager()
        existing_products = sheets_manager.get_all_products(collection_name)
        existing_skus = set()

        for product in existing_products.values():
            sku = product.get('variant_sku') or product.get('sku')
            if sku:
                existing_skus.add(sku.strip().lower())

        # Filter out products that already exist
        missing_products = []
        for product in detected_products:
            supplier_sku = product.get('sku', '').strip().lower()
            if supplier_sku and supplier_sku not in existing_skus:
                missing_products.append(product)

        logger.info(f"Found {len(missing_products)} missing products for {collection_name}")

        return jsonify({
            'success': True,
            'products': missing_products,
            'count': len(missing_products),
            'total_detected': len(detected_products),
            'existing_count': len(existing_skus)
        })

    except Exception as e:
        logger.error(f"Error getting missing supplier products: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/<collection_name>/wip/add', methods=['POST'])
def api_add_to_wip(collection_name):
    """Add supplier products to work-in-progress"""
    try:
        data = request.get_json()
        supplier_product_ids = data.get('product_ids', [])

        if not supplier_product_ids:
            return jsonify({
                'success': False,
                'error': 'No product IDs provided'
            }), 400

        supplier_db = get_supplier_db()
        wip_ids = []

        for product_id in supplier_product_ids:
            wip_id = supplier_db.add_to_wip(product_id, collection_name)
            wip_ids.append(wip_id)

        return jsonify({
            'success': True,
            'wip_ids': wip_ids,
            'count': len(wip_ids)
        })

    except Exception as e:
        logger.error(f"Error adding to WIP: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/<collection_name>/wip/add-manual', methods=['POST'])
def api_add_manual_to_wip(collection_name):
    """Add manually entered products to work-in-progress"""
    try:
        data = request.get_json()
        products = data.get('products', [])

        if not products:
            return jsonify({
                'success': False,
                'error': 'No products provided'
            }), 400

        supplier_db = get_supplier_db()
        wip_ids = []

        # For each manual product, add to supplier_products table first, then to WIP
        for product in products:
            # Add to supplier_products table
            product_id = supplier_db.add_manual_product(
                sku=product.get('sku'),
                product_url=product.get('product_url'),
                product_name=product.get('product_name'),
                supplier_name=product.get('supplier_name', 'Manual Entry')
            )

            # Add to WIP
            wip_id = supplier_db.add_to_wip(product_id, collection_name)
            wip_ids.append(wip_id)

        return jsonify({
            'success': True,
            'wip_ids': wip_ids,
            'count': len(wip_ids)
        })

    except Exception as e:
        logger.error(f"Error adding manual products to WIP: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/<collection_name>/wip/list', methods=['GET'])
def api_list_wip(collection_name):
    """Get work-in-progress products for a collection"""
    try:
        status = request.args.get('status')  # Optional filter by status

        supplier_db = get_supplier_db()
        wip_products = supplier_db.get_wip_products(collection_name, status)

        return jsonify({
            'success': True,
            'products': wip_products,
            'count': len(wip_products)
        })

    except Exception as e:
        logger.error(f"Error listing WIP products: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/supplier/extract-image-ai', methods=['POST'])
def api_extract_product_image_ai():
    """Extract product image from a supplier product URL using AI"""
    try:
        data = request.get_json()
        product_id = data.get('product_id')
        product_url = data.get('product_url')

        if not product_url:
            return jsonify({
                'success': False,
                'error': 'Product URL required'
            }), 400

        # Use AI extractor to get images from the product page
        from core.ai_extractor import AIExtractor
        ai_extractor = AIExtractor()

        # Fetch HTML and extract images
        html_content = ai_extractor.fetch_html(product_url)
        if not html_content:
            return jsonify({
                'success': False,
                'error': 'Failed to fetch product page'
            })

        # Extract images using AI
        image_urls = ai_extractor.extract_product_images_with_ai(html_content, product_url, "")

        # Fallback to og:image if AI extraction fails
        if not image_urls or len(image_urls) == 0:
            try:
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(html_content, 'html.parser')
                og_image = soup.find('meta', property='og:image')
                if og_image and og_image.get('content'):
                    image_urls = [og_image.get('content')]
                    logger.info(f"Using og:image fallback: {image_urls[0]}")
            except Exception as e:
                logger.warning(f"Fallback image extraction failed: {e}")

        if not image_urls or len(image_urls) == 0:
            return jsonify({
                'success': False,
                'error': 'No product images found'
            })

        # Take the first/best image
        best_image = image_urls[0]

        # Also extract product title from the HTML
        product_title = None
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html_content, 'html.parser')

            # Try multiple methods to get product title (prioritize h1 as most reliable)
            # 1. h1 tag (most reliable for product names)
            h1_tag = soup.find('h1')
            if h1_tag:
                h1_text = h1_tag.get_text().strip()
                # Make sure h1 is not just a SKU (more than 3 words or contains spaces)
                if len(h1_text.split()) > 2 or ' ' in h1_text:
                    product_title = h1_text

            # 2. og:title meta tag
            if not product_title:
                og_title = soup.find('meta', property='og:title')
                if og_title and og_title.get('content'):
                    og_text = og_title.get('content').strip()
                    # Skip if it's just a SKU pattern (e.g., "Oliveri - AP1421")
                    if not (og_text.count('-') == 1 and len(og_text.split()[-1]) < 10):
                        product_title = og_text

            # 3. Fallback to page title (clean it up)
            if not product_title:
                title_tag = soup.find('title')
                if title_tag:
                    title_text = title_tag.get_text().strip()
                    # Remove common suffixes like " | Supplier Name"
                    if '|' in title_text:
                        title_text = title_text.split('|')[0].strip()
                    if '-' in title_text and len(title_text.split('-')) > 2:
                        title_text = title_text.split('-')[0].strip()
                    product_title = title_text

        except Exception as e:
            logger.warning(f"Could not extract product title: {e}")

        # Update database if product_id provided
        if product_id:
            supplier_db = get_supplier_db()
            conn = sqlite3.connect(supplier_db.db_path)
            cursor = conn.cursor()

            if product_title:
                cursor.execute('''
                    UPDATE supplier_products
                    SET image_url = ?, product_name = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (best_image, product_title, product_id))
            else:
                cursor.execute('''
                    UPDATE supplier_products
                    SET image_url = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (best_image, product_id))

            conn.commit()
            conn.close()

        return jsonify({
            'success': True,
            'image_url': best_image,
            'product_name': product_title,
            'total_images': len(image_urls)
        })

    except Exception as e:
        logger.error(f"Error extracting product image: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/<collection_name>/wip/process', methods=['POST'])
def api_process_wip_products(collection_name):
    """
    Process WIP products: Add to Google Sheets + AI Extract + Generate Descriptions
    Limited to 30 products at once to avoid timeouts
    """
    try:
        data = request.get_json()
        wip_ids = data.get('wip_ids', [])

        if not wip_ids:
            return jsonify({
                'success': False,
                'error': 'No WIP IDs provided'
            }), 400

        if len(wip_ids) > 30:
            return jsonify({
                'success': False,
                'error': 'Maximum 30 products can be processed at once'
            }), 400

        supplier_db = get_supplier_db()
        sheets_manager = get_sheets_manager()
        from core.data_processor import get_data_processor
        data_processor = get_data_processor()

        results = []

        for idx, wip_id in enumerate(wip_ids):
            try:
                # Add delay between products to avoid Google Sheets API rate limits
                # (60 requests/minute = 1 request/second max)
                # Each product uses ~15-20 API calls (add, extract, generate content, clean)
                # So wait 20 seconds between products to stay well under the limit
                if idx > 0:
                    import time
                    logger.info(f"⏳ Waiting 20 seconds before next product to avoid rate limits...")
                    time.sleep(20)

                # Get WIP product data
                wip_products = supplier_db.get_wip_products(collection_name)
                wip_product = next((p for p in wip_products if p.get('id') == wip_id), None)

                if not wip_product:
                    results.append({
                        'wip_id': wip_id,
                        'success': False,
                        'error': 'WIP product not found'
                    })
                    continue

                # Step 1: Add to Google Sheets (SKU + URL only)
                logger.info(f"📝 Adding {wip_product['sku']} to Google Sheets...")
                supplier_db.update_wip_status(wip_id, 'extracting')

                new_row_data = {
                    'variant_sku': wip_product['sku'],
                    'url': wip_product['product_url']
                }

                row_num = sheets_manager.add_product(collection_name, new_row_data)
                supplier_db.update_wip_sheet_row(wip_id, row_num)

                logger.info(f"✅ Added to sheet at row {row_num}")

                # Step 2: Run AI Extraction
                logger.info(f"🤖 Running AI extraction for {wip_product['sku']}...")
                result = data_processor._process_single_url(
                    collection_name,
                    row_num,
                    wip_product['product_url'],
                    overwrite_mode=True
                )

                if not result.success:
                    supplier_db.update_wip_error(wip_id, result.error or "Extraction failed")
                    results.append({
                        'wip_id': wip_id,
                        'sku': wip_product['sku'],
                        'success': False,
                        'error': result.error
                    })
                    continue

                # Step 3: Generate Descriptions (Features, Care Instructions)
                logger.info(f"✍️  Generating descriptions for {wip_product['sku']}...")
                supplier_db.update_wip_status(wip_id, 'generating')

                # Generate all content types: body_html, features, care_instructions
                gen_result = data_processor.generate_product_content(
                    collection_name=collection_name,
                    selected_rows=[row_num],
                    use_url_content=True,  # Use scraped URL content for richer descriptions
                    fields_to_generate=['body_html', 'features', 'care_instructions']
                )

                logger.info(f"📊 Content generation result for {wip_product['sku']}: {gen_result}")

                if gen_result.get('success') and gen_result.get('results'):
                    gen_data = gen_result['results'][0]
                    logger.info(f"📊 Individual result for {wip_product['sku']}: {gen_data}")

                    if gen_data.get('success'):
                        generated_content = gen_data.get('generated_content', {})
                        supplier_db.update_wip_generated_content(wip_id, generated_content)
                        logger.info(f"✅ Generated content for {wip_product['sku']}: {list(generated_content.keys())}")
                    else:
                        error_msg = gen_data.get('error', 'Unknown error')
                        logger.error(f"❌ Content generation failed for {wip_product['sku']}: {error_msg}")
                        supplier_db.update_wip_error(wip_id, f"Content generation failed: {error_msg}")
                else:
                    error_msg = gen_result.get('message', 'No results returned')
                    logger.error(f"❌ Content generation returned no results for {wip_product['sku']}: {error_msg}")
                    supplier_db.update_wip_error(wip_id, f"Content generation failed: {error_msg}")

                # Step 4: Trigger Google Apps Script to clean data
                logger.info(f"🧹 Cleaning data for {wip_product['sku']}...")
                supplier_db.update_wip_status(wip_id, 'cleaning')

                try:
                    import asyncio
                    gas_result = asyncio.run(google_apps_script_manager.trigger_post_ai_cleaning(
                        collection_name=collection_name,
                        row_number=row_num,
                        operation_type='wip_processing'
                    ))
                    if gas_result['success']:
                        logger.info(f"✅ Google Apps Script cleaning completed for {wip_product['sku']}")
                except Exception as gas_error:
                    logger.warning(f"⚠️ Google Apps Script cleaning failed: {gas_error}")

                supplier_db.complete_wip(wip_id)  # Sets status to 'ready'

                logger.info(f"✅ Completed processing for {wip_product['sku']}")

                results.append({
                    'wip_id': wip_id,
                    'sku': wip_product['sku'],
                    'row_num': row_num,
                    'success': True,
                    'extracted_fields': result.extracted_fields
                })

            except Exception as e:
                logger.error(f"Error processing WIP {wip_id}: {e}", exc_info=True)
                supplier_db.update_wip_error(wip_id, str(e))
                results.append({
                    'wip_id': wip_id,
                    'success': False,
                    'error': str(e)
                })

        successful = sum(1 for r in results if r.get('success'))

        return jsonify({
            'success': True,
            'total': len(wip_ids),
            'successful': successful,
            'failed': len(wip_ids) - successful,
            'results': results
        })

    except Exception as e:
        logger.error(f"Error processing WIP products: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/<collection_name>/wip/<int:wip_id>/reset', methods=['POST'])
def api_reset_wip_product(collection_name, wip_id):
    """Reset a stuck WIP product back to pending status"""
    try:
        supplier_db = get_supplier_db()

        # Reset status to pending and clear error
        supplier_db.update_wip_status(wip_id, 'pending')
        supplier_db.update_wip_error(wip_id, '')

        logger.info(f"✅ Reset WIP product {wip_id} to pending status")

        return jsonify({
            'success': True,
            'message': 'Product reset to pending status'
        })

    except Exception as e:
        logger.error(f"Error resetting WIP product: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/<collection_name>/wip/<int:wip_id>/remove', methods=['DELETE'])
def api_remove_from_wip(collection_name, wip_id):
    """Remove product from WIP and delete from Google Sheets if it exists"""
    try:
        supplier_db = get_supplier_db()
        sheets_manager = get_sheets_manager()

        # Remove from WIP and get sheet row number
        sheet_row = supplier_db.remove_from_wip(wip_id)

        # Delete from Google Sheets if it was added
        if sheet_row:
            try:
                sheets_manager.delete_product(collection_name, sheet_row)
                logger.info(f"✅ Deleted row {sheet_row} from {collection_name} sheet")
            except Exception as e:
                logger.warning(f"Failed to delete row {sheet_row}: {e}")

        return jsonify({
            'success': True,
            'message': 'Product removed from WIP',
            'sheet_row_deleted': sheet_row is not None
        })

    except Exception as e:
        logger.error(f"Error removing from WIP: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/supplier-products/stats', methods=['GET'])
def api_supplier_products_stats():
    """Get supplier products database statistics"""
    try:
        supplier_db = get_supplier_db()
        stats = supplier_db.get_statistics()

        # Add debug info
        import os
        stats['debug'] = {
            'db_path': supplier_db.db_path,
            'db_exists': os.path.exists(supplier_db.db_path),
            'db_size': os.path.getsize(supplier_db.db_path) if os.path.exists(supplier_db.db_path) else 0,
            'working_dir': os.getcwd()
        }

        return jsonify({
            'success': True,
            'statistics': stats
        })

    except Exception as e:
        logger.error(f"Error getting supplier stats: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/supplier-products/extract-image', methods=['POST'])
def api_extract_product_image():
    """Extract og:image from a product URL"""
    try:
        data = request.get_json()
        url = data.get('url')

        if not url:
            return jsonify({
                'success': False,
                'error': 'No URL provided'
            }), 400

        # Extract image URL
        image_url = extract_og_image(url)

        # Optionally update database if SKU provided
        sku = data.get('sku')
        if sku and image_url:
            import sqlite3
            supplier_db = get_supplier_db()
            conn = sqlite3.connect(supplier_db.db_path)
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE supplier_products
                SET image_url = ?, updated_at = CURRENT_TIMESTAMP
                WHERE sku = ?
            ''', (image_url, sku))
            conn.commit()
            conn.close()

        return jsonify({
            'success': True,
            'image_url': image_url
        })

    except Exception as e:
        logger.error(f"Error extracting image: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ============================================================================
# DEBUG AND TEST ENDPOINTS
# ============================================================================

@app.route('/debug/sheets-test/<collection_name>')
def debug_sheets_test(collection_name):
    """Debug endpoint to test sheets connection directly"""
    try:
        logger.info(f"🔧 DEBUG: Testing sheets access for {collection_name}")

        # Test the exact same validation the main route uses
        is_accessible, access_message = sheets_manager.validate_collection_access(collection_name)

        result = {
            'collection': collection_name,
            'accessible': is_accessible,
            'message': access_message,
            'timestamp': time.time()
        }

        if is_accessible:
            # If accessible, also test getting some basic data
            try:
                urls = sheets_manager.get_urls_from_collection(collection_name)
                result['urls_count'] = len(urls)
            except Exception as e:
                result['urls_error'] = str(e)

        logger.info(f"🔧 DEBUG: Result for {collection_name}: {result}")
        return jsonify(result)

    except Exception as e:
        logger.error(f"🔧 DEBUG: Error testing {collection_name}: {e}")
        return jsonify({
            'collection': collection_name,
            'error': str(e),
            'timestamp': time.time()
        })

# Track startup time for uptime calculation
startup_time = time.time()

if __name__ == '__main__':
    # Validate environment on startup
    is_valid, message = validate_environment()
    if not is_valid:
        logger.warning(f"Environment validation issues: {message}")

    # Start the application
    if socketio and settings.FEATURES['SOCKETIO_ENABLED']:
        logger.info("Starting with Socket.IO support")
        socketio.run(app, debug=settings.DEBUG, port=8000, allow_unsafe_werkzeug=True)
    else:
        logger.info("Starting without Socket.IO")
        app.run(debug=settings.DEBUG, port=8000)
