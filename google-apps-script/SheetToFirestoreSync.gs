/**
 * Google Apps Script: Auto-sync Google Sheets → Firestore
 *
 * This script automatically pushes changes from Google Sheets to Firestore
 * whenever a cell is edited in the sheet.
 *
 * Setup Instructions:
 * 1. Open your Google Sheet
 * 2. Extensions → Apps Script
 * 3. Delete any existing code and paste this entire file
 * 4. Update the CONFIG section below with your details
 * 5. Save and authorize the script
 * 6. Edit a cell in your sheet - it should auto-sync to Firestore!
 */

// ============================================================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================================================

const CONFIG = {
  // Your Flask API endpoint
  API_BASE_URL: 'http://127.0.0.1:8000',

  // Collection name (e.g., 'sinks', 'taps', 'lighting')
  COLLECTION_NAME: 'sinks',

  // Optional: API key for authentication (if you add auth to your Flask API)
  API_KEY: '',

  // Debounce time in milliseconds (prevents too many API calls)
  DEBOUNCE_MS: 2000,

  // Column mapping - which columns contain which fields
  // This should match your config/collections.py column_mapping
  COLUMN_MAPPING: {
    'A': 'row_number',
    'B': 'variant_sku',
    'C': 'title',
    'D': 'collection',
    'E': 'vendor',
    'F': 'product_category',
    'G': 'tags',
    'H': 'variant_inventory_qty',
    'I': 'variant_price',
    'J': 'variant_compare_at_price',
    'K': 'image_src',
    'L': 'image_position',
    'M': 'image_alt_text',
    'N': 'variant_weight_unit',
    'O': 'variant_grams',
    'P': 'seo_title',
    'Q': 'seo_description',
    'R': 'google_shopping_category',
    'S': 'variant_barcode',
    'T': 'short_description',
    'U': 'body_html',
    'V': 'google_product_category',
    'W': 'custom_product_type',
    'X': 'status',
    'Y': 'manufacturer',
    'Z': 'model_number',
    'AA': 'warranty',
    'AB': 'material',
    'AC': 'finish',
    'AD': 'style',
    'AE': 'installation_type',
    'AF': 'number_of_bowls',
    'AG': 'bowl_shape',
    'AH': 'bowl_depth_mm',
    'AI': 'bowl_length_mm',  // Renamed from bowl_height_mm
    'AJ': 'bowl_width_mm',
    'AK': 'overall_length_mm',
    'AL': 'overall_width_mm',
    'AM': 'overall_height_mm',
    'AN': 'tap_hole_size_mm',
    'AO': 'number_of_tap_holes',
    'AP': 'drainer_included',
    'AQ': 'waste_included',
    'AR': 'overflow',
    'AS': 'second_bowl_depth_mm',
    'AT': 'second_bowl_length_mm',  // Renamed from second_bowl_height_mm
    'AU': 'second_bowl_width_mm',
    'AV': 'country_of_origin',
    'AW': 'url',
    'AX': 'shopify_status'
  }
};

// ============================================================================
// MAIN TRIGGER FUNCTION - Runs when a cell is edited
// ============================================================================

/**
 * Automatically triggered when a user edits a cell in the sheet
 */
function onEdit(e) {
  // Get edited range info
  const sheet = e.source.getActiveSheet();
  const range = e.range;
  const row = range.getRow();
  const column = range.getColumn();

  // Skip header row
  if (row === 1) {
    Logger.log('Header row edited - skipping sync');
    return;
  }

  // Get column letter (A, B, C, etc.)
  const columnLetter = columnToLetter(column);
  const fieldName = CONFIG.COLUMN_MAPPING[columnLetter];

  if (!fieldName) {
    Logger.log(`Column ${columnLetter} not in mapping - skipping`);
    return;
  }

  // Get the new value
  const newValue = e.value || '';

  Logger.log(`Cell edited: Row ${row}, Column ${columnLetter} (${fieldName}), New value: ${newValue}`);

  // Sync to Firestore with debouncing
  syncRowToFirestore(row, fieldName, newValue);
}

// ============================================================================
// SYNC FUNCTIONS
// ============================================================================

/**
 * Sync a single row to Firestore
 */
function syncRowToFirestore(rowNum, changedField, newValue) {
  try {
    // Get all data for this row
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const rowData = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];

    // Build update payload with only the changed field
    const updateData = {};
    updateData[changedField] = newValue;

    // Make API call to Flask
    const url = `${CONFIG.API_BASE_URL}/api/${CONFIG.COLLECTION_NAME}/products/${rowNum}/batch`;

    const options = {
      'method': 'put',
      'contentType': 'application/json',
      'payload': JSON.stringify(updateData),
      'muteHttpExceptions': true
    };

    // Add API key header if configured
    if (CONFIG.API_KEY) {
      options['headers'] = {
        'X-API-Key': CONFIG.API_KEY
      };
    }

    Logger.log(`Syncing row ${rowNum} to Firestore...`);
    Logger.log(`URL: ${url}`);
    Logger.log(`Payload: ${JSON.stringify(updateData)}`);

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode === 200) {
      Logger.log(`✅ Successfully synced row ${rowNum} to Firestore`);

      // Optional: Show toast notification
      SpreadsheetApp.getActiveSpreadsheet().toast(
        `Row ${rowNum} synced to Firestore`,
        '✅ Sync Success',
        3
      );
    } else {
      Logger.log(`❌ Failed to sync row ${rowNum}. Status: ${responseCode}, Response: ${responseText}`);

      SpreadsheetApp.getActiveSpreadsheet().toast(
        `Failed to sync row ${rowNum}. Check logs.`,
        '❌ Sync Failed',
        5
      );
    }

  } catch (error) {
    Logger.log(`❌ Error syncing row ${rowNum}: ${error.message}`);

    SpreadshsetApp.getActiveSpreadsheet().toast(
      `Error: ${error.message}`,
      '❌ Sync Error',
      5
    );
  }
}

/**
 * Manually sync entire sheet to Firestore
 * Run this from: Extensions → Apps Script → Run → syncAllRowsToFirestore
 */
function syncAllRowsToFirestore() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  Logger.log(`Starting full sync of ${lastRow - 1} rows...`);

  let successCount = 0;
  let errorCount = 0;

  // Start from row 2 (skip header)
  for (let row = 2; row <= lastRow; row++) {
    try {
      // Get all values for this row
      const rowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];

      // Build full product data object
      const productData = {};
      for (const [columnLetter, fieldName] of Object.entries(CONFIG.COLUMN_MAPPING)) {
        const columnIndex = letterToColumn(columnLetter) - 1;
        productData[fieldName] = rowData[columnIndex] || '';
      }

      // Sync to Firestore
      const url = `${CONFIG.API_BASE_URL}/api/${CONFIG.COLLECTION_NAME}/products/${row}/batch`;

      const options = {
        'method': 'put',
        'contentType': 'application/json',
        'payload': JSON.stringify(productData),
        'muteHttpExceptions': true
      };

      const response = UrlFetchApp.fetch(url, options);

      if (response.getResponseCode() === 200) {
        successCount++;
        Logger.log(`✅ Row ${row} synced`);
      } else {
        errorCount++;
        Logger.log(`❌ Row ${row} failed: ${response.getContentText()}`);
      }

      // Avoid rate limits - pause every 10 rows
      if (row % 10 === 0) {
        Utilities.sleep(1000);
        Logger.log(`Progress: ${row}/${lastRow} rows processed...`);
      }

    } catch (error) {
      errorCount++;
      Logger.log(`❌ Error on row ${row}: ${error.message}`);
    }
  }

  Logger.log(`\n✅ Full sync complete!`);
  Logger.log(`Success: ${successCount}, Errors: ${errorCount}`);

  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Synced ${successCount} rows. ${errorCount} errors.`,
    '✅ Full Sync Complete',
    5
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert column number to letter (1 → A, 27 → AA)
 */
function columnToLetter(column) {
  let temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

/**
 * Convert column letter to number (A → 1, AA → 27)
 */
function letterToColumn(letter) {
  let column = 0, length = letter.length;
  for (let i = 0; i < length; i++) {
    column += (letter.charCodeAt(i) - 64) * Math.pow(26, length - i - 1);
  }
  return column;
}

/**
 * Test function to verify API connectivity
 * Run this from: Extensions → Apps Script → Run → testApiConnection
 */
function testApiConnection() {
  try {
    const url = `${CONFIG.API_BASE_URL}/api/${CONFIG.COLLECTION_NAME}/products/2`;
    Logger.log(`Testing connection to: ${url}`);

    const response = UrlFetchApp.fetch(url, { 'muteHttpExceptions': true });
    const responseCode = response.getResponseCode();

    if (responseCode === 200) {
      Logger.log('✅ API connection successful!');
      const data = JSON.parse(response.getContentText());
      Logger.log(`Sample product: ${JSON.stringify(data.product, null, 2)}`);

      SpreadsheetApp.getActiveSpreadsheet().toast(
        'API connection successful!',
        '✅ Connection Test',
        3
      );
    } else {
      Logger.log(`❌ API returned status: ${responseCode}`);
      Logger.log(`Response: ${response.getContentText()}`);

      SpreadsheetApp.getActiveSpreadsheet().toast(
        `API returned status: ${responseCode}`,
        '❌ Connection Failed',
        5
      );
    }
  } catch (error) {
    Logger.log(`❌ Connection error: ${error.message}`);

    SpreadsheetApp.getActiveSpreadsheet().toast(
      `Error: ${error.message}`,
      '❌ Connection Error',
      5
    );
  }
}
