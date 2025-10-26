"""
WELS Data Lookup Module
Looks up WELS ratings, flow rates, and registration numbers from the reference Google Sheet
Each worksheet/tab represents a different brand
"""
import logging
import json
import os
from typing import Dict, Optional
import gspread
from google.oauth2.service_account import Credentials

logger = logging.getLogger(__name__)

class WELSLookup:
    """Lookup WELS data from reference Google Sheet"""

    WELS_SPREADSHEET_ID = "19OZSFFzSOzcy-5NYIYqy3rFWWrceDitR6uSVqY23FGY"

    def __init__(self):
        """Initialize Google Sheets connection"""
        self.gc = None
        self.spreadsheet = None
        self._connect()

    def _connect(self):
        """Connect to Google Sheets"""
        try:
            # Get credentials from environment variable (same as sheets_manager)
            google_creds_json = os.environ.get('GOOGLE_CREDENTIALS_JSON', '')

            if not google_creds_json:
                logger.error("❌ GOOGLE_CREDENTIALS_JSON environment variable not set")
                return

            # Parse credentials (can be JSON string or file path)
            if google_creds_json.startswith('{'):
                creds_dict = json.loads(google_creds_json)
            else:
                with open(google_creds_json, 'r') as f:
                    creds_dict = json.load(f)

            creds = Credentials.from_service_account_info(
                creds_dict,
                scopes=['https://www.googleapis.com/auth/spreadsheets']
            )
            self.gc = gspread.authorize(creds)
            self.spreadsheet = self.gc.open_by_key(self.WELS_SPREADSHEET_ID)
            logger.info(f"✅ Connected to WELS reference sheet")
        except Exception as e:
            logger.error(f"❌ Failed to connect to WELS sheet: {e}")

    def lookup_by_sku(self, sku: str, brand: str = None) -> Optional[Dict]:
        """
        Look up WELS data by SKU

        Args:
            sku: Product SKU to search for
            brand: Brand name (worksheet name). If None, searches all worksheets

        Returns:
            Dictionary with WELS data or None if not found
            {
                'sku': str,
                'wels_rating': str,
                'flow_rate': str,
                'wels_registration_number': str,
                'brand': str,
                'found_in_sheet': str
            }
        """
        if not self.spreadsheet:
            logger.warning("⚠️ Not connected to WELS sheet")
            return None

        sku = str(sku).strip().upper()

        # If brand provided, search only that worksheet
        if brand:
            return self._search_worksheet(brand, sku)

        # Otherwise search all worksheets
        worksheets = self.spreadsheet.worksheets()
        for worksheet in worksheets:
            result = self._search_worksheet(worksheet.title, sku)
            if result:
                return result

        logger.info(f"⚠️ SKU '{sku}' not found in WELS reference sheet")
        return None

    def _search_worksheet(self, worksheet_name: str, sku: str) -> Optional[Dict]:
        """
        Search a specific worksheet for SKU

        Args:
            worksheet_name: Name of worksheet (brand name)
            sku: SKU to search for

        Returns:
            Dictionary with WELS data or None
        """
        try:
            # Case-insensitive worksheet lookup
            # Find worksheet by matching case-insensitively
            actual_worksheet_name = None
            for ws in self.spreadsheet.worksheets():
                if ws.title.lower() == worksheet_name.lower():
                    actual_worksheet_name = ws.title
                    break

            if not actual_worksheet_name:
                logger.warning(f"⚠️ Worksheet '{worksheet_name}' not found (case-insensitive search)")
                return None

            worksheet = self.spreadsheet.worksheet(actual_worksheet_name)

            # Get all data
            data = worksheet.get_all_records()

            # Search for SKU (check common column names)
            for row in data:
                # Try different possible SKU column names
                # WELS sheet uses 'Model code' and 'Variant model code'
                row_sku = None
                for key in ['Model code', 'Variant model code', 'SKU', 'sku', 'Sku', 'Product Code', 'Code', 'Model']:
                    if key in row and row[key]:
                        row_sku = str(row[key]).strip().upper()
                        break

                if row_sku == sku:
                    # Found it! Extract WELS data
                    result = {
                        'sku': sku,
                        'wels_rating': self._extract_field(row, ['Star rating', 'WELS Rating', 'WELS', 'Rating', 'Star Rating', 'Stars']),
                        'flow_rate': self._extract_field(row, ['Water consumption (Litres)', 'Water consump. (L/min)', 'Flow Rate', 'Flow', 'L/min', 'Flow (L/min)', 'Litres/min', 'L/Min']),
                        'wels_registration_number': self._extract_field(row, ['Registration number', 'Reg. number', 'WELS Registration', 'Registration Number', 'Reg Number', 'WELS Reg', 'Reg']),
                        'brand': worksheet_name,
                        'found_in_sheet': worksheet_name
                    }

                    # Parse pressure range from "Tested pressure" field
                    # Format: "150 kPa, 250 kPa, 350 kPa" -> min=150, max=350
                    tested_pressure = self._extract_field(row, ['Tested pressure', 'Pressure', 'Test pressure'])
                    if tested_pressure:
                        min_pressure, max_pressure = self._parse_pressure_range(tested_pressure)
                        if min_pressure:
                            result['min_pressure_kpa'] = min_pressure
                        if max_pressure:
                            result['max_pressure_kpa'] = max_pressure

                    logger.info(f"✅ Found WELS data for SKU '{sku}' in '{worksheet_name}' sheet")
                    logger.info(f"   WELS: {result['wels_rating']}, Flow: {result['flow_rate']}, Reg: {result['wels_registration_number']}")
                    if 'min_pressure_kpa' in result:
                        logger.info(f"   Pressure: {result.get('min_pressure_kpa')}-{result.get('max_pressure_kpa')} kPa")

                    return result

            return None

        except gspread.exceptions.WorksheetNotFound:
            logger.warning(f"⚠️ Worksheet '{worksheet_name}' not found")
            return None
        except Exception as e:
            logger.error(f"❌ Error searching worksheet '{worksheet_name}': {e}")
            return None

    def _extract_field(self, row: Dict, possible_keys: list) -> str:
        """
        Extract field from row using multiple possible column names

        Args:
            row: Data row dictionary
            possible_keys: List of possible column names to try

        Returns:
            Field value as string or empty string
        """
        for key in possible_keys:
            if key in row and row[key]:
                value = str(row[key]).strip()
                if value and value.lower() not in ['', 'n/a', 'na', 'none', '-']:
                    return value
        return ''

    def _parse_pressure_range(self, pressure_str: str) -> tuple:
        """
        Parse pressure range from WELS tested pressure field

        Args:
            pressure_str: String like "150 kPa, 250 kPa, 350 kPa"

        Returns:
            Tuple of (min_pressure, max_pressure) as strings, or (None, None)
        """
        import re

        try:
            # Extract all numbers from the pressure string
            numbers = re.findall(r'\d+', pressure_str)
            if numbers:
                # Convert to integers and find min/max
                pressures = [int(n) for n in numbers]
                min_pressure = str(min(pressures))
                max_pressure = str(max(pressures))
                return (min_pressure, max_pressure)
        except Exception as e:
            logger.warning(f"⚠️ Could not parse pressure range from '{pressure_str}': {e}")

        return (None, None)

    def get_brand_worksheets(self) -> list:
        """
        Get list of all brand worksheets in the WELS reference sheet

        Returns:
            List of worksheet names (brands)
        """
        if not self.spreadsheet:
            return []

        try:
            worksheets = self.spreadsheet.worksheets()
            return [ws.title for ws in worksheets]
        except Exception as e:
            logger.error(f"❌ Error getting worksheets: {e}")
            return []


# Global instance
_wels_lookup = None

def get_wels_lookup() -> WELSLookup:
    """Get global WELS lookup instance"""
    global _wels_lookup
    if _wels_lookup is None:
        _wels_lookup = WELSLookup()
    return _wels_lookup
