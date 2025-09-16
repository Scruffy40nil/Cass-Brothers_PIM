"""
Pricing Manager for fetching competitor pricing data from Google Sheets
"""
import gspread
from google.oauth2.service_account import Credentials
import json
import os
import logging
from typing import Dict, Optional, List, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class PricingData:
    """Data class for pricing information"""
    variant_sku: str
    our_price: float
    lowest_competitor_price: float
    lowest_competitor_name: str
    price_difference: float
    competitor_prices: Dict[str, float]

class PricingManager:
    """Manager for fetching and processing competitor pricing data"""

    def __init__(self):
        self.pricing_sheet_id = '1Kky3LE5qBgyeA7G-7g2pvfjDjoeRfRg1NQL7XiF8ToU'
        self.gc = None
        self.worksheet = None
        self._initialize_connection()

    def _initialize_connection(self):
        """Initialize Google Sheets connection"""
        try:
            # Get credentials from environment
            creds_json = os.getenv('GOOGLE_CREDENTIALS_JSON')
            if not creds_json:
                logger.error("No Google credentials found")
                return

            # Parse credentials
            creds_data = json.loads(creds_json)

            # Set up authentication
            scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
            credentials = Credentials.from_service_account_info(creds_data, scopes=scope)
            self.gc = gspread.authorize(credentials)

            # Open the pricing spreadsheet
            pricing_sheet = self.gc.open_by_key(self.pricing_sheet_id)
            self.worksheet = pricing_sheet.get_worksheet(0)

            logger.info(f"✅ Connected to pricing sheet: {pricing_sheet.title}")

        except Exception as e:
            logger.error(f"Error initializing pricing sheet connection: {e}")

    def get_pricing_data(self, variant_sku: str) -> Optional[PricingData]:
        """
        Get pricing data for a specific variant SKU

        Args:
            variant_sku: The SKU to look up pricing for

        Returns:
            PricingData object or None if not found
        """
        if not self.worksheet:
            logger.error("No worksheet connection available")
            return None

        try:
            # Get all data to search through
            all_values = self.worksheet.get_all_values()

            if not all_values:
                logger.warning("No data found in pricing sheet")
                return None

            headers = all_values[0]

            # Find the row with matching SKU
            matching_row = None
            for row in all_values[1:]:  # Skip header row
                if len(row) > 5 and row[5].strip().upper() == variant_sku.upper():  # Column F (index 5)
                    matching_row = row
                    break

            if not matching_row:
                logger.warning(f"SKU {variant_sku} not found in pricing sheet")
                return None

            # Extract pricing information
            our_price_str = matching_row[9] if len(matching_row) > 9 else "0"  # Column J (index 9)
            lowest_price_str = matching_row[11] if len(matching_row) > 11 else "0"  # Column L (index 11)

            # Clean and convert prices
            our_price = self._parse_price(our_price_str)
            lowest_competitor_price = self._parse_price(lowest_price_str)

            # Calculate price difference
            price_difference = our_price - lowest_competitor_price

            # Extract competitor prices (columns R onwards - index 17+)
            competitor_prices = {}
            competitor_start_index = 17  # Column R

            for i in range(competitor_start_index, len(headers)):
                if i < len(matching_row):
                    competitor_name = headers[i]
                    price_str = matching_row[i]
                    price = self._parse_price(price_str)
                    if price > 0:
                        competitor_prices[competitor_name] = price

            # Find which competitor has the lowest price
            lowest_competitor_name = self._find_lowest_competitor(competitor_prices, lowest_competitor_price)

            return PricingData(
                variant_sku=variant_sku,
                our_price=our_price,
                lowest_competitor_price=lowest_competitor_price,
                lowest_competitor_name=lowest_competitor_name,
                price_difference=price_difference,
                competitor_prices=competitor_prices
            )

        except Exception as e:
            logger.error(f"Error fetching pricing data for SKU {variant_sku}: {e}")
            return None

    def _parse_price(self, price_str: str) -> float:
        """Parse price string to float"""
        if not price_str:
            return 0.0

        try:
            # Remove currency symbols, commas, and whitespace
            cleaned = price_str.replace('$', '').replace(',', '').strip()
            if not cleaned or cleaned.lower() in ['n/a', 'na', '-', '']:
                return 0.0
            return float(cleaned)
        except (ValueError, TypeError):
            return 0.0

    def _find_lowest_competitor(self, competitor_prices: Dict[str, float], target_price: float) -> str:
        """Find which competitor has the lowest price"""
        if not competitor_prices:
            return "Unknown"

        # Find competitor with price closest to target_price
        closest_competitor = None
        closest_diff = float('inf')

        for name, price in competitor_prices.items():
            if price > 0:  # Only consider valid prices
                diff = abs(price - target_price)
                if diff < closest_diff:
                    closest_diff = diff
                    closest_competitor = name

        return closest_competitor or "Unknown"

    def refresh_connection(self):
        """Refresh the Google Sheets connection"""
        self._initialize_connection()

# Global instance
_pricing_manager = None

def get_pricing_manager() -> PricingManager:
    """Get the global pricing manager instance"""
    global _pricing_manager
    if _pricing_manager is None:
        _pricing_manager = PricingManager()
    return _pricing_manager