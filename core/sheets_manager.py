"""
Collection-Agnostic Google Sheets Manager
Handles all Google Sheets operations for any product collection
Enhanced with Pricing Comparison (Caprice) functionality
"""
import json
import logging
import time
import csv
import os
import requests
from typing import Dict, List, Any, Optional, Tuple, Union
import gspread
from google.oauth2.service_account import Credentials

from config.settings import get_settings
from config.collections import get_collection_config, CollectionConfig
from config.validation import get_validator, validate_product_data
from core.cache_manager import cache_manager
from core.db_cache import get_db_cache

logger = logging.getLogger(__name__)

class SheetsManager:
    """Collection-agnostic Google Sheets manager with pricing lookup support"""

    def __init__(self):
        self.gc = None
        self.settings = get_settings()
        self.setup_credentials()
        self._spreadsheet_cache = {}  # Cache spreadsheet objects
        self._pricing_cache = {}  # Cache pricing data

    def setup_credentials(self) -> bool:
        """Setup Google Sheets credentials"""
        try:
            if self.settings.GOOGLE_CREDENTIALS_JSON:
                if self.settings.GOOGLE_CREDENTIALS_JSON.startswith('{'):
                    creds_dict = json.loads(self.settings.GOOGLE_CREDENTIALS_JSON)
                else:
                    with open(self.settings.GOOGLE_CREDENTIALS_JSON, 'r') as f:
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

    def get_spreadsheet(self, collection_name: str):
        """Get spreadsheet for a specific collection with caching"""
        if not self.gc:
            logger.error("❌ No Google Sheets client available")
            return None

        config = get_collection_config(collection_name)

        if not config.spreadsheet_id:
            logger.error(f"❌ No spreadsheet ID configured for collection: {collection_name}")
            return None

        # Use cache to avoid repeated API calls
        cache_key = f"{collection_name}_{config.spreadsheet_id}"
        if cache_key in self._spreadsheet_cache:
            return self._spreadsheet_cache[cache_key]

        try:
            spreadsheet = self.gc.open_by_key(config.spreadsheet_id)
            self._spreadsheet_cache[cache_key] = spreadsheet
            logger.info(f"✅ Successfully accessed {collection_name} spreadsheet")
            return spreadsheet
        except Exception as e:
            logger.error(f"❌ Error accessing {collection_name} spreadsheet: {e}")
            return None

    def get_worksheet(self, collection_name: str):
        """Get worksheet for a specific collection"""
        logger.info(f"🔍 Getting worksheet for collection: {collection_name}")

        spreadsheet = self.get_spreadsheet(collection_name)
        if not spreadsheet:
            logger.error(f"❌ No spreadsheet available for {collection_name}")
            return None

        config = get_collection_config(collection_name)
        logger.info(f"📋 Looking for worksheet: '{config.worksheet_name}'")

        try:
            worksheet = spreadsheet.worksheet(config.worksheet_name)
            logger.info(f"✅ Successfully accessed worksheet: '{config.worksheet_name}'")
            return worksheet
        except Exception as e:
            logger.error(f"❌ Error accessing worksheet '{config.worksheet_name}' for {collection_name}: {e}")
            # List available worksheets for debugging
            try:
                available_worksheets = [ws.title for ws in spreadsheet.worksheets()]
                logger.error(f"📝 Available worksheets in spreadsheet: {available_worksheets}")
            except Exception as list_error:
                logger.error(f"❌ Could not list available worksheets: {list_error}")
            return None

    def get_pricing_data(self, pricing_sheet_id: str, pricing_worksheet: str, pricing_config: Dict, target_sku: str) -> Dict[str, Any]:
        """
        Get pricing data for a SKU from external pricing sheet
        
        Args:
            pricing_sheet_id: Google Sheets ID of the pricing spreadsheet
            pricing_worksheet: Name of the worksheet containing pricing data
            pricing_config: Configuration dict with column mappings
            target_sku: SKU to look up
            
        Returns:
            Dict containing pricing data or empty dict if not found
        """
        try:
            # Check cache first
            cache_key = f"{pricing_sheet_id}_{target_sku}"
            if cache_key in self._pricing_cache:
                logger.debug(f"Using cached pricing data for SKU: {target_sku}")
                return self._pricing_cache[cache_key]

            # Connect to the pricing spreadsheet
            if not self.gc:
                logger.error("No Google Sheets client available for pricing lookup")
                return {}

            pricing_spreadsheet = self.gc.open_by_key(pricing_sheet_id)
            pricing_sheet = pricing_spreadsheet.worksheet(pricing_worksheet)
            
            # Get all data from the pricing sheet
            all_data = pricing_sheet.get_all_values()
            
            if not all_data or len(all_data) < 2:
                logger.warning("No data found in pricing sheet")
                return {}
            
            logger.info(f"Searching for SKU '{target_sku}' in {len(all_data)} rows of pricing data")
            
            # Find the target SKU
            for row_index, row in enumerate(all_data[1:], start=2):  # Skip header row
                if len(row) >= pricing_config['sku_column']:
                    sheet_sku = row[pricing_config['sku_column'] - 1].strip()  # Convert to 0-based index
                    
                    if sheet_sku == target_sku:
                        logger.info(f"Found SKU '{target_sku}' at row {row_index}")
                        
                        # Extract pricing data safely
                        pricing_data = {
                            'our_price': self._safe_get_cell_value(row, pricing_config.get('our_price_column', 0)),
                            'competitor_name': pricing_config.get('competitor_name', ''),
                            'competitor_price': self._safe_get_cell_value(row, pricing_config.get('competitor_price_column', 0)),
                            'rrp': self._safe_get_cell_value(row, pricing_config.get('rrp_column', 0)),
                            'lowest_price': self._safe_get_cell_value(row, pricing_config.get('lowest_price_column', 0))
                        }
                        
                        # Cache the result
                        self._pricing_cache[cache_key] = pricing_data
                        
                        logger.info(f"Retrieved pricing data for {target_sku}: Our: {pricing_data['our_price']}, Competitor: {pricing_data['competitor_price']}")
                        return pricing_data
            
            # SKU not found
            logger.warning(f"SKU '{target_sku}' not found in pricing sheet")
            
            # Cache the empty result to avoid repeated lookups
            self._pricing_cache[cache_key] = {}
            return {}
            
        except Exception as e:
            logger.error(f"Error getting pricing data for SKU {target_sku}: {e}")
            return {}

    def _safe_get_cell_value(self, row: List[str], column_index: int) -> str:
        """Safely get a cell value from a row"""
        try:
            if column_index > 0 and column_index <= len(row):
                value = row[column_index - 1].strip()  # Convert to 0-based index
                return value if value else ''
            return ''
        except (IndexError, AttributeError):
            return ''

    def get_product_with_pricing(self, collection_name: str, row_num: int) -> Optional[Dict[str, Any]]:
        """
        Get a single product with pricing data merged in
        
        Args:
            collection_name: Name of the collection
            row_num: Row number of the product
            
        Returns:
            Product data with pricing information or None if not found
        """
        try:
            # Get main product data
            product = self.get_single_product(collection_name, row_num)
            if not product:
                return None

            # Get collection config
            config = get_collection_config(collection_name)
            
            # Check if pricing is enabled and configured for this collection
            if (hasattr(config, 'pricing_enabled') and config.pricing_enabled and 
                hasattr(config, 'pricing_sheet_id') and hasattr(config, 'pricing_lookup_config')):
                
                # Get SKU for pricing lookup
                sku = product.get('variant_sku', '').strip()
                
                if sku:
                    logger.info(f"Looking up pricing data for SKU: {sku}")
                    
                    # Fetch pricing data from external sheet
                    pricing_data = self.get_pricing_data(
                        config.pricing_sheet_id,
                        config.pricing_worksheet,
                        config.pricing_lookup_config,
                        sku
                    )
                    
                    # Merge pricing data into product
                    if pricing_data:
                        from datetime import datetime
                        
                        product['our_current_price'] = pricing_data.get('our_price', '')
                        product['competitor_name'] = pricing_data.get('competitor_name', '')
                        product['competitor_price'] = pricing_data.get('competitor_price', '')
                        product['price_last_updated'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                        
                        logger.info(f"Merged pricing data for SKU {sku}")
                    else:
                        logger.info(f"No pricing data found for SKU {sku}")
                else:
                    logger.warning(f"No SKU found for product in row {row_num}")
            
            return product
            
        except Exception as e:
            logger.error(f"Error getting product with pricing for {collection_name} row {row_num}: {e}")
            return self.get_single_product(collection_name, row_num)  # Fallback to basic product data

    def clear_pricing_cache(self):
        """Clear the pricing data cache"""
        self._pricing_cache.clear()
        logger.info("Pricing cache cleared")

    def get_urls_from_collection(self, collection_name: str, force_refresh: bool = False) -> List[Tuple[int, str]]:
        """Get all URLs from a collection's spreadsheet"""
        worksheet = self.get_worksheet(collection_name)
        if not worksheet:
            return []

        try:
            # Get collection config to determine which URL field to use
            from config.collections import get_collection_config
            config = get_collection_config(collection_name)

            # Determine URL field to use (default to 'url' for backward compatibility)
            url_field = getattr(config, 'url_field_for_extraction', 'url')

            # Get all products to find URLs from actual data instead of reading column directly
            # Force refresh to ensure we get latest data (important for multiple bulk extractions)
            all_products = self.get_all_products(collection_name, force_refresh=force_refresh)
            urls = []

            logger.info(f"🔍 Searching for URLs in {len(all_products)} products from {collection_name} (using field '{url_field}')")

            for row_num, product in all_products.items():
                url = product.get(url_field, '').strip()
                if url and url.lower() != url_field.lower() and url.startswith(('http://', 'https://')):
                    urls.append((row_num, url))

            logger.info(f"📋 Found {len(urls)} URLs in {collection_name} collection (field: {url_field})")

            if len(urls) == 0:
                logger.warning(f"⚠️ No URLs found in {collection_name} using field '{url_field}'. Sample products: {list(all_products.keys())[:5]}")
                # Log some sample product data to debug
                if all_products:
                    sample_product = next(iter(all_products.values()))
                    logger.warning(f"⚠️ Sample product fields: {list(sample_product.keys())}")
                    logger.warning(f"⚠️ Sample {url_field} field: '{sample_product.get(url_field, 'MISSING')}'")

            return urls

        except Exception as e:
            logger.error(f"❌ Error reading URLs from {collection_name}: {e}")
            import traceback
            logger.error(f"❌ Full traceback: {traceback.format_exc()}")
            return []

    def get_all_products_csv_fallback(self, collection_name: str) -> Dict[int, Dict[str, Any]]:
        """CSV fallback for public Google Sheets when credentials are unavailable"""
        config = get_collection_config(collection_name)

        if not config.spreadsheet_id:
            logger.error(f"❌ No spreadsheet ID configured for collection: {collection_name}")
            return {}

        try:
            # Construct CSV export URL
            csv_url = f"https://docs.google.com/spreadsheets/d/{config.spreadsheet_id}/export?format=csv&gid=0"
            logger.info(f"🔄 Attempting CSV fallback for {collection_name}: {csv_url}")

            # Fetch CSV data
            response = requests.get(csv_url, timeout=30)
            response.raise_for_status()

            # Parse CSV
            csv_data = response.text
            reader = csv.reader(csv_data.splitlines())
            rows = list(reader)

            if len(rows) < 2:  # No data rows
                logger.warning(f"⚠️ No data rows found in CSV for {collection_name}")
                return {}

            products = {}
            headers = rows[0]  # First row as headers
            logger.info(f"📊 Found {len(headers)} columns: {headers[:5]}...")  # Log first 5 headers

            for row_index, row_data in enumerate(rows[1:], start=2):  # Start at row 2
                # Ensure row has enough columns
                while len(row_data) < len(headers):
                    row_data.append('')

                # Map data using column mapping from config
                product = {}
                for field, col_index in config.column_mapping.items():
                    if col_index <= len(row_data):
                        value = row_data[col_index - 1] if col_index > 0 else ''
                        product[field] = value.strip() if value else ''
                    else:
                        product[field] = ''

                # Add additional fields for display
                product['row_number'] = row_index

                # Only include products that have meaningful data
                # Check if key fields have actual content
                key_fields = ['url', 'variant_sku', 'title', 'handle']  # Essential fields
                has_content = any(
                    product.get(field, '').strip()
                    for field in key_fields
                    if field in product
                )

                if has_content:
                    products[row_index] = product
                else:
                    logger.debug(f"⏭️ Skipping empty row {row_index} - no content in key fields")

            logger.info(f"✅ Successfully loaded {len(products)} products from CSV for {collection_name}")
            return products

        except Exception as e:
            logger.error(f"❌ CSV fallback failed for {collection_name}: {e}")
            return {}

    def get_all_products(self, collection_name: str, force_refresh: bool = False) -> Dict[int, Dict[str, Any]]:
        """Get all products from a collection's spreadsheet with intelligent caching

        Priority order:
        1. SQLite database cache (fastest - 0.2s)
        2. In-memory cache (fast - 2s)
        3. Google Sheets API (slow - 60s)
        """
        start_time = time.time()
        db_cache = get_db_cache()

        # Check SQLite database cache first (unless force refresh)
        if not force_refresh:
            cached_products = db_cache.get_all_products(collection_name)
            if cached_products:
                elapsed_time = (time.time() - start_time) * 1000
                logger.info(f"🗄️ SQLite Cache HIT: Retrieved {len(cached_products)} products for {collection_name} in {elapsed_time:.1f}ms")
                # Also warm in-memory cache for even faster subsequent access
                cache_manager.warm_cache(collection_name, cached_products)
                return cached_products

            # Fall back to in-memory cache
            cached_products = cache_manager.get('products', collection_name)
            if cached_products:
                elapsed_time = (time.time() - start_time) * 1000
                logger.info(f"⚡ Memory Cache HIT: Retrieved {len(cached_products)} products for {collection_name} in {elapsed_time:.1f}ms")
                return cached_products

        logger.info(f"🔄 Cache MISS: Loading fresh data from Google Sheets for {collection_name}")

        # Fetch from Google Sheets
        worksheet = self.get_worksheet(collection_name)
        if not worksheet:
            # Use CSV fallback for public Google Sheets
            logger.info(f"🔄 No Google Sheets API access, using CSV export for {collection_name}")
            products = self.get_all_products_csv_fallback(collection_name)
        else:
            products = self._fetch_products_from_sheet(collection_name, worksheet)

        # Cache the results for future requests
        if products:
            # Save to both caches
            sync_duration = time.time() - start_time
            db_cache.save_all_products(collection_name, products, sync_duration)
            cache_manager.warm_cache(collection_name, products)

        elapsed_time = (time.time() - start_time) * 1000
        logger.info(f"📊 Retrieved {len(products)} products from Google Sheets for {collection_name} in {elapsed_time:.1f}ms")
        return products

    def get_products_paginated(self, collection_name: str, page: int = 1, limit: int = 50,
                             search: str = '', quality_filter: str = '', sort_by: str = 'sheet_order', force_refresh: bool = False) -> Dict[str, Any]:
        """Get paginated products for better performance with large datasets

        Args:
            sort_by: 'sheet_order' (default, preserves Google Sheets order) or 'quality_score'
        """
        start_time = time.time()

        # Get all products (this uses cache if available)
        all_products = self.get_all_products(collection_name, force_refresh=force_refresh)

        # Convert to list for easier manipulation
        products_list = []
        for row_num, product in all_products.items():
            product['row_number'] = row_num
            products_list.append(product)

        # Apply search filter
        if search:
            search_lower = search.lower()
            filtered_products = []
            for product in products_list:
                # Search in key fields
                searchable_text = ' '.join([
                    str(product.get('title', '')),
                    str(product.get('variant_sku', '')),
                    str(product.get('sku', '')),
                    str(product.get('brand_name', '')),
                    str(product.get('vendor', '')),
                    str(product.get('features', '')),
                ]).lower()

                if search_lower in searchable_text:
                    filtered_products.append(product)
            products_list = filtered_products

        # Apply quality filter
        if quality_filter:
            if quality_filter == 'excellent':
                products_list = [p for p in products_list if (p.get('quality_score', 0) or 0) >= 90]
            elif quality_filter == 'good':
                products_list = [p for p in products_list if 70 <= (p.get('quality_score', 0) or 0) < 90]
            elif quality_filter == 'needs-work':
                products_list = [p for p in products_list if (p.get('quality_score', 0) or 0) < 70]

        # Sort products based on sort_by parameter
        if sort_by == 'quality_score':
            # Sort by quality score (best first)
            products_list.sort(key=lambda x: x.get('quality_score', 0), reverse=True)
        elif sort_by == 'sheet_order':
            # Sort by row number to preserve Google Sheets order (default)
            products_list.sort(key=lambda x: x.get('row_number', 0))
        # else: no sorting (preserve current order)

        # Calculate pagination
        total_count = len(products_list)
        total_pages = (total_count + limit - 1) // limit  # Ceiling division

        # Validate page number
        if page < 1:
            page = 1
        elif page > total_pages and total_pages > 0:
            page = total_pages

        # Calculate slice indices
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit

        # Get page products
        page_products = products_list[start_idx:end_idx]

        # Convert back to dict format expected by frontend
        paginated_products = {}
        for product in page_products:
            row_num = product['row_number']
            paginated_products[row_num] = product

        elapsed_time = (time.time() - start_time) * 1000
        logger.info(f"📄 Paginated {len(paginated_products)} products from {total_count} total for {collection_name} in {elapsed_time:.1f}ms")

        return {
            'products': paginated_products,
            'total_count': total_count,
            'total_pages': total_pages,
            'current_page': page,
            'has_next': page < total_pages,
            'has_prev': page > 1,
            'per_page': limit
        }

    def _fetch_products_from_sheet(self, collection_name: str, worksheet) -> Dict[int, Dict[str, Any]]:
        """Internal method to fetch products from Google Sheets"""
        config = get_collection_config(collection_name)

        try:
            all_values = worksheet.get_all_values()

            if len(all_values) < 2:  # No data rows
                return {}

            logger.info(f"📊 Processing {len(all_values) - 1} rows from {collection_name} spreadsheet")
            products = {}

            for row_index, row_data in enumerate(all_values[1:], start=2):  # Start at row 2
                # Ensure row has enough columns
                while len(row_data) < max(config.column_mapping.values()):
                    row_data.append('')

                # Map data using column mapping from config
                product = {}
                for field, col_index in config.column_mapping.items():
                    if col_index <= len(row_data):
                        value = row_data[col_index - 1] if col_index > 0 else ''
                        product[field] = value.strip() if value else ''
                    else:
                        product[field] = ''

                # Only include products that have some meaningful data
                # Check if ANY field has actual content (not just key fields)
                has_any_content = any(
                    str(value).strip()
                    for value in product.values()
                    if value and str(value).strip().lower() not in ['', 'n/a', 'null', 'none']
                )

                if has_any_content:
                    # Calculate or use existing quality score
                    quality_score = self._get_quality_score(collection_name, product)
                    product['quality_score'] = quality_score
                    products[row_index] = product
                else:
                    logger.debug(f"⏭️ Skipping completely empty row {row_index}")

            logger.info(f"📊 Included {len(products)} products from {len(all_values) - 1} rows in {collection_name}")
            return products

        except Exception as e:
            logger.error(f"❌ Error retrieving products from {collection_name}: {e}")
            return {}

    def get_single_product(self, collection_name: str, row_num: int) -> Optional[Dict[str, Any]]:
        """Get a single product by row number"""
        worksheet = self.get_worksheet(collection_name)
        if not worksheet:
            return None

        config = get_collection_config(collection_name)

        try:
            row_data = worksheet.row_values(row_num)

            if not row_data:
                return None

            # Map data using column mapping
            product = {}
            for field, col_index in config.column_mapping.items():
                if col_index <= len(row_data):
                    value = row_data[col_index - 1] if col_index > 0 else ''
                    product[field] = value.strip() if value else ''
                else:
                    product[field] = ''

            # Calculate or use existing quality score
            quality_score = self._get_quality_score(collection_name, product)
            product['quality_score'] = quality_score

            return product

        except Exception as e:
            logger.error(f"❌ Error retrieving product row {row_num} from {collection_name}: {e}")
            return None

    def _get_quality_score(self, collection_name: str, product: Dict[str, Any]) -> int:
        """Get quality score - use existing from sheet or calculate new one"""
        # Try to use quality score from column if it exists
        quality_score_raw = product.get('quality_score', '')

        if quality_score_raw and quality_score_raw.strip():
            try:
                # Handle percentage values
                quality_str = str(quality_score_raw).strip().replace('%', '')
                quality_float = float(quality_str)

                # Convert to percentage if needed
                if 0 <= quality_float <= 1:
                    return int(quality_float * 100)
                elif 1 < quality_float <= 100:
                    return int(quality_float)
                else:
                    return min(int(quality_float), 100)

            except (ValueError, TypeError):
                logger.warning(f"Invalid quality score '{quality_score_raw}', calculating fallback")

        # Fallback: calculate using validation system
        try:
            validation_result = validate_product_data(collection_name, product)
            return int(validation_result['quality_score'])
        except Exception as e:
            logger.warning(f"Failed to calculate quality score: {e}")
            return 0

    def row_needs_processing(self, collection_name: str, row_num: int, force_overwrite: bool = True) -> bool:
        """Check if a row needs processing"""
        if force_overwrite:
            logger.debug(f"🔄 Row {row_num} ({collection_name}) - Overwrite mode: processing regardless")
            return True

        # Legacy mode - check if key fields are empty
        try:
            product = self.get_single_product(collection_name, row_num)
            if not product:
                return True

            config = get_collection_config(collection_name)

            # Check if key AI extraction fields are empty
            key_fields = config.ai_extraction_fields[:5]  # Check first 5 AI fields
            empty_count = 0

            for field in key_fields:
                value = product.get(field, '')
                if not value or str(value).strip() == '':
                    empty_count += 1

            needs_processing = empty_count >= len(key_fields) // 2
            logger.debug(f"Row {row_num} ({collection_name}) - Empty fields: {empty_count}/{len(key_fields)}, needs processing: {needs_processing}")

            return needs_processing

        except Exception as e:
            logger.error(f"Error checking row {row_num} ({collection_name}): {e}")
            return True

    def add_product(self, collection_name: str, data: Dict[str, Any]) -> int:
        """
        Add a new product row to the Google Sheet

        Args:
            collection_name: Name of the collection
            data: Product data to add (dict with field names as keys)

        Returns:
            Row number of the newly added product
        """
        worksheet = self.get_worksheet(collection_name)
        if not worksheet:
            raise Exception(f"Could not access worksheet for {collection_name}")

        config = get_collection_config(collection_name)

        try:
            # Get the current number of rows to determine next row number
            all_values = worksheet.get_all_values()
            next_row = len(all_values) + 1

            # Build row data based on column mapping
            row_data = [''] * max(config.column_mapping.values())

            for field, value in data.items():
                if field in config.column_mapping:
                    col_num = config.column_mapping[field]
                    formatted_value = self._format_value_for_sheets(value)
                    row_data[col_num - 1] = formatted_value

            # Append the row
            worksheet.append_row(row_data)

            logger.info(f"✅ Added new product at row {next_row} ({collection_name})")

            # Note: We don't clear the entire cache here because:
            # 1. The cache will auto-rebuild when the collection page loads
            # 2. Clearing the cache would force a full re-fetch of all products
            # 3. The new product will be fetched when accessed

            return next_row

        except Exception as e:
            logger.error(f"❌ Failed to add product to {collection_name}: {e}")
            raise

    def update_product_row(self, collection_name: str, row_num: int, data: Dict[str, Any],
                          overwrite_mode: bool = True, allowed_fields: Optional[List[str]] = None) -> bool:
        """
        Update a product row with selective field updating using BATCH updates to avoid quota issues

        Args:
            collection_name: Name of the collection
            row_num: Row number to update
            data: Data to update
            overwrite_mode: Whether to overwrite existing data
            allowed_fields: List of fields allowed to be updated (None = all fields)
        """
        worksheet = self.get_worksheet(collection_name)
        if not worksheet:
            return False

        config = get_collection_config(collection_name)

        try:
            # Prepare batch update list
            batch_updates = []
            updates_made = []

            for field, value in data.items():
                # Check if field is in column mapping
                if field not in config.column_mapping:
                    logger.warning(f"Field '{field}' not in column mapping for {collection_name}")
                    continue

                # Check if field is allowed to be updated
                if allowed_fields is not None and field not in allowed_fields:
                    logger.debug(f"Field '{field}' not in allowed fields list, skipping")
                    continue

                # Skip empty values unless explicitly overwriting
                if not overwrite_mode and (value is None or str(value).strip() == ''):
                    continue

                col_num = config.column_mapping[field]
                formatted_value = self._format_value_for_sheets(value)

                # Add to batch update list
                batch_updates.append({
                    'range': f'{gspread.utils.rowcol_to_a1(row_num, col_num)}',
                    'values': [[formatted_value]]
                })
                updates_made.append(field)

                logger.debug(f"✅ Prepared batch update for {field}: {str(formatted_value)[:50]}{'...' if len(str(formatted_value)) > 50 else ''}")

            # Execute batch update (single API call for all fields)
            if batch_updates:
                try:
                    worksheet.batch_update(batch_updates)
                    logger.info(f"✅ Updated row {row_num} ({collection_name}): {len(updates_made)} fields updated in BATCH - {updates_made}")
                except Exception as e:
                    logger.error(f"❌ Batch update failed for row {row_num}: {e}")
                    return False

                # Update the specific product in SQLite cache (instead of clearing entire cache)
                try:
                    from core.db_cache import get_db_cache
                    db_cache = get_db_cache()

                    # Fetch the single updated product from the sheet
                    updated_product = self.get_single_product(collection_name, row_num)
                    if updated_product:
                        db_cache.update_single_product(collection_name, row_num, updated_product)
                        logger.info(f"💾 Updated product {row_num} in SQLite cache for {collection_name}")
                    else:
                        logger.warning(f"⚠️ Couldn't fetch updated product {row_num}, cache may be stale")
                except Exception as e:
                    logger.warning(f"⚠️ Failed to update SQLite cache: {e}")

                # Clear in-memory cache for this specific product
                cache_manager.invalidate('products', collection_name)

                return True
            else:
                logger.info(f"⏭️ Row {row_num} ({collection_name}): No fields updated")
                return False

        except Exception as e:
            logger.error(f"❌ Failed to update row {row_num} ({collection_name}): {e}")
            return False

    def update_single_field(self, collection_name: str, row_num: int, field: str, value: Any) -> bool:
        """Update a single field in a product row"""
        return self.update_product_row(collection_name, row_num, {field: value}, overwrite_mode=True)

    def delete_product_row(self, collection_name: str, row_num: int) -> bool:
        """
        Delete a product row from Google Sheets

        Args:
            collection_name: Name of the collection
            row_num: Row number to delete (1-indexed, matching Google Sheets)

        Returns:
            bool: True if deletion was successful, False otherwise
        """
        try:
            logger.info(f"🗑️ Deleting row {row_num} from {collection_name}")

            # Get the worksheet
            worksheet = self.get_worksheet(collection_name)
            if not worksheet:
                logger.error(f"❌ Could not get worksheet for {collection_name}")
                return False

            # Delete the row from Google Sheets
            # Note: Google Sheets API uses 1-based indexing
            worksheet.delete_rows(row_num)

            # Clear from cache
            from core.db_cache import get_db_cache
            db_cache = get_db_cache()
            db_cache.delete_product(collection_name, row_num)

            logger.info(f"✅ Deleted row {row_num} from {collection_name}")
            return True

        except Exception as e:
            logger.error(f"❌ Error deleting row {row_num} from {collection_name}: {e}")
            import traceback
            traceback.print_exc()
            return False

    def trigger_data_cleaning(self, collection_name: str, row_num: int) -> bool:
        """
        Trigger Google Apps Script data cleaning by calling the cleanSingleRow function directly

        Args:
            collection_name: Name of the collection
            row_num: Row number to trigger cleaning for

        Returns:
            bool: True if cleaning was successfully triggered, False otherwise
        """
        try:
            logger.info(f"🔄 [WEBHOOK DEBUG] Starting data cleaning trigger for {collection_name} row {row_num}")

            # Check if data cleaning is enabled
            if not self.settings.FEATURES.get('DATA_CLEANING_ENABLED', False):
                logger.warning(f"⚠️ [WEBHOOK DEBUG] Data cleaning is disabled in settings")
                return False

            # Get the spreadsheet configuration for this collection
            config = get_collection_config(collection_name)
            if not config:
                logger.error(f"❌ [WEBHOOK DEBUG] No configuration found for collection: {collection_name}")
                return False

            spreadsheet_id = config.spreadsheet_id
            if not spreadsheet_id:
                logger.error(f"❌ [WEBHOOK DEBUG] No spreadsheet ID found for collection: {collection_name}")
                return False

            # Get the script ID
            script_id = self._get_script_id_for_spreadsheet(spreadsheet_id)
            logger.info(f"🔧 [WEBHOOK DEBUG] Script ID: {script_id}")

            # Construct the Google Apps Script webhook URL
            # The script should be deployed as a web app with a doPost function
            script_url = f"https://script.google.com/macros/s/{script_id}/exec"
            logger.info(f"🔧 [WEBHOOK DEBUG] Webhook URL: {script_url}")

            # Prepare the payload for the Apps Script
            payload = {
                "action": "cleanSingleRow",
                "spreadsheet_id": spreadsheet_id,
                "row_number": row_num,
                "collection_name": collection_name,
                "triggered_by": "ai_extraction"
            }
            logger.info(f"📤 [WEBHOOK DEBUG] Payload: {payload}")

            # Make the HTTP request to trigger the Apps Script
            logger.info(f"🌐 [WEBHOOK DEBUG] Making POST request to Google Apps Script...")
            response = requests.post(
                script_url,
                json=payload,
                headers={'Content-Type': 'application/json'},
                timeout=30
            )
            logger.info(f"📥 [WEBHOOK DEBUG] Response status: {response.status_code}")
            logger.info(f"📥 [WEBHOOK DEBUG] Response text: {response.text[:500]}...")

            if response.status_code == 200:
                result = response.json()
                if result.get('success', False):
                    logger.info(f"✅ Successfully triggered data cleaning for {collection_name} row {row_num}")
                    return True
                else:
                    logger.error(f"❌ Apps Script returned error: {result.get('error', 'Unknown error')}")
                    return False
            else:
                logger.error(f"❌ HTTP error triggering data cleaning: {response.status_code} - {response.text}")
                return False

        except Exception as e:
            logger.error(f"❌ Error triggering data cleaning for {collection_name} row {row_num}: {e}")
            return False

    def _get_script_id_for_spreadsheet(self, spreadsheet_id: str) -> str:
        """
        Get the Google Apps Script ID for a given spreadsheet
        For now, we'll use a single script ID that handles all spreadsheets
        TODO: This could be made configurable per collection
        """
        # This would need to be configured with your actual deployed Apps Script ID
        # The script should be deployed as a web app with execution permissions
        return os.getenv('GOOGLE_APPS_SCRIPT_ID', 'YOUR_SCRIPT_ID_HERE')

    def update_multiple_fields(self, collection_name: str, row_num: int,
                             field_updates: Dict[str, str]) -> bool:
        """
        Update multiple fields for a product in one operation

        Args:
            collection_name: Name of the collection
            row_num: Row number to update
            field_updates: Dict mapping field names to values

        Returns:
            True if successful, False otherwise
        """
        try:
            config = get_collection_config(collection_name)
            worksheet = self.get_worksheet(collection_name)

            if not worksheet:
                logger.error(f"Could not access worksheet for {collection_name}")
                return False

            updates_made = []

            for field, value in field_updates.items():
                # Check if field is in column mapping
                if field not in config.column_mapping:
                    logger.warning(f"Field '{field}' not in column mapping for {collection_name}")
                    continue

                col_num = config.column_mapping[field]

                try:
                    formatted_value = self._format_value_for_sheets(value)
                    worksheet.update_cell(row_num, col_num, formatted_value)
                    updates_made.append(field)

                    logger.debug(f"✅ Updated {field} at row {row_num}: {str(formatted_value)[:50]}...")

                    # Rate limiting
                    time.sleep(self.settings.SHEETS_DELAY_BETWEEN_REQUESTS)

                except Exception as e:
                    logger.error(f"Failed to update {field} in row {row_num}: {e}")
                    continue

            if updates_made:
                logger.info(f"✅ Updated row {row_num} ({collection_name}): {len(updates_made)} fields - {updates_made}")
                return True
            else:
                logger.warning(f"No fields updated for row {row_num} in {collection_name}")
                return False

        except Exception as e:
            logger.error(f"Error in update_multiple_fields: {e}")
            return False
    def get_empty_content_rows(self, collection_name: str,
                              content_fields: List[str]) -> List[int]:
        """
        Get row numbers where specified content fields are empty

        Args:
            collection_name: Name of the collection
            content_fields: List of content field names to check (e.g., ['features', 'care_instructions'])

        Returns:
            List of row numbers that need content generation
        """
        try:
            worksheet = self.get_worksheet(collection_name)
            if not worksheet:
                return []

            config = get_collection_config(collection_name)

        # Get all data
            all_values = worksheet.get_all_values()

            if len(all_values) < 2:  # No data rows
                return []

            headers = all_values[0]  # First row is headers

            # Find column indices for content fields
            field_column_indices = {}
            for field in content_fields:
                if field in config.column_mapping:
                    col_index = config.column_mapping[field] - 1  # Convert to 0-based index
                    field_column_indices[field] = col_index

            if not field_column_indices:
                logger.warning(f"None of the content fields {content_fields} found in {collection_name} column mapping")
                return []

            # Find rows with empty content fields
            empty_rows = []

            for row_index, row_data in enumerate(all_values[1:], start=2):  # Start at row 2
            # Ensure row has enough columns
                while len(row_data) < max(field_column_indices.values()) + 1:
                    row_data.append('')

            # Check if any of the content fields are empty
                needs_content = False
                for field, col_index in field_column_indices.items():
                    if col_index < len(row_data):
                        value = row_data[col_index].strip() if row_data[col_index] else ''
                        if not value or value.lower() in ['', 'none', 'null', 'n/a', '-']:
                            needs_content = True
                            break
                    else:
                        # Column doesn't exist in this row
                        needs_content = True
                        break

                if needs_content:
                    empty_rows.append(row_index)

            logger.info(f"Found {len(empty_rows)} rows needing content in {collection_name}")
            return empty_rows

        except Exception as e:
            logger.error(f"Error finding empty content rows in {collection_name}: {e}")
            return []

    def _format_value_for_sheets(self, value: Any) -> str:
        """Format a value for Google Sheets"""
        if isinstance(value, list):
            # For lists, join with commas instead of JSON encoding
            # This makes it readable in sheets: "url1, url2" instead of ["url1", "url2"]
            return ', '.join(str(item) for item in value)
        elif isinstance(value, dict):
            # Keep JSON encoding for dicts as they need structure
            return json.dumps(value)
        elif isinstance(value, bool):
            return 'TRUE' if value else 'FALSE'
        elif value is None:
            return ''
        else:
            return str(value)

    def get_collection_stats(self, collection_name: str) -> Dict[str, Any]:
        """Get statistics for a collection"""
        products = self.get_all_products(collection_name)

        if not products:
            return {
                'total_products': 0,
                'complete_products': 0,
                'missing_info_products': 0,
                'data_quality_percent': 0
            }

        total_products = len(products)
        complete_products = 0
        total_quality = 0

        for product in products.values():
            quality = product.get('quality_score', 0)
            total_quality += quality

            if quality >= 80:  # Consider 80%+ as complete
                complete_products += 1

        missing_info_products = total_products - complete_products
        avg_quality = int(total_quality / total_products) if total_products > 0 else 0

        return {
            'total_products': total_products,
            'complete_products': complete_products,
            'missing_info_products': missing_info_products,
            'data_quality_percent': avg_quality
        }

    def validate_collection_access(self, collection_name: str) -> Tuple[bool, str]:
        """Validate that we can access a collection's spreadsheet"""
        try:
            logger.info(f"🔍 Starting validation for collection: {collection_name}")

            config = get_collection_config(collection_name)
            logger.info(f"📋 Config loaded - Spreadsheet ID: {config.spreadsheet_id[:10]}..., Worksheet: {config.worksheet_name}")

            if not config.spreadsheet_id:
                logger.error(f"❌ No spreadsheet ID configured for {collection_name}")
                return False, f"No spreadsheet ID configured for {collection_name}"

            logger.info(f"🔗 Attempting to access spreadsheet for {collection_name}")
            spreadsheet = self.get_spreadsheet(collection_name)
            if not spreadsheet:
                logger.error(f"❌ Cannot access spreadsheet for {collection_name}")
                return False, f"Cannot access spreadsheet for {collection_name}"

            logger.info(f"✅ Spreadsheet accessed successfully, attempting worksheet access")
            worksheet = self.get_worksheet(collection_name)
            if not worksheet:
                logger.error(f"❌ Cannot access worksheet '{config.worksheet_name}' for {collection_name}")
                # List available worksheets for debugging
                try:
                    available_worksheets = [ws.title for ws in spreadsheet.worksheets()]
                    logger.error(f"📝 Available worksheets: {available_worksheets}")
                except Exception as ws_error:
                    logger.error(f"❌ Could not list worksheets: {ws_error}")
                return False, f"Cannot access worksheet '{config.worksheet_name}' for {collection_name}"

            logger.info(f"✅ Worksheet accessed successfully, attempting to read headers")
            # Try to read first row (headers)
            headers = worksheet.row_values(1)
            if not headers:
                logger.error(f"❌ No headers found in {collection_name} worksheet")
                return False, f"No headers found in {collection_name} worksheet"

            logger.info(f"✅ Successfully validated access to {collection_name} - Found {len(headers)} headers")
            return True, f"Successfully validated access to {collection_name}"

        except Exception as e:
            logger.error(f"❌ Validation error for {collection_name}: {str(e)}")
            return False, f"Validation error for {collection_name}: {str(e)}"

    def get_available_collections(self) -> List[Dict[str, Any]]:
        """Get list of available collections with their access status"""
        from config.collections import get_all_collections

        collections = []
        all_configs = get_all_collections()

        for name, config in all_configs.items():
            is_accessible, message = self.validate_collection_access(name)

            collections.append({
                'name': name,
                'display_name': config.name,
                'description': config.description,
                'accessible': is_accessible,
                'message': message,
                'spreadsheet_id': config.spreadsheet_id[:10] + '...' if config.spreadsheet_id else 'Not configured',
                'ai_fields_count': len(config.ai_extraction_fields),
                'total_fields_count': len(config.column_mapping)
            })

        return collections

# Global instance
sheets_manager = SheetsManager()

def get_sheets_manager() -> SheetsManager:
    """Get the global sheets manager instance"""
    return sheets_manager