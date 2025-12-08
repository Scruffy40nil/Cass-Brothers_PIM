"""
Data Cleaner Module
Applies rule-based standardization to extracted data BEFORE writing to Google Sheets.
Replaces the need for Apps Script post-processing.

Rules are loaded from Google Sheets rule sheets:
- Warranty_Rules
- Material_Rules
- Installation_Rules
- Style_Rules
- Grade_Rules
- Location_Rules
- Drain_Rules
"""

import logging
import math
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class DataCleaner:
    """Applies rule-based standardization to extracted product data"""

    def __init__(self, sheets_manager):
        self.sheets_manager = sheets_manager
        self._rules_cache = {}
        self._cache_loaded = False

    def load_rules(self, spreadsheet_id: str, force_refresh: bool = False) -> bool:
        """
        Load all rule sheets from the Google Spreadsheet.

        Args:
            spreadsheet_id: The ID of the spreadsheet containing rule sheets
            force_refresh: Force reload even if cached

        Returns:
            True if rules loaded successfully
        """
        if self._cache_loaded and not force_refresh:
            logger.debug("Using cached rules")
            return True

        try:
            logger.info("📋 Loading rule sheets from Google Sheets...")

            rule_sheets = [
                'Warranty_Rules',
                'Material_Rules',
                'Installation_Rules',
                'Style_Rules',
                'Grade_Rules',
                'Location_Rules',
                'Drain_Rules'
            ]

            for sheet_name in rule_sheets:
                rules = self._load_single_rule_sheet(spreadsheet_id, sheet_name)
                rule_key = sheet_name.replace('_Rules', '').lower()
                self._rules_cache[rule_key] = rules
                logger.info(f"  ✅ Loaded {len(rules)} rules from {sheet_name}")

            self._cache_loaded = True
            logger.info(f"✅ All rule sheets loaded successfully")
            return True

        except Exception as e:
            logger.error(f"❌ Error loading rule sheets: {e}")
            return False

    def _load_single_rule_sheet(self, spreadsheet_id: str, sheet_name: str) -> Dict[str, str]:
        """
        Load a single rule sheet and return as dict {search_term: standard_value}

        Format expected:
        Column A: Search Term (what to look for)
        Column B: Standard Value (what to replace with, blank = delete)
        """
        rules = {}

        try:
            # Get the spreadsheet
            spreadsheet = self.sheets_manager.gc.open_by_key(spreadsheet_id)

            try:
                worksheet = spreadsheet.worksheet(sheet_name)
            except Exception:
                logger.warning(f"⚠️ Rule sheet '{sheet_name}' not found, skipping")
                return rules

            # Get all data
            data = worksheet.get_all_values()

            if len(data) < 2:
                logger.warning(f"⚠️ Rule sheet '{sheet_name}' has no data rows")
                return rules

            # Skip header row, process data rows
            for row in data[1:]:
                if len(row) >= 1 and row[0]:
                    search_term = row[0].strip().upper()
                    standard_value = row[1].strip() if len(row) > 1 else ''

                    if search_term:
                        rules[search_term] = standard_value

            return rules

        except Exception as e:
            logger.error(f"❌ Error loading rule sheet '{sheet_name}': {e}")
            return rules

    def clean_extracted_data(self, collection_name: str, extracted_data: Dict[str, Any],
                            title: str = '', vendor: str = '') -> Dict[str, Any]:
        """
        Apply all cleaning rules to extracted data.

        Args:
            collection_name: Name of the collection (e.g., 'sinks')
            extracted_data: Raw extracted data from AI
            title: Product title (for pattern matching)
            vendor: Vendor/brand name (for warranty lookup)

        Returns:
            Cleaned and standardized data
        """
        if not extracted_data:
            return {}

        cleaned = extracted_data.copy()
        title = title or cleaned.get('title', '')
        vendor = vendor or cleaned.get('vendor', '') or cleaned.get('brand_name', '')

        logger.info(f"🧹 Cleaning extracted data for {collection_name}...")

        # 1. Apply field-specific rules
        cleaned = self._apply_installation_rules(cleaned, title)
        cleaned = self._apply_material_rules(cleaned, title)
        cleaned = self._apply_grade_rules(cleaned, title)
        cleaned = self._apply_style_rules(cleaned, title)
        cleaned = self._apply_location_rules(cleaned, title)
        cleaned = self._apply_drain_rules(cleaned, title)
        cleaned = self._apply_warranty_rules(cleaned, vendor)

        # 2. Calculate boolean fields based on installation type
        cleaned = self._calculate_boolean_fields(cleaned)

        # 3. Calculate derived fields
        cleaned = self._calculate_derived_fields(cleaned, title)

        # 4. Sync brand/vendor
        cleaned = self._sync_brand_vendor(cleaned)

        # 5. Extract bowls number from title if not set
        cleaned = self._extract_bowls_number(cleaned, title)

        logger.info(f"✅ Data cleaning complete for {collection_name}")
        return cleaned

    def _find_standard_value(self, value: str, title: str, rules: Dict[str, str]) -> Optional[str]:
        """
        Find the standard value for a given input using rules.

        Returns:
            - Standard value if found
            - 'DELETE_VALUE' if rule says to delete (blank standard value)
            - None if no rule matches
        """
        if not rules:
            return None

        # Normalize inputs
        value_upper = value.strip().upper() if value else ''
        title_upper = title.strip().upper() if title else ''

        # First, check if current value is already a standard value
        standard_values = [v for v in rules.values() if v]
        for std_val in standard_values:
            if std_val.upper() == value_upper:
                return std_val  # Already standard, return as-is

        # Search in rules
        for search_term, standard_value in rules.items():
            # Check if search term matches the value
            if search_term in value_upper:
                if standard_value:
                    return standard_value
                else:
                    return 'DELETE_VALUE'

            # Check if search term matches the title
            if search_term in title_upper:
                if standard_value:
                    return standard_value
                else:
                    return 'DELETE_VALUE'

        return None

    def _apply_installation_rules(self, data: Dict[str, Any], title: str) -> Dict[str, Any]:
        """Apply installation type standardization rules"""
        rules = self._rules_cache.get('installation', {})
        current_value = data.get('installation_type', '')

        if current_value or title:
            result = self._find_standard_value(current_value, title, rules)
            if result == 'DELETE_VALUE':
                data['installation_type'] = ''
                logger.debug(f"🧹 Deleted installation_type based on rules")
            elif result:
                data['installation_type'] = result
                logger.debug(f"🧹 Standardized installation_type: {current_value} → {result}")

        return data

    def _apply_material_rules(self, data: Dict[str, Any], title: str) -> Dict[str, Any]:
        """Apply material standardization rules"""
        rules = self._rules_cache.get('material', {})
        current_value = data.get('product_material', '')

        if current_value or title:
            result = self._find_standard_value(current_value, title, rules)
            if result == 'DELETE_VALUE':
                data['product_material'] = ''
            elif result:
                data['product_material'] = result
                logger.debug(f"🧹 Standardized product_material: {current_value} → {result}")

        return data

    def _apply_grade_rules(self, data: Dict[str, Any], title: str) -> Dict[str, Any]:
        """Apply material grade standardization rules"""
        rules = self._rules_cache.get('grade', {})
        current_value = data.get('grade_of_material', '')

        if current_value or title:
            result = self._find_standard_value(current_value, title, rules)
            if result == 'DELETE_VALUE':
                data['grade_of_material'] = ''
            elif result:
                data['grade_of_material'] = result
                logger.debug(f"🧹 Standardized grade_of_material: {current_value} → {result}")

        return data

    def _apply_style_rules(self, data: Dict[str, Any], title: str) -> Dict[str, Any]:
        """Apply style standardization rules"""
        rules = self._rules_cache.get('style', {})
        current_value = data.get('style', '')

        if current_value or title:
            result = self._find_standard_value(current_value, title, rules)
            if result == 'DELETE_VALUE':
                data['style'] = ''
            elif result:
                data['style'] = result
                logger.debug(f"🧹 Standardized style: {current_value} → {result}")

        return data

    def _apply_location_rules(self, data: Dict[str, Any], title: str) -> Dict[str, Any]:
        """Apply application location standardization rules"""
        rules = self._rules_cache.get('location', {})
        current_value = data.get('application_location', '')

        if current_value or title:
            result = self._find_standard_value(current_value, title, rules)
            if result == 'DELETE_VALUE':
                data['application_location'] = ''
            elif result:
                data['application_location'] = result
                logger.debug(f"🧹 Standardized application_location: {current_value} → {result}")

        return data

    def _apply_drain_rules(self, data: Dict[str, Any], title: str) -> Dict[str, Any]:
        """Apply drain position standardization rules"""
        rules = self._rules_cache.get('drain', {})
        current_value = data.get('drain_position', '')

        if current_value or title:
            result = self._find_standard_value(current_value, title, rules)
            if result == 'DELETE_VALUE':
                data['drain_position'] = ''
            elif result:
                data['drain_position'] = result
                logger.debug(f"🧹 Standardized drain_position: {current_value} → {result}")

        return data

    def _apply_warranty_rules(self, data: Dict[str, Any], vendor: str) -> Dict[str, Any]:
        """
        Apply warranty rules based on vendor/brand.
        Warranty rules are different - they map vendor names to warranty years.
        """
        rules = self._rules_cache.get('warranty', {})

        if not vendor or not rules:
            return data

        vendor_upper = vendor.strip().upper()

        for search_term, warranty_value in rules.items():
            if search_term in vendor_upper:
                if warranty_value:
                    data['warranty_years'] = warranty_value
                    logger.debug(f"🧹 Set warranty_years to {warranty_value} based on vendor {vendor}")
                else:
                    data['warranty_years'] = ''
                break

        return data

    def _calculate_boolean_fields(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculate boolean fields based on installation type.
        Sets is_undermount, is_topmount, is_flushmount based on installation_type.
        """
        installation_type = data.get('installation_type', '')
        if not installation_type:
            # If no installation type, set all to FALSE
            data['is_undermount'] = 'FALSE'
            data['is_topmount'] = 'FALSE'
            data['is_flushmount'] = 'FALSE'
            return data

        installation_upper = installation_type.upper()

        # Parse compound installation types (e.g., "Topmount & Undermount")
        separators = [' & ', ' AND ', ', ', ',', ' + ', ' / ', '/']
        installation_types = [installation_upper]

        for separator in separators:
            if separator in installation_upper:
                installation_types = [t.strip() for t in installation_upper.split(separator)]
                break

        def has_type(keyword: str) -> bool:
            keywords = [keyword.upper()]
            if keyword.upper() == 'TOPMOUNT':
                keywords.extend(['TOP MOUNT', 'TOP-MOUNT', 'SURFACE MOUNT', 'DROP-IN', 'DROPIN'])
            elif keyword.upper() == 'FLUSHMOUNT':
                keywords.extend(['FLUSH MOUNT', 'FLUSH-MOUNT', 'INSET'])
            elif keyword.upper() == 'UNDERMOUNT':
                keywords.extend(['UNDER MOUNT', 'UNDER-MOUNT'])

            return any(kw in t for t in installation_types for kw in keywords)

        # Set boolean fields
        data['is_undermount'] = 'TRUE' if has_type('UNDERMOUNT') else 'FALSE'
        data['is_topmount'] = 'TRUE' if has_type('TOPMOUNT') else 'FALSE'
        data['is_flushmount'] = 'TRUE' if has_type('FLUSHMOUNT') else 'FALSE'

        logger.debug(f"🔄 Boolean fields: undermount={data['is_undermount']}, "
                    f"topmount={data['is_topmount']}, flushmount={data['is_flushmount']} "
                    f"(from: {installation_type})")

        return data

    def _calculate_derived_fields(self, data: Dict[str, Any], title: str) -> Dict[str, Any]:
        """Calculate derived fields like cabinet size and cubic weight"""

        # Calculate min cabinet size from overall width
        # Formula: ceil((width + 50) / 100) * 100
        width = data.get('overall_width_mm')
        if width and not data.get('min_cabinet_size_mm'):
            try:
                width_num = float(str(width).replace('mm', '').strip())
                cabinet_size = math.ceil((width_num + 50) / 100) * 100
                data['min_cabinet_size_mm'] = str(int(cabinet_size))
                logger.debug(f"📐 Calculated min_cabinet_size_mm: {cabinet_size}mm from width {width_num}mm")
            except (ValueError, TypeError):
                pass

        # Calculate cubic weight from dimensions
        # Cubic weight formula: (L_cm * W_cm * H_cm) / 5000 = kg
        # Converting from mm: (L * W * H) / 5,000,000 = kg
        # With 100mm pallet allowance on height
        length = data.get('length_mm')
        width = data.get('overall_width_mm')
        depth = data.get('overall_depth_mm')

        if length and width and depth and not data.get('cubic_weight'):
            try:
                l = float(str(length).replace('mm', '').strip())
                w = float(str(width).replace('mm', '').strip())
                h = float(str(depth).replace('mm', '').strip())

                # Add 100mm for pallet/packaging height, divide by 5,000,000 (mm³ to cubic kg)
                cubic_weight = (l * w * (h + 100)) / 5000000
                data['cubic_weight'] = str(round(cubic_weight, 2))
                logger.debug(f"⚖️ Calculated cubic_weight: {cubic_weight:.2f}kg from {l}x{w}x{h}mm")
            except (ValueError, TypeError):
                pass

        # Check for overflow in title
        title_upper = title.upper() if title else ''
        if 'OVERFLOW' in title_upper:
            data['has_overflow'] = 'TRUE'
        elif not data.get('has_overflow'):
            data['has_overflow'] = 'FALSE'

        return data

    def _sync_brand_vendor(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Ensure brand_name and vendor are synchronized"""
        brand = data.get('brand_name', '').strip()
        vendor = data.get('vendor', '').strip()

        if brand and not vendor:
            data['vendor'] = brand
            logger.debug(f"🔄 Synced vendor from brand_name: {brand}")
        elif vendor and not brand:
            data['brand_name'] = vendor
            logger.debug(f"🔄 Synced brand_name from vendor: {vendor}")
        elif brand and vendor and brand != vendor:
            # Prefer brand_name (AI extracted) over vendor
            data['vendor'] = brand
            logger.debug(f"🔄 Synced vendor to match brand_name: {vendor} → {brand}")

        return data

    def _extract_bowls_number(self, data: Dict[str, Any], title: str) -> Dict[str, Any]:
        """Extract number of bowls from title if not already set"""
        if data.get('bowls_number'):
            return data

        title_upper = title.upper() if title else ''

        # Patterns to detect bowl numbers
        if any(kw in title_upper for kw in ['DOUBLE BOWL', 'DUAL BOWL', 'TWO BOWL', '2 BOWL', 'TWIN BOWL']):
            data['bowls_number'] = '2'
            logger.debug(f"🔢 Extracted bowls_number: 2 from title")
        elif any(kw in title_upper for kw in ['1.5 BOWL', '1½ BOWL', 'ONE AND A HALF']):
            data['bowls_number'] = '1.5'
            logger.debug(f"🔢 Extracted bowls_number: 1.5 from title")
        elif any(kw in title_upper for kw in ['SINGLE BOWL', 'ONE BOWL', '1 BOWL']):
            data['bowls_number'] = '1'
            logger.debug(f"🔢 Extracted bowls_number: 1 from title")
        elif any(kw in title_upper for kw in ['TRIPLE BOWL', 'THREE BOWL', '3 BOWL']):
            data['bowls_number'] = '3'
            logger.debug(f"🔢 Extracted bowls_number: 3 from title")

        return data


# Global instance
_data_cleaner = None


def get_data_cleaner(sheets_manager=None):
    """Get the global data cleaner instance"""
    global _data_cleaner

    if _data_cleaner is None:
        if sheets_manager is None:
            from core.sheets_manager import get_sheets_manager
            sheets_manager = get_sheets_manager()
        _data_cleaner = DataCleaner(sheets_manager)

    return _data_cleaner
