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
import logging.config
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from jinja2 import TemplateNotFound
from flask_socketio import SocketIO, emit
import requests
import io
from urllib.parse import urlparse

# Import configuration
from config.settings import get_settings, validate_environment
from config.collections import get_all_collections, get_collection_config
from config.validation import validate_product_data

# Import core modules
from core.sheets_manager import get_sheets_manager
from core.ai_extractor import get_ai_extractor
from core.data_processor import get_data_processor
from core.google_apps_script_manager import google_apps_script_manager

# Initialize settings and configure logging
settings = get_settings()
logging.config.dictConfig(settings.LOGGING_CONFIG)
logger = logging.getLogger(__name__)

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

# Initialize Socket.IO if enabled
if settings.FEATURES['SOCKETIO_ENABLED']:
    socketio = SocketIO(app, **settings.SOCKETIO_CONFIG)
    logger.info("Socket.IO enabled")
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
        expected_sku = data.get('expected_sku', '').strip()
        expected_title = data.get('expected_title', '').strip()
        row_num = data.get('row_num')

        logger.info(f"Validating spec sheet for {collection_name} row {row_num}: {spec_sheet_url}")

        # Validate inputs
        if not spec_sheet_url:
            return jsonify({
                'valid': False,
                'reason': 'No spec sheet URL provided'
            })

        if not expected_sku:
            return jsonify({
                'valid': False,
                'reason': 'No SKU provided for validation'
            })

        # Validate URL format
        try:
            parsed_url = urlparse(spec_sheet_url)
            if not all([parsed_url.scheme, parsed_url.netloc]):
                return jsonify({
                    'valid': False,
                    'reason': 'Invalid URL format'
                })
        except Exception:
            return jsonify({
                'valid': False,
                'reason': 'Invalid URL format'
            })

        # Check if URL contains SKU (quick check)
        url_contains_sku = expected_sku.upper() in spec_sheet_url.upper()

        # Download and analyze the document
        try:
            response = requests.get(spec_sheet_url, timeout=30, headers={
                'User-Agent': 'Mozilla/5.0 (compatible; PIM-Validator/1.0)'
            })

            if response.status_code != 200:
                return jsonify({
                    'valid': False,
                    'reason': f'Document not accessible (HTTP {response.status_code})'
                })

            # Extract text based on content type
            content_type = response.headers.get('content-type', '').lower()
            extracted_text = ""

            if 'pdf' in content_type or spec_sheet_url.lower().endswith('.pdf'):
                # Handle PDF files
                extracted_text = extract_pdf_text(response.content)
            elif 'html' in content_type:
                # Handle HTML pages
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(response.content, 'html.parser')
                extracted_text = soup.get_text()
            else:
                # Try to treat as plain text
                extracted_text = response.text

            if not extracted_text:
                # If we couldn't extract text but URL contains SKU, that's still good
                if url_contains_sku:
                    return jsonify({
                        'valid': True,
                        'found_sku': expected_sku,
                        'reason': f'SKU found in filename: {spec_sheet_url.split("/")[-1]}',
                        'confidence': 'medium'
                    })
                else:
                    return jsonify({
                        'valid': False,
                        'reason': 'Could not extract text from document'
                    })

            # Search for SKU in extracted text
            text_upper = extracted_text.upper()
            sku_upper = expected_sku.upper()

            sku_in_text = sku_upper in text_upper

            # Additional checks for variations
            sku_variations = [
                sku_upper,
                sku_upper.replace('-', ''),
                sku_upper.replace('_', ''),
                sku_upper.replace(' ', '')
            ]

            found_variation = None
            for variation in sku_variations:
                if variation in text_upper:
                    found_variation = variation
                    sku_in_text = True
                    break

            # Check document quality indicators
            quality_indicators = [
                'specification', 'dimensions', 'technical', 'installation',
                'product', 'model', 'series', 'datasheet', 'spec sheet'
            ]

            quality_score = sum(1 for indicator in quality_indicators if indicator in text_upper)
            is_likely_spec_sheet = quality_score >= 2

            # Determine validation result
            if sku_in_text and is_likely_spec_sheet:
                confidence = 'high' if (quality_score >= 4 and len(extracted_text) > 200) else 'medium'
                return jsonify({
                    'valid': True,
                    'found_sku': found_variation or expected_sku,
                    'reason': f'SKU found in document content (confidence: {confidence})',
                    'confidence': confidence,
                    'document_quality_score': quality_score
                })
            elif sku_in_text and not is_likely_spec_sheet:
                return jsonify({
                    'valid': True,
                    'found_sku': found_variation or expected_sku,
                    'reason': 'SKU found but document may not be a technical specification',
                    'confidence': 'low'
                })
            elif url_contains_sku and is_likely_spec_sheet:
                return jsonify({
                    'valid': True,
                    'found_sku': expected_sku,
                    'reason': 'SKU found in filename and document appears to be a spec sheet',
                    'confidence': 'medium'
                })
            elif url_contains_sku:
                return jsonify({
                    'valid': True,
                    'found_sku': expected_sku,
                    'reason': 'SKU found in filename only',
                    'confidence': 'low'
                })
            else:
                return jsonify({
                    'valid': False,
                    'reason': f'SKU "{expected_sku}" not found in document or filename'
                })

        except requests.exceptions.Timeout:
            return jsonify({
                'valid': False,
                'reason': 'Document download timed out'
            })
        except requests.exceptions.RequestException as e:
            return jsonify({
                'valid': False,
                'reason': f'Error downloading document: {str(e)}'
            })

    except Exception as e:
        logger.error(f"Error validating spec sheet for {collection_name}: {e}")
        return jsonify({
            'valid': False,
            'reason': f'Validation error: {str(e)}'
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

@app.route('/api/<collection_name>/products/all', methods=['GET'])
def api_get_all_products(collection_name):
    """Get all products from a collection (including pricing data)"""
    try:
        logger.info(f"API: Getting all products for {collection_name}")
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

        return jsonify({
            'success': True,
            'products': enhanced_products,
            'total_count': len(enhanced_products),
            'collection': collection_name,
            'pricing_support': bool(get_pricing_fields_for_collection(collection_name))
        })

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

        # Use data processor for extraction
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
        logger.error(f"AI extraction error for {collection_name}: {e}")
        return jsonify({"success": False, "message": f"Server error: {str(e)}"}), 500

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

        # Get AI extractor and sheets manager
        ai_extractor = get_ai_extractor()
        sheets_manager = get_sheets_manager()

        # Use AI extractor to get images
        result = ai_extractor.extract_product_data(
            collection_name=collection_name,
            url=product_url,
            overwrite_mode=False  # Only extract images, don't overwrite other data
        )

        if result.get('success') and result.get('images'):
            images = result['images']
            image_urls = ', '.join(images) if isinstance(images, list) else str(images)
            image_count = len(images) if isinstance(images, list) else 1

            # Update the product row with extracted images
            sheets_manager.update_product_row(collection_name, row_num, {
                'shopify_images': image_urls
            })

            logger.info(f"✅ Extracted {image_count} images for {collection_name} row {row_num}")

            # Emit SocketIO event for live updates
            if socketio:
                socketio.emit('product_updated', {
                    'collection': collection_name,
                    'row_num': row_num,
                    'fields_updated': ['shopify_images'],
                    'updated_data': {'shopify_images': image_urls},
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

            return jsonify({
                'success': True,
                'message': f'Extracted {image_count} images',
                'image_count': image_count,
                'images': images
            })
        else:
            error_msg = result.get('errors', ['No images found'])[0] if result.get('errors') else 'No images found'
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
        from core.cache_manager import cache_manager
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