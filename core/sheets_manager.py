"""
Collection-Agnostic Google Sheets Manager
Handles all Google Sheets operations for any product collection
Enhanced with Pricing Comparison (Caprice) functionality
"""
import json
import logging
import time
import csv
import requests
from typing import Dict, List, Any, Optional, Tuple, Union
import gspread
from google.oauth2.service_account import Credentials

from config.settings import get_settings
from config.collections import get_collection_config, CollectionConfig
from config.validation import get_validator, validate_product_data

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
        spreadsheet = self.get_spreadsheet(collection_name)
        if not spreadsheet:
            return None

        config = get_collection_config(collection_name)

        try:
            worksheet = spreadsheet.worksheet(config.worksheet_name)
            return worksheet
        except Exception as e:
            logger.error(f"❌ Error accessing worksheet '{config.worksheet_name}' for {collection_name}: {e}")
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

    def get_urls_from_collection(self, collection_name: str) -> List[Tuple[int, str]]:
        """Get all URLs from a collection's spreadsheet"""
        worksheet = self.get_worksheet(collection_name)
        if not worksheet:
            return []

        try:
            url_values = worksheet.col_values(1)  # Column A (URL column)
            urls = []

            for i, url in enumerate(url_values[1:], start=2):  # Skip header row
                if url and url.strip() and not url.upper() == 'URL':
                    urls.append((i, url.strip()))

            logger.info(f"📋 Found {len(urls)} URLs in {collection_name} collection")
            return urls

        except Exception as e:
            logger.error(f"❌ Error reading URLs from {collection_name}: {e}")
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

                # Validate data and store (skip validation for now to get data loading)
                products[row_index] = product

            logger.info(f"✅ Successfully loaded {len(products)} products from CSV for {collection_name}")
            return products

        except Exception as e:
            logger.error(f"❌ CSV fallback failed for {collection_name}: {e}")
            return {}

    def get_all_products(self, collection_name: str) -> Dict[int, Dict[str, Any]]:
        """Get all products from a collection's spreadsheet"""
        worksheet = self.get_worksheet(collection_name)
        if not worksheet:
            logger.error(f"❌ Cannot access Google Sheets API for {collection_name}")
            logger.error("❌ Please configure Google service account credentials")
            logger.error("❌ See GOOGLE_SHEETS_SETUP.md for instructions")
            return {}

        config = get_collection_config(collection_name)

        try:
            all_values = worksheet.get_all_values()

            if len(all_values) < 2:  # No data rows
                return {}

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

                # Calculate or use existing quality score
                quality_score = self._get_quality_score(collection_name, product)
                product['quality_score'] = quality_score

                products[row_index] = product

            logger.info(f"📊 Retrieved {len(products)} products from {collection_name}")
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

    def update_product_row(self, collection_name: str, row_num: int, data: Dict[str, Any],
                          overwrite_mode: bool = True, allowed_fields: Optional[List[str]] = None) -> bool:
        """
        Update a product row with selective field updating

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

                try:
                    formatted_value = self._format_value_for_sheets(value)
                    worksheet.update_cell(row_num, col_num, formatted_value)
                    updates_made.append(field)

                    # Add delay to avoid rate limiting
                    time.sleep(self.settings.SHEETS_DELAY_BETWEEN_REQUESTS)

                    logger.debug(f"✅ Row {row_num} ({collection_name}) - Updated {field}: {str(formatted_value)[:50]}{'...' if len(str(formatted_value)) > 50 else ''}")

                except Exception as e:
                    logger.error(f"Error updating {field} in row {row_num}: {e}")

            if updates_made:
                logger.info(f"✅ Updated row {row_num} ({collection_name}): {len(updates_made)} fields updated - {updates_made}")
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
        if isinstance(value, dict) or isinstance(value, list):
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
            config = get_collection_config(collection_name)

            if not config.spreadsheet_id:
                return False, f"No spreadsheet ID configured for {collection_name}"

            spreadsheet = self.get_spreadsheet(collection_name)
            if not spreadsheet:
                return False, f"Cannot access spreadsheet for {collection_name}"

            worksheet = self.get_worksheet(collection_name)
            if not worksheet:
                return False, f"Cannot access worksheet '{config.worksheet_name}' for {collection_name}"

            # Try to read first row (headers)
            headers = worksheet.row_values(1)
            if not headers:
                return False, f"No headers found in {collection_name} worksheet"

            return True, f"Successfully validated access to {collection_name}"

        except Exception as e:
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