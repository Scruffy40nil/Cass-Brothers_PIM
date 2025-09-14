"""
Migration Script: Migrate from Monolithic to Collection-Agnostic System
This script helps migrate from the old hardcoded system to the new modular architecture
"""
import os
import shutil
import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SystemMigrator:
    """Handles migration from old to new system"""
    
    def __init__(self, project_root: str = "/home/cassbrothers/mysite"):
        self.project_root = Path(project_root)
        self.backup_dir = self.project_root / "backup" / f"migration_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        self.old_files = {
            'flask_app.py': self.project_root / 'flask_app.py',
            'sinks.html': self.project_root / 'templates' / 'sinks.html',
            'wsgi.py': self.project_root / 'wsgi.py'
        }
        
        # New structure mapping
        self.new_structure = {
            # Config files
            'config/__init__.py': self._create_config_init,
            'config/collections.py': self._create_collections_config,
            'config/settings.py': self._create_settings_config,
            'config/validation.py': self._create_validation_config,
            
            # Core modules
            'core/__init__.py': self._create_core_init,
            'core/sheets_manager.py': self._extract_sheets_manager,
            'core/ai_extractor.py': self._extract_ai_extractor,
            'core/data_processor.py': self._extract_data_processor,
            'core/validators.py': self._create_validators,
            'core/cache_manager.py': self._create_cache_manager,
            'core/exceptions.py': self._create_exceptions,
            
            # API modules
            'api/__init__.py': self._create_api_init,
            'api/collections.py': self._extract_collections_api,
            'api/products.py': self._extract_products_api,
            'api/bulk.py': self._create_bulk_api,
            'api/reports.py': self._create_reports_api,
            'api/auth.py': self._create_auth_api,
            
            # Templates
            'templates/dashboard.html': self._create_dashboard_template,
            'templates/collection.html': self._create_collection_template,
            'templates/components/product_card.html': self._extract_product_card,
            'templates/components/field_input.html': self._create_field_input,
            'templates/components/modal_edit.html': self._extract_modal_edit,
            'templates/components/bulk_actions.html': self._create_bulk_actions,
            
            # Main app
            'flask_app.py': self._create_new_flask_app,
            'wsgi.py': self._create_new_wsgi
        }
    
    def run_migration(self, dry_run: bool = True) -> Dict[str, Any]:
        """
        Run the complete migration process
        
        Args:
            dry_run: If True, only show what would be done without making changes
        """
        logger.info(f"🚀 Starting migration to collection-agnostic system (dry_run={dry_run})")
        
        results = {
            'success': True,
            'dry_run': dry_run,
            'backup_created': False,
            'files_created': [],
            'files_backed_up': [],
            'errors': []
        }
        
        try:
            # Step 1: Create backup of existing files
            if not dry_run:
                backup_success = self._create_backup()
                results['backup_created'] = backup_success
                if not backup_success:
                    results['errors'].append("Failed to create backup")
                    return results
            else:
                logger.info("DRY RUN: Would create backup at: %s", self.backup_dir)
            
            # Step 2: Create new directory structure
            if not dry_run:
                self._create_directories()
            else:
                logger.info("DRY RUN: Would create directories: config/, core/, api/, features/, utils/, tests/, migrations/")
            
            # Step 3: Extract and create new files
            for file_path, creator_func in self.new_structure.items():
                try:
                    if not dry_run:
                        full_path = self.project_root / file_path
                        content = creator_func()
                        if content:
                            full_path.parent.mkdir(parents=True, exist_ok=True)
                            full_path.write_text(content)
                            results['files_created'].append(str(file_path))
                            logger.info(f"✅ Created: {file_path}")
                        else:
                            logger.warning(f"⚠️ No content generated for: {file_path}")
                    else:
                        logger.info(f"DRY RUN: Would create {file_path}")
                        
                except Exception as e:
                    error_msg = f"Failed to create {file_path}: {str(e)}"
                    results['errors'].append(error_msg)
                    logger.error(error_msg)
            
            # Step 4: Update configuration files
            if not dry_run:
                self._update_environment_file()
            else:
                logger.info("DRY RUN: Would update .env file with new collection configurations")
            
            # Step 5: Create migration documentation
            if not dry_run:
                self._create_migration_docs()
            else:
                logger.info("DRY RUN: Would create migration documentation")
            
            logger.info(f"🎉 Migration {'completed' if not dry_run else 'planned'} successfully!")
            
        except Exception as e:
            results['success'] = False
            results['errors'].append(f"Migration failed: {str(e)}")
            logger.error(f"❌ Migration failed: {e}")
        
        return results
    
    def _create_backup(self) -> bool:
        """Create backup of existing files"""
        try:
            self.backup_dir.mkdir(parents=True, exist_ok=True)
            
            for name, file_path in self.old_files.items():
                if file_path.exists():
                    backup_path = self.backup_dir / name
                    shutil.copy2(file_path, backup_path)
                    logger.info(f"📦 Backed up: {name}")
            
            # Backup entire templates directory
            if (self.project_root / 'templates').exists():
                shutil.copytree(
                    self.project_root / 'templates',
                    self.backup_dir / 'templates',
                    dirs_exist_ok=True
                )
                logger.info("📦 Backed up: templates/")
            
            # Backup static files
            if (self.project_root / 'static').exists():
                shutil.copytree(
                    self.project_root / 'static',
                    self.backup_dir / 'static',
                    dirs_exist_ok=True
                )
                logger.info("📦 Backed up: static/")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Backup failed: {e}")
            return False
    
    def _create_directories(self):
        """Create new directory structure"""
        directories = [
            'config', 'core', 'features', 'api', 'utils', 'tests', 'migrations',
            'templates/components', 'templates/emails', 'static/css', 'static/js',
            'static/img/icons', 'static/img/placeholders', 'static/fonts',
            'logs', 'docs', 'scripts', 'tests/fixtures', 'tests/reports'
        ]
        
        for directory in directories:
            (self.project_root / directory).mkdir(parents=True, exist_ok=True)
            logger.info(f"📁 Created directory: {directory}")
    
    # Content creation methods
    def _create_config_init(self) -> str:
        return '''"""
Configuration Package
Contains all configuration files for the collection-agnostic system
"""
from .settings import get_settings, validate_environment
from .collections import get_collection_config, get_all_collections
from .validation import get_validator, validate_product_data

__all__ = [
    'get_settings',
    'validate_environment', 
    'get_collection_config',
    'get_all_collections',
    'get_validator',
    'validate_product_data'
]
'''
    
    def _create_collections_config(self) -> str:
        # Return the content from the collections.py artifact we created earlier
        return '''# Insert the content from the collections.py artifact here
# This would be the full collections.py file content'''
    
    def _create_settings_config(self) -> str:
        # Return the content from the settings.py artifact we created earlier
        return '''# Insert the content from the settings.py artifact here
# This would be the full settings.py file content'''
    
    def _create_validation_config(self) -> str:
        # Return the content from the validation.py artifact we created earlier
        return '''# Insert the content from the validation.py artifact here
# This would be the full validation.py file content'''
    
    def _create_core_init(self) -> str:
        return '''"""
Core Package
Contains core functionality modules for the collection-agnostic system
"""
from .sheets_manager import get_sheets_manager
from .ai_extractor import get_ai_extractor
from .data_processor import get_data_processor

__all__ = [
    'get_sheets_manager',
    'get_ai_extractor', 
    'get_data_processor'
]
'''
    
    def _extract_sheets_manager(self) -> str:
        # This would extract the GoogleSheetsManager class from the old flask_app.py
        # and convert it to use the new collection system
        return '''# Insert the content from the sheets_manager.py artifact here
# This would be the full sheets_manager.py file content'''
    
    def _extract_ai_extractor(self) -> str:
        # This would extract the AIExtractor class from the old flask_app.py
        # and make it collection-aware
        return '''# Insert the content from the ai_extractor.py artifact here
# This would be the full ai_extractor.py file content'''
    
    def _extract_data_processor(self) -> str:
        # This would extract the DataProcessor class from the old flask_app.py
        # and make it collection-agnostic
        return '''# Insert the content from the data_processor.py artifact here
# This would be the full data_processor.py file content'''
    
    def _create_validators(self) -> str:
        return '''"""
Field Validators Module
Additional validation utilities for data processing
"""
import re
from typing import Any, Tuple

def validate_sku(value: Any) -> Tuple[bool, str]:
    """Validate SKU format"""
    if not value or not str(value).strip():
        return False, "SKU is required"
    
    sku = str(value).strip()
    if len(sku) < 2:
        return False, "SKU must be at least 2 characters"
    
    return True, ""

def validate_url(value: Any) -> Tuple[bool, str]:
    """Validate URL format"""
    if not value:
        return True, ""  # URL is optional
    
    url_pattern = r'^https?://[^\\s/$.?#].[^\\s]*$'
    if not re.match(url_pattern, str(value)):
        return False, "Invalid URL format"
    
    return True, ""

def validate_dimensions(length: Any, width: Any, depth: Any) -> Tuple[bool, str]:
    """Validate product dimensions"""
    try:
        if length:
            length_val = float(length)
            if length_val <= 0:
                return False, "Length must be positive"
        
        if width:
            width_val = float(width)
            if width_val <= 0:
                return False, "Width must be positive"
        
        if depth:
            depth_val = float(depth)
            if depth_val <= 0:
                return False, "Depth must be positive"
        
        return True, ""
        
    except (ValueError, TypeError):
        return False, "Dimensions must be valid numbers"
'''
    
    def _create_cache_manager(self) -> str:
        return '''"""
Cache Manager
Handles caching for improved performance
"""
import time
from typing import Any, Optional, Dict
from threading import Lock

class CacheManager:
    """Simple in-memory cache manager"""
    
    def __init__(self, default_ttl: int = 300):  # 5 minutes default
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._lock = Lock()
        self.default_ttl = default_ttl
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        with self._lock:
            if key in self._cache:
                entry = self._cache[key]
                if time.time() < entry['expires']:
                    return entry['value']
                else:
                    del self._cache[key]
            return None
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in cache"""
        if ttl is None:
            ttl = self.default_ttl
        
        with self._lock:
            self._cache[key] = {
                'value': value,
                'expires': time.time() + ttl
            }
    
    def clear(self) -> None:
        """Clear all cache entries"""
        with self._lock:
            self._cache.clear()

# Global cache instance
cache = CacheManager()

def get_cache() -> CacheManager:
    """Get the global cache instance"""
    return cache
'''
    
    def _create_exceptions(self) -> str:
        return '''"""
Custom Exceptions for the PIM System
"""

class PIMException(Exception):
    """Base exception for PIM system"""
    pass

class CollectionNotFoundError(PIMException):
    """Raised when a collection is not found"""
    pass

class ConfigurationError(PIMException):
    """Raised when there's a configuration issue"""
    pass

class SheetsAccessError(PIMException):
    """Raised when Google Sheets access fails"""
    pass

class AIExtractionError(PIMException):
    """Raised when AI extraction fails"""
    pass

class ValidationError(PIMException):
    """Raised when data validation fails"""
    pass

class ProcessingError(PIMException):
    """Raised when data processing fails"""
    pass
'''
    
    def _create_api_init(self) -> str:
        return '''"""
API Package
Contains API modules for different functionalities
"""
'''
    
    def _extract_collections_api(self) -> str:
        return '''"""
Collections API
Handles collection-level operations
"""
from flask import Blueprint, jsonify, request
import logging

from config.collections import get_all_collections, get_collection_config
from config.settings import get_settings
from core.sheets_manager import get_sheets_manager
from core.data_processor import get_data_processor

logger = logging.getLogger(__name__)
collections_bp = Blueprint('collections', __name__)

@collections_bp.route('/api/collections', methods=['GET'])
def get_collections():
    """Get list of all available collections"""
    try:
        sheets_manager = get_sheets_manager()
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

@collections_bp.route('/api/collections/<collection_name>/stats', methods=['GET'])
def get_collection_stats(collection_name):
    """Get statistics for a specific collection"""
    try:
        data_processor = get_data_processor()
        stats = data_processor.get_processing_statistics(collection_name)
        
        return jsonify({
            'success': True,
            'stats': stats
        })
        
    except Exception as e:
        logger.error(f"Error getting stats for {collection_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
'''
    
    def _extract_products_api(self) -> str:
        return '''"""
Products API
Handles product-level operations for any collection
"""
from flask import Blueprint, jsonify, request
import logging

from core.sheets_manager import get_sheets_manager
from core.ai_extractor import get_ai_extractor

logger = logging.getLogger(__name__)
products_bp = Blueprint('products', __name__)

@products_bp.route('/api/<collection_name>/products/all', methods=['GET'])
def get_all_products(collection_name):
    """Get all products from a collection"""
    try:
        sheets_manager = get_sheets_manager()
        products = sheets_manager.get_all_products(collection_name)
        
        return jsonify({
            'success': True,
            'products': products,
            'total_count': len(products),
            'collection': collection_name
        })
        
    except Exception as e:
        logger.error(f"Error getting products for {collection_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@products_bp.route('/api/<collection_name>/products/<int:row_num>', methods=['GET'])
def get_single_product(collection_name, row_num):
    """Get a single product by row number"""
    try:
        sheets_manager = get_sheets_manager()
        product = sheets_manager.get_single_product(collection_name, row_num)
        
        if not product:
            return jsonify({
                'success': False,
                'error': 'Product not found'
            }), 404
        
        return jsonify({
            'success': True,
            'product': product,
            'collection': collection_name
        })
        
    except Exception as e:
        logger.error(f"Error getting product {row_num} for {collection_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
'''
    
    def _create_bulk_api(self) -> str:
        return '''"""
Bulk Operations API
Handles bulk processing operations
"""
from flask import Blueprint, jsonify, request
import logging

from core.data_processor import get_data_processor

logger = logging.getLogger(__name__)
bulk_bp = Blueprint('bulk', __name__)

@bulk_bp.route('/api/<collection_name>/bulk/extract', methods=['POST'])
def bulk_extract(collection_name):
    """Bulk AI extraction for a collection"""
    try:
        data = request.get_json()
        selected_rows = data.get('selected_rows')
        overwrite_mode = data.get('overwrite_mode', True)
        
        data_processor = get_data_processor()
        result = data_processor.extract_from_urls(
            collection_name=collection_name,
            selected_rows=selected_rows,
            overwrite_mode=overwrite_mode
        )
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error in bulk extract for {collection_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
'''
    
    def _create_reports_api(self) -> str:
        return '''"""
Reports API
Handles reporting and analytics
"""
from flask import Blueprint, jsonify, request
import logging

from core.data_processor import get_data_processor

logger = logging.getLogger(__name__)
reports_bp = Blueprint('reports', __name__)

@reports_bp.route('/api/reports/overview', methods=['GET'])
def get_overview_report():
    """Get overview report across all collections"""
    try:
        data_processor = get_data_processor()
        stats = data_processor.get_processing_statistics()
        
        return jsonify({
            'success': True,
            'report': stats
        })
        
    except Exception as e:
        logger.error(f"Error generating overview report: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
'''
    
    def _create_auth_api(self) -> str:
        return '''"""
Authentication API
Handles authentication and authorization (placeholder)
"""
from flask import Blueprint, jsonify, request
import logging

logger = logging.getLogger(__name__)
auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/api/auth/status', methods=['GET'])
def get_auth_status():
    """Get authentication status"""
    # Placeholder - implement actual authentication as needed
    return jsonify({
        'success': True,
        'authenticated': True,
        'user': 'admin'
    })
'''
    
    def _create_dashboard_template(self) -> str:
        return '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Product Management Dashboard</title>
    <!-- Include CSS dependencies -->
</head>
<body>
    <div class="dashboard-container">
        <h1>Product Management Dashboard</h1>
        
        <div class="collections-grid">
            <!-- Dynamic collection cards will be loaded here -->
        </div>
        
        <div class="statistics-section">
            <!-- Overall statistics -->
        </div>
    </div>
    
    <!-- Include JavaScript -->
    <script>
        // Dashboard functionality
        function loadCollections() {
            fetch('/api/collections')
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        renderCollections(data.collections);
                    }
                })
                .catch(error => console.error('Error loading collections:', error));
        }
        
        function renderCollections(collections) {
            // Render collection cards
        }
        
        // Load collections on page load
        document.addEventListener('DOMContentLoaded', loadCollections);
    </script>
</body>
</html>'''
    
    def _create_collection_template(self) -> str:
        return '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ collection.name }} - Product Management</title>
    <!-- Include CSS dependencies -->
</head>
<body>
    <div class="collection-container">
        <header class="collection-header">
            <h1>{{ collection.name }}</h1>
            <p>{{ collection.description }}</p>
        </header>
        
        <div class="collection-actions">
            <!-- Bulk actions, filters, etc. -->
        </div>
        
        <div class="products-grid" id="productsGrid">
            <!-- Product cards will be loaded here -->
        </div>
    </div>
    
    <!-- Include modals and components -->
    {% include 'components/modal_edit.html' %}
    
    <!-- Include JavaScript -->
    <script>
        const COLLECTION_NAME = '{{ collection_name }}';
        
        function loadProducts() {
            fetch(`/api/${COLLECTION_NAME}/products/all`)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        renderProducts(data.products);
                    }
                })
                .catch(error => console.error('Error loading products:', error));
        }
        
        // Load products on page load
        document.addEventListener('DOMContentLoaded', loadProducts);
    </script>
</body>
</html>'''
    
    def _extract_product_card(self) -> str:
        return '''<!-- Product Card Component -->
<div class="product-card" data-row="{{ row_num }}">
    <div class="product-image">
        <!-- Image will be loaded dynamically -->
    </div>
    
    <div class="product-details">
        <h3 class="product-title">{{ product.title or 'Untitled Product' }}</h3>
        
        <div class="product-meta">
            <span class="product-sku">{{ product.sku or 'No SKU' }}</span>
            <span class="product-vendor">{{ product.vendor or '-' }}</span>
        </div>
        
        <div class="product-specs">
            <!-- Specifications will be rendered dynamically based on collection type -->
        </div>
        
        <div class="quality-section">
            <div class="quality-bar">
                <div class="quality-fill" style="width: {{ product.quality_score or 0 }}%"></div>
            </div>
            <div class="quality-text">{{ product.quality_score or 0 }}% complete</div>
        </div>
    </div>
    
    <div class="product-actions">
        <button class="action-btn" onclick="extractProduct({{ row_num }})">
            <i class="fas fa-robot"></i>
        </button>
        <button class="action-btn" onclick="editProduct({{ row_num }})">
            <i class="fas fa-edit"></i>
        </button>
    </div>
</div>'''
    
    def _create_field_input(self) -> str:
        return '''<!-- Dynamic Field Input Component -->
<div class="field-wrapper" data-field="{{ field_name }}">
    {% if field_type == 'text' %}
        <input type="text" class="form-control" id="{{ field_id }}" name="{{ field_name }}" value="{{ value or '' }}" placeholder="{{ placeholder or '' }}">
    {% elif field_type == 'number' %}
        <input type="number" class="form-control" id="{{ field_id }}" name="{{ field_name }}" value="{{ value or '' }}" placeholder="{{ placeholder or '' }}">
    {% elif field_type == 'select' %}
        <select class="form-select" id="{{ field_id }}" name="{{ field_name }}">
            <option value="">{{ placeholder or 'Select...' }}</option>
            {% for option in options %}
                <option value="{{ option }}" {% if value == option %}selected{% endif %}>{{ option }}</option>
            {% endfor %}
        </select>
    {% elif field_type == 'boolean' %}
        <select class="form-select" id="{{ field_id }}" name="{{ field_name }}">
            <option value="">Select...</option>
            <option value="True" {% if value == 'True' %}selected{% endif %}>Yes</option>
            <option value="False" {% if value == 'False' %}selected{% endif %}>No</option>
        </select>
    {% elif field_type == 'textarea' %}
        <textarea class="form-control" id="{{ field_id }}" name="{{ field_name }}" rows="{{ rows or 3 }}" placeholder="{{ placeholder or '' }}">{{ value or '' }}</textarea>
    {% endif %}
</div>'''
    
    def _extract_modal_edit(self) -> str:
        return '''<!-- Edit Product Modal Component -->
<div class="modal fade" id="editProductModal" tabindex="-1">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Edit Product</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <form id="editProductForm">
                    <!-- Dynamic form fields will be generated based on collection type -->
                    <div id="dynamicFields"></div>
                </form>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" onclick="saveProduct()">Save Changes</button>
            </div>
        </div>
    </div>
</div>'''
    
    def _create_bulk_actions(self) -> str:
        return '''<!-- Bulk Actions Component -->
<div class="bulk-actions-panel">
    <div class="bulk-selection">
        <input type="checkbox" id="selectAll" onclick="toggleSelectAll()">
        <label for="selectAll">Select All</label>
        <span class="selection-count">0 selected</span>
    </div>
    
    <div class="bulk-buttons">
        <button class="btn btn-ai-extract" onclick="bulkExtract()">
            <i class="fas fa-robot me-1"></i> AI Extract
        </button>
        <button class="btn btn-warning" onclick="bulkClean()">
            <i class="fas fa-broom me-1"></i> Clean Data
        </button>
        <button class="btn btn-info" onclick="bulkDescriptions()">
            <i class="fas fa-file-alt me-1"></i> Generate Descriptions
        </button>
        <button class="btn btn-success" onclick="bulkExport()">
            <i class="fas fa-download me-1"></i> Export
        </button>
    </div>
</div>'''
    
    def _create_new_flask_app(self) -> str:
        return '''#!/usr/bin/env python3
"""
Collection-Agnostic Product Information Management (PIM) System
Modern Flask application with modular architecture
"""
from dotenv import load_dotenv
load_dotenv()

import logging.config
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO

# Import configuration
from config.settings import get_settings, validate_environment
from config.collections import get_all_collections

# Import core modules
from core.sheets_manager import get_sheets_manager
from core.data_processor import get_data_processor

# Import API blueprints
from api.collections import collections_bp
from api.products import products_bp
from api.bulk import bulk_bp
from api.reports import reports_bp
from api.auth import auth_bp

# Initialize settings
settings = get_settings()

# Configure logging
logging.config.dictConfig(settings.LOGGING_CONFIG)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__, template_folder='templates')
app.config.update(settings.FLASK_CONFIG)

# Initialize Socket.IO if enabled
if settings.FEATURES['SOCKETIO_ENABLED']:
    socketio = SocketIO(app, **settings.SOCKETIO_CONFIG)
else:
    socketio = None

# Register API blueprints
app.register_blueprint(collections_bp)
app.register_blueprint(products_bp)
app.register_blueprint(bulk_bp)
app.register_blueprint(reports_bp)
app.register_blueprint(auth_bp)

@app.route('/')
def dashboard():
    """Main dashboard showing all collections"""
    try:
        collections = get_all_collections()
        return render_template('dashboard.html', collections=collections)
    except Exception as e:
        logger.error(f"Dashboard error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/<collection_name>')
def collection_view(collection_name):
    """Collection-specific view"""
    try:
        from config.collections import get_collection_config
        config = get_collection_config(collection_name)
        
        sheets_manager = get_sheets_manager()
        urls = sheets_manager.get_urls_from_collection(collection_name)
        
        return render_template('collection.html',
                             collection=config.to_dict(),
                             collection_name=collection_name,
                             urls=urls,
                             total_urls=len(urls))
    except ValueError:
        return jsonify({"error": f"Collection '{collection_name}' not found"}), 404
    except Exception as e:
        logger.error(f"Collection view error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/debug')
def debug():
    """Debug endpoint"""
    is_valid, message = validate_environment()
    collections = get_all_collections()
    
    return jsonify({
        "status": "Collection-agnostic PIM system running",
        "environment_valid": is_valid,
        "environment_message": message,
        "collections": {name: config.name for name, config in collections.items()},
        "features": settings.FEATURES
    })

@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Page not found"}), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"500 error: {str(error)}")
    return jsonify({"error": "Internal server error"}), 500

# WSGI entry point
application = app

if __name__ == '__main__':
    logger.info("🚀 Starting collection-agnostic PIM system")
    is_valid, message = validate_environment()
    if not is_valid:
        logger.warning(f"⚠️ Environment validation: {message}")
    
    if socketio:
        socketio.run(app, debug=settings.DEBUG)
    else:
        app.run(debug=settings.DEBUG)
'''
    
    def _create_new_wsgi(self) -> str:
        return '''#!/usr/bin/env python3
"""
WSGI Configuration for Collection-Agnostic PIM System
"""
import sys
import os

# Add the project directory to the Python path
project_home = '/home/cassbrothers/mysite'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Import the Flask application
from flask_app import application

if __name__ == "__main__":
    application.run()
'''
    
    def _update_environment_file(self):
        """Update .env file with new collection configurations"""
        env_file = self.project_root / '.env'
        
        # New environment variables for collection system
        new_env_vars = [
            "# Collection-Agnostic System Configuration",
            "FLASK_ENV=production",
            "DEBUG=False",
            "",
            "# Collection Spreadsheet IDs", 
            "SINKS_SPREADSHEET_ID=your_sinks_spreadsheet_id",
            "TAPS_SPREADSHEET_ID=your_taps_spreadsheet_id", 
            "LIGHTING_SPREADSHEET_ID=your_lighting_spreadsheet_id",
            "",
            "# Apps Script URLs for data cleaning",
            "SINKS_APPS_SCRIPT_URL=your_sinks_apps_script_url",
            "TAPS_APPS_SCRIPT_URL=your_taps_apps_script_url",
            "LIGHTING_APPS_SCRIPT_URL=your_lighting_apps_script_url",
            "",
            "# Feature Flags",
            "AI_EXTRACTION_ENABLED=True",
            "AI_DESCRIPTIONS_ENABLED=True", 
            "BULK_OPERATIONS_ENABLED=True",
            "DATA_CLEANING_ENABLED=True",
            "SOCKETIO_ENABLED=True",
            ""
        ]
        
        # Read existing .env if it exists
        existing_content = ""
        if env_file.exists():
            existing_content = env_file.read_text()
        
        # Append new variables
        with env_file.open('a') as f:
            f.write('\n'.join(new_env_vars))
        
        logger.info("✅ Updated .env file with collection configuration")
    
    def _create_migration_docs(self):
        """Create migration documentation"""
        docs_dir = self.project_root / 'docs'
        docs_dir.mkdir(exist_ok=True)
        
        migration_doc = docs_dir / 'MIGRATION_GUIDE.md'
        migration_doc.write_text('''# Migration Guide: Monolithic to Collection-Agnostic System

## Overview
This guide explains the migration from the old hardcoded system to the new collection-agnostic architecture.

## What Changed

### 1. Directory Structure
- **Old**: Single `flask_app.py` file with everything
- **New**: Modular structure with `config/`, `core/`, `api/`, `features/` directories

### 2. Configuration System
- **Old**: Hardcoded for sinks only
- **New**: Configurable for multiple collections (sinks, taps, lighting, etc.)

### 3. Templates
- **Old**: `sinks.html` hardcoded template
- **New**: Generic `collection.html` template with reusable components

### 4. API Structure
- **Old**: Routes mixed in main app file
- **New**: Organized API blueprints by functionality

## Post-Migration Steps

1. **Update Environment Variables**:
   - Set spreadsheet IDs for each collection
   - Configure Apps Script URLs
   - Set feature flags as needed

2. **Test Collections**:
   - Verify each collection loads correctly
   - Test AI extraction for different product types
   - Confirm data cleaning operations work

3. **Customize Templates**:
   - Modify `templates/collection.html` for your needs
   - Update CSS in `static/css/` for styling
   - Add collection-specific components

4. **Add New Collections**:
   - Create new collection class in `config/collections.py`
   - Add column mappings and AI extraction fields
   - Create validation rules in `config/validation.py`

## Rollback Plan
If issues occur, restore from the backup directory created during migration.

## Support
Refer to the individual module documentation for detailed configuration options.
''')
        
        logger.info("✅ Created migration documentation")

def main():
    """Main migration function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Migrate to collection-agnostic system')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done without making changes')
    parser.add_argument('--project-root', default='/home/cassbrothers/mysite', help='Project root directory')
    
    args = parser.parse_args()
    
    migrator = SystemMigrator(args.project_root)
    results = migrator.run_migration(dry_run=args.dry_run)
    
    print("\n" + "="*50)
    print("MIGRATION RESULTS")
    print("="*50)
    print(f"Success: {results['success']}")
    print(f"Dry Run: {results['dry_run']}")
    print(f"Files Created: {len(results['files_created'])}")
    print(f"Errors: {len(results['errors'])}")
    
    if results['errors']:
        print("\nErrors:")
        for error in results['errors']:
            print(f"  - {error}")
    
    if results['files_created']:
        print("\nFiles Created:")
        for file_path in results['files_created']:
            print(f"  - {file_path}")

if __name__ == '__main__':
    main()
'''