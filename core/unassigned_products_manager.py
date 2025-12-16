"""
Unassigned Products Manager
Handles Shopify backlog sheet used to triage uncategorized products.
"""
import logging
from typing import List, Dict, Optional

from config.settings import get_settings
from core.sheets_manager import get_sheets_manager

logger = logging.getLogger(__name__)


REQUIRED_HEADERS = [
    'url',
    'variant_sku',
    'id',
    'handle',
    'title',
    'vendor',
    'shopify_images',
    'Shopify Weight',
    'shopify_spec_sheet',
    'shopify_collections',
    'shopify_url',
    'body_html',
    'shopify_status',
    'shopify_price',
    'shopify_compare_price'
]


class UnassignedProductsManager:
    """Utility for reading and writing the unassigned Shopify backlog sheet."""

    def __init__(self):
        self.settings = get_settings()
        self.sheets_manager = get_sheets_manager()
        self._worksheet = None
        self._spreadsheet = None

    def _ensure_configured(self) -> bool:
        if not self.settings.UNASSIGNED_SPREADSHEET_ID:
            logger.warning("UNASSIGNED_SPREADSHEET_ID not configured")
            return False
        if not self.sheets_manager.gc:
            logger.error("Google Sheets client not available for unassigned manager")
            return False
        return True

    def _get_spreadsheet(self):
        if not self._ensure_configured():
            return None
        if self._spreadsheet:
            return self._spreadsheet
        try:
            self._spreadsheet = self.sheets_manager.gc.open_by_key(
                self.settings.UNASSIGNED_SPREADSHEET_ID
            )
            return self._spreadsheet
        except Exception as exc:
            logger.error(f"Failed to open unassigned spreadsheet: {exc}")
            return None

    def _get_worksheet(self):
        if not self._ensure_configured():
            return None
        if self._worksheet:
            return self._worksheet
        spreadsheet = self._get_spreadsheet()
        if not spreadsheet:
            return None
        try:
            self._worksheet = spreadsheet.worksheet(self.settings.UNASSIGNED_WORKSHEET_NAME)
            return self._worksheet
        except Exception:
            try:
                self._worksheet = spreadsheet.add_worksheet(
                    title=self.settings.UNASSIGNED_WORKSHEET_NAME,
                    rows="2000",
                    cols=str(len(REQUIRED_HEADERS) + 2)
                )
                self._worksheet.update('A1', [REQUIRED_HEADERS])
                return self._worksheet
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.error(f"Unable to open or create worksheet '{self.settings.UNASSIGNED_WORKSHEET_NAME}': {exc}")
                return None

    def get_all_products(self) -> List[Dict[str, str]]:
        """Return all rows as dictionaries keyed by header."""
        worksheet = self._get_worksheet()
        if not worksheet:
            return []
        try:
            return worksheet.get_all_records()
        except Exception as exc:
            logger.error(f"Failed to fetch unassigned products: {exc}")
            return []

    def replace_products(self, rows: List[List[str]]) -> bool:
        """Overwrite the worksheet with the provided rows."""
        worksheet = self._get_worksheet()
        if not worksheet:
            return False
        try:
            payload = [REQUIRED_HEADERS] + rows if rows else [REQUIRED_HEADERS]
            worksheet.clear()
            worksheet.update('A1', payload)
            logger.info(f"Wrote {len(rows)} unassigned rows")
            return True
        except Exception as exc:
            logger.error(f"Failed to write unassigned products: {exc}")
            return False

    def remove_skus(self, skus: List[str]) -> int:
        """Remove rows whose Variant SKU is in the provided list."""
        normalized = {str(sku).strip().lower() for sku in skus if sku}
        if not normalized:
            return 0
        worksheet = self._get_worksheet()
        if not worksheet:
            return 0
        try:
            all_values = worksheet.get_all_values()
            if not all_values:
                return 0
            header, *data_rows = all_values
            kept_rows = [header]
            removed = 0
            sku_index = header.index('variant_sku') if 'variant_sku' in header else 0
            for row in data_rows:
                row_sku = str(row[sku_index]).strip().lower() if len(row) > sku_index else ''
                if row_sku and row_sku in normalized:
                    removed += 1
                    continue
                kept_rows.append(row)
            worksheet.clear()
            worksheet.update('A1', kept_rows)
            return removed
        except Exception as exc:
            logger.error(f"Failed to remove SKUs from unassigned sheet: {exc}")
            return 0

    def get_products_by_skus(self, skus: List[str]) -> List[Dict[str, str]]:
        """Return dictionaries for the requested SKUs."""
        lookup = {str(sku).strip().lower() for sku in skus if sku}
        if not lookup:
            return []
        products = self.get_all_products()
        matched: List[Dict[str, str]] = []
        for product in products:
            sku = str(product.get('variant_sku') or '').strip().lower()
            if sku in lookup:
                matched.append(product)
        return matched


# Global helper
unassigned_products_manager = UnassignedProductsManager()


def get_unassigned_products_manager() -> UnassignedProductsManager:
    return unassigned_products_manager
