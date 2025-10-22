/**
 * Google Apps Script: Direct Sync Google Sheets → Firestore
 *
 * This script automatically syncs changes from Google Sheets directly to Firestore
 * whenever a cell is edited - NO Flask API needed!
 *
 * Setup Instructions:
 * 1. Open your Google Sheet
 * 2. Extensions → Apps Script
 * 3. Delete any existing code and paste this entire file
 * 4. Update the CONFIG section below with your Firestore credentials
 * 5. Save and authorize the script
 * 6. Edit a cell in your sheet - it syncs directly to Firestore!
 */

// ============================================================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================================================

const CONFIG = {
  // Your Firestore project ID
  FIREBASE_PROJECT_ID: 'your-project-id',  // Get from Firebase Console

  // Your Firebase service account email
  FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com',

  // Your Firebase private key (from service account JSON)
  // IMPORTANT: Keep this secret! Don't share your sheet publicly with this in it.
  FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n',

  // Collection name in Firestore (e.g., 'sinks', 'taps', 'lighting')
  FIRESTORE_COLLECTION: 'sinks',

  // Column mapping - which columns contain which fields
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
    'AI': 'bowl_length_mm',
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
    'AT': 'second_bowl_length_mm',
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

  // Sync directly to Firestore
  syncRowToFirestore(row, fieldName, newValue);
}

// ============================================================================
// FIRESTORE FUNCTIONS
// ============================================================================

/**
 * Get OAuth2 access token for Firestore API
 */
function getFirestoreAccessToken() {
  const service = OAuth2.createService('firestore')
    .setTokenUrl('https://oauth2.googleapis.com/token')
    .setPrivateKey(CONFIG.FIREBASE_PRIVATE_KEY)
    .setIssuer(CONFIG.FIREBASE_CLIENT_EMAIL)
    .setPropertyStore(PropertiesService.getScriptProperties())
    .setScope('https://www.googleapis.com/auth/datastore');

  if (!service.hasAccess()) {
    Logger.log('No access, resetting service');
    service.reset();
  }

  return service.getAccessToken();
}

/**
 * Sync a single field update to Firestore
 */
function syncRowToFirestore(rowNum, fieldName, newValue) {
  try {
    const accessToken = getFirestoreAccessToken();
    const projectId = CONFIG.FIREBASE_PROJECT_ID;
    const collection = CONFIG.FIRESTORE_COLLECTION;

    // Firestore document path: projects/{project}/databases/(default)/documents/{collection}/{docId}
    const docId = String(rowNum);
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${docId}`;

    // Prepare update data - only update the changed field
    const updateMask = `updateMask.fieldPaths=${fieldName}`;

    // Build Firestore document format
    const documentData = {
      fields: {}
    };
    documentData.fields[fieldName] = convertToFirestoreValue(newValue);

    const options = {
      method: 'patch',
      contentType: 'application/json',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      payload: JSON.stringify(documentData),
      muteHttpExceptions: true
    };

    Logger.log(`Syncing row ${rowNum}, field ${fieldName} to Firestore...`);

    const response = UrlFetchApp.fetch(`${firestoreUrl}?${updateMask}`, options);
    const responseCode = response.getResponseCode();

    if (responseCode === 200) {
      Logger.log(`✅ Successfully synced row ${rowNum} to Firestore`);

      SpreadsheetApp.getActiveSpreadsheet().toast(
        `Row ${rowNum} synced to Firestore`,
        '✅ Sync Success',
        2
      );
    } else {
      const errorText = response.getContentText();
      Logger.log(`❌ Failed to sync. Status: ${responseCode}, Response: ${errorText}`);

      SpreadsheetApp.getActiveSpreadsheet().toast(
        `Sync failed for row ${rowNum}`,
        '❌ Sync Error',
        3
      );
    }

  } catch (error) {
    Logger.log(`❌ Error syncing row ${rowNum}: ${error.message}`);
    Logger.log(error.stack);

    SpreadsheetApp.getActiveSpreadsheet().toast(
      `Error: ${error.message}`,
      '❌ Sync Error',
      3
    );
  }
}

/**
 * Sync entire row to Firestore
 */
function syncEntireRowToFirestore(rowNum) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const rowData = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];

    // Build complete document data
    const documentData = {
      fields: {}
    };

    for (const [columnLetter, fieldName] of Object.entries(CONFIG.COLUMN_MAPPING)) {
      const columnIndex = letterToColumn(columnLetter) - 1;
      const value = rowData[columnIndex] || '';
      documentData.fields[fieldName] = convertToFirestoreValue(value);
    }

    const accessToken = getFirestoreAccessToken();
    const projectId = CONFIG.FIREBASE_PROJECT_ID;
    const collection = CONFIG.FIRESTORE_COLLECTION;
    const docId = String(rowNum);
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${docId}`;

    const options = {
      method: 'patch',
      contentType: 'application/json',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      payload: JSON.stringify(documentData),
      muteHttpExceptions: true
    };

    Logger.log(`Syncing entire row ${rowNum} to Firestore...`);

    const response = UrlFetchApp.fetch(firestoreUrl, options);
    const responseCode = response.getResponseCode();

    if (responseCode === 200) {
      Logger.log(`✅ Successfully synced entire row ${rowNum}`);
      return true;
    } else {
      Logger.log(`❌ Failed to sync row ${rowNum}: ${response.getContentText()}`);
      return false;
    }

  } catch (error) {
    Logger.log(`❌ Error syncing row ${rowNum}: ${error.message}`);
    return false;
  }
}

/**
 * Sync all rows to Firestore
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
    if (syncEntireRowToFirestore(row)) {
      successCount++;
    } else {
      errorCount++;
    }

    // Progress update every 10 rows
    if (row % 10 === 0) {
      Logger.log(`Progress: ${row}/${lastRow} rows processed...`);
      Utilities.sleep(500); // Avoid rate limits
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
 * Convert JavaScript value to Firestore value format
 */
function convertToFirestoreValue(value) {
  if (value === null || value === undefined || value === '') {
    return { stringValue: '' };
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }

  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }

  // Default to string
  return { stringValue: String(value) };
}

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
 * Test Firestore connection
 * Run this from: Extensions → Apps Script → Run → testFirestoreConnection
 */
function testFirestoreConnection() {
  try {
    Logger.log('Testing Firestore connection...');

    const accessToken = getFirestoreAccessToken();
    Logger.log('✅ Successfully got OAuth token');

    // Try to read a document
    const projectId = CONFIG.FIREBASE_PROJECT_ID;
    const collection = CONFIG.FIRESTORE_COLLECTION;
    const testDocId = '2'; // Row 2
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${testDocId}`;

    const options = {
      method: 'get',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(firestoreUrl, options);
    const responseCode = response.getResponseCode();

    if (responseCode === 200) {
      Logger.log('✅ Firestore connection successful!');
      const data = JSON.parse(response.getContentText());
      Logger.log(`Sample document: ${JSON.stringify(data, null, 2)}`);

      SpreadsheetApp.getActiveSpreadsheet().toast(
        'Firestore connection successful!',
        '✅ Connection Test',
        3
      );
    } else {
      Logger.log(`❌ Connection failed. Status: ${responseCode}`);
      Logger.log(`Response: ${response.getContentText()}`);

      SpreadsheetApp.getActiveSpreadsheet().toast(
        `Connection failed: ${responseCode}`,
        '❌ Connection Error',
        5
      );
    }

  } catch (error) {
    Logger.log(`❌ Connection error: ${error.message}`);
    Logger.log(error.stack);

    SpreadsheetApp.getActiveSpreadsheet().toast(
      `Error: ${error.message}`,
      '❌ Connection Error',
      5
    );
  }
}

// ============================================================================
// OAUTH2 LIBRARY (Required for Firestore authentication)
// ============================================================================
// You need to add the OAuth2 library to your project:
// 1. In Apps Script, click "Libraries" (+ icon in left sidebar)
// 2. Search for: 1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF
// 3. Click "Add" and select the latest version
// 4. Click "Save"
