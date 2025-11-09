/**
 * FETCH SHOPIFY SPEC SHEETS
 *
 * Fetches spec sheet URLs (metafield: custom.spec_sheet) from Shopify products
 * and populates column AG (shopify_spec_sheet) in the Google Sheet.
 *
 * Uses the ID column (D) to identify products in Shopify.
 *
 * Setup Instructions:
 * 1. Go to Extensions > Apps Script
 * 2. Create a new script file and paste this code
 * 3. Update SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN below
 * 4. Run setupMenu() to add menu items
 * 5. Use "Shopify Tools > Fetch Spec Sheets" from the menu
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const SHOPIFY_STORE = 'your-store.myshopify.com';  // UPDATE THIS
const SHOPIFY_ACCESS_TOKEN = 'YOUR_SHOPIFY_ACCESS_TOKEN';  // UPDATE THIS

// Column configuration
const COLUMNS = {
  ID: 4,                    // Column D - Shopify Product ID
  SPEC_SHEET: 36,           // Column AJ - Spec Sheet URL (destination) (was AG before adding pan dimensions)
};

// Metafield configuration
const METAFIELD_NAMESPACE = 'global';
const METAFIELD_KEY = 'specification_sheet';

// Processing configuration
const BATCH_SIZE = 50;              // Process 50 products at a time
const RATE_LIMIT_DELAY_MS = 500;    // Delay between Shopify API calls (2 calls/sec)
const DEBUG_LOGGING = true;         // Set to false to reduce logs

// ============================================================================
// MENU SETUP
// ============================================================================

/**
 * Add custom menu to Google Sheets
 */
function setupMenu() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Shopify Tools')
    .addItem('✨ Fetch Spec Sheets (All)', 'fetchAllSpecSheets')
    .addItem('🔧 Fetch Spec Sheets (Range)', 'fetchSpecSheetsRange')
    .addItem('🔄 Force Update (Range)', 'forceUpdateSpecSheetsRange')
    .addItem('🔍 Test Single Product', 'testSingleProduct')
    .addSeparator()
    .addItem('ℹ️ Help', 'showHelp')
    .addToUi();
}

/**
 * Show help dialog
 */
function showHelp() {
  const ui = SpreadsheetApp.getUi();
  const helpText = `
📋 Shopify Spec Sheet Fetcher

This script fetches spec sheet URLs from Shopify product metafields
and populates column AG (shopify_spec_sheet) in your Google Sheet.

🔧 Setup:
1. Update SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN at the top of the script
2. The spec sheet must be stored in metafield: custom.spec_sheet
3. Products are identified by the ID in column D

📊 Usage:
• Fetch Spec Sheets (All): Process all products in the sheet
• Fetch Spec Sheets (Range): Process a specific range of rows
• Test Single Product: Test a single row to verify setup

⚡ Performance:
• Processes ${BATCH_SIZE} products at a time
• Rate limited to avoid Shopify API limits
• Shows progress updates during processing

❓ Need Help?
Contact your developer if you encounter issues.
  `.trim();

  ui.alert('Shopify Spec Sheet Fetcher', helpText, ui.ButtonSet.OK);
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Fetch spec sheets for all products in the sheet
 */
function fetchAllSpecSheets() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    ui.alert('⚠️ No Data', 'No products found in the sheet.', ui.ButtonSet.OK);
    return;
  }

  const response = ui.alert(
    '✨ Fetch All Spec Sheets',
    `This will fetch spec sheet URLs from Shopify for all ${lastRow - 1} products.\n\n` +
    `This may take several minutes depending on the number of products.\n\n` +
    `Continue?`,
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  Logger.log('========================================');
  Logger.log('FETCH ALL SPEC SHEETS - STARTED');
  Logger.log('========================================');

  const startTime = new Date();
  const result = fetchSpecSheetsForRange(sheet, 2, lastRow);
  const endTime = new Date();
  const duration = ((endTime - startTime) / 1000).toFixed(1);

  Logger.log('========================================');
  Logger.log(`COMPLETED in ${duration}s`);
  Logger.log(`✅ Updated: ${result.updated}`);
  Logger.log(`⏭️ Skipped: ${result.skipped}`);
  Logger.log(`❌ Errors: ${result.errors}`);
  Logger.log('========================================');

  ui.alert(
    '✅ Complete',
    `Fetched spec sheets in ${duration}s\n\n` +
    `✅ Updated: ${result.updated}\n` +
    `⏭️ Skipped: ${result.skipped}\n` +
    `❌ Errors: ${result.errors}`,
    ui.ButtonSet.OK
  );
}

/**
 * Fetch spec sheets for a specific range of rows
 */
function fetchSpecSheetsRange() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    ui.alert('⚠️ No Data', 'No products found in the sheet.', ui.ButtonSet.OK);
    return;
  }

  const response = ui.prompt(
    '🔧 Fetch Spec Sheets (Range)',
    `Enter row range (e.g., "2-50" or "10-20"):\n\n` +
    `Sheet has ${lastRow - 1} products (rows 2-${lastRow})`,
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const input = response.getResponseText().trim();
  const match = input.match(/^(\d+)-(\d+)$/);

  if (!match) {
    ui.alert('❌ Invalid Format', 'Please use format: 2-50', ui.ButtonSet.OK);
    return;
  }

  const startRow = parseInt(match[1]);
  const endRow = parseInt(match[2]);

  // Validate range
  if (startRow < 2 || endRow < startRow || endRow > lastRow) {
    ui.alert(
      '❌ Invalid Range',
      `Range must be between 2 and ${lastRow}, with start <= end`,
      ui.ButtonSet.OK
    );
    return;
  }

  Logger.log('========================================');
  Logger.log(`FETCH SPEC SHEETS (RANGE ${startRow}-${endRow}) - STARTED`);
  Logger.log('========================================');

  const startTime = new Date();
  const result = fetchSpecSheetsForRange(sheet, startRow, endRow);
  const endTime = new Date();
  const duration = ((endTime - startTime) / 1000).toFixed(1);

  Logger.log('========================================');
  Logger.log(`COMPLETED in ${duration}s`);
  Logger.log(`✅ Updated: ${result.updated}`);
  Logger.log(`⏭️ Skipped: ${result.skipped}`);
  Logger.log(`❌ Errors: ${result.errors}`);
  Logger.log('========================================');

  ui.alert(
    '✅ Complete',
    `Fetched spec sheets for rows ${startRow}-${endRow} in ${duration}s\n\n` +
    `✅ Updated: ${result.updated}\n` +
    `⏭️ Skipped: ${result.skipped}\n` +
    `❌ Errors: ${result.errors}`,
    ui.ButtonSet.OK
  );
}

/**
 * Force update spec sheets for a range (overwrites existing)
 */
function forceUpdateSpecSheetsRange() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    ui.alert('⚠️ No Data', 'No products found in the sheet.', ui.ButtonSet.OK);
    return;
  }

  const response = ui.prompt(
    '🔄 Force Update Spec Sheets',
    `⚠️ This will OVERWRITE existing spec sheets!\n\n` +
    `Enter row range (e.g., "2-50" or "10-20"):\n\n` +
    `Sheet has ${lastRow - 1} products (rows 2-${lastRow})`,
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const input = response.getResponseText().trim();
  const match = input.match(/^(\d+)-(\d+)$/);

  if (!match) {
    ui.alert('❌ Invalid Format', 'Please use format: 2-50', ui.ButtonSet.OK);
    return;
  }

  const startRow = parseInt(match[1]);
  const endRow = parseInt(match[2]);

  // Validate range
  if (startRow < 2 || endRow < startRow || endRow > lastRow) {
    ui.alert(
      '❌ Invalid Range',
      `Range must be between 2 and ${lastRow}, with start <= end`,
      ui.ButtonSet.OK
    );
    return;
  }

  Logger.log('========================================');
  Logger.log(`FORCE UPDATE SPEC SHEETS (RANGE ${startRow}-${endRow}) - STARTED`);
  Logger.log('========================================');

  const startTime = new Date();
  const result = fetchSpecSheetsForRange(sheet, startRow, endRow, true);  // Force overwrite
  const endTime = new Date();
  const duration = ((endTime - startTime) / 1000).toFixed(1);

  Logger.log('========================================');
  Logger.log(`COMPLETED in ${duration}s`);
  Logger.log(`✅ Updated: ${result.updated}`);
  Logger.log(`⏭️ Skipped: ${result.skipped}`);
  Logger.log(`❌ Errors: ${result.errors}`);
  Logger.log('========================================');

  ui.alert(
    '✅ Complete',
    `Force updated spec sheets for rows ${startRow}-${endRow} in ${duration}s\n\n` +
    `✅ Updated: ${result.updated}\n` +
    `⏭️ Skipped: ${result.skipped}\n` +
    `❌ Errors: ${result.errors}`,
    ui.ButtonSet.OK
  );
}

/**
 * Test fetching spec sheet for a single product
 */
function testSingleProduct() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    ui.alert('⚠️ No Data', 'No products found in the sheet.', ui.ButtonSet.OK);
    return;
  }

  const response = ui.prompt(
    '🔍 Test Single Product',
    `Enter row number to test (2-${lastRow}):`,
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const rowNum = parseInt(response.getResponseText().trim());

  if (isNaN(rowNum) || rowNum < 2 || rowNum > lastRow) {
    ui.alert('❌ Invalid Row', `Row must be between 2 and ${lastRow}`, ui.ButtonSet.OK);
    return;
  }

  Logger.log('========================================');
  Logger.log(`TEST SINGLE PRODUCT - Row ${rowNum}`);
  Logger.log('========================================');

  const rowData = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
  const productId = rowData[COLUMNS.ID - 1];
  const currentSpecSheet = rowData[COLUMNS.SPEC_SHEET - 1];

  Logger.log(`Product ID: ${productId}`);
  Logger.log(`Current Spec Sheet: ${currentSpecSheet || '(empty)'}`);

  if (!productId) {
    ui.alert('❌ No Product ID', `Row ${rowNum} has no product ID in column D`, ui.ButtonSet.OK);
    return;
  }

  try {
    // First, let's see ALL metafields for this product
    const allMetafields = getAllMetafieldsForProduct(productId);
    Logger.log(`Found ${allMetafields.length} metafields for product ${productId}`);

    let metafieldsList = 'All metafields found:\n\n';
    allMetafields.forEach((m, i) => {
      Logger.log(`  ${i + 1}. ${m.namespace}.${m.key} = ${m.value}`);
      metafieldsList += `${i + 1}. ${m.namespace}.${m.key}\n   Value: ${m.value}\n\n`;
    });

    const specSheetUrl = fetchSpecSheetFromShopify(productId);

    if (specSheetUrl) {
      Logger.log(`✅ Found spec sheet: ${specSheetUrl}`);
      ui.alert(
        '✅ Success',
        `Found spec sheet URL:\n\n${specSheetUrl}\n\n` +
        `Would you like to update row ${rowNum}?`,
        ui.ButtonSet.YES_NO
      ) === ui.Button.YES && sheet.getRange(rowNum, COLUMNS.SPEC_SHEET).setValue(specSheetUrl);
    } else {
      Logger.log('⚠️ No spec sheet found in metafield');
      ui.alert(
        '⚠️ Not Found',
        `No spec sheet metafield found for product ID: ${productId}\n\n` +
        `Looking for: ${METAFIELD_NAMESPACE}.${METAFIELD_KEY}\n\n` +
        metafieldsList.substring(0, 500),  // Limit to avoid dialog overflow
        ui.ButtonSet.OK
      );
    }
  } catch (error) {
    Logger.log(`❌ Error: ${error.message}`);
    ui.alert('❌ Error', `Failed to fetch spec sheet:\n\n${error.message}`, ui.ButtonSet.OK);
  }

  Logger.log('========================================');
}

// ============================================================================
// CORE LOGIC
// ============================================================================

/**
 * Fetch spec sheets for a range of rows
 */
function fetchSpecSheetsForRange(sheet, startRow, endRow, forceOverwrite = false) {
  const result = {
    updated: 0,
    skipped: 0,
    errors: 0
  };

  const numRows = endRow - startRow + 1;
  const allData = sheet.getRange(startRow, 1, numRows, sheet.getLastColumn()).getValues();

  for (let i = 0; i < allData.length; i++) {
    const rowNum = startRow + i;
    const rowData = allData[i];
    const productId = rowData[COLUMNS.ID - 1];
    const currentSpecSheet = rowData[COLUMNS.SPEC_SHEET - 1];

    // Skip if no product ID
    if (!productId) {
      if (DEBUG_LOGGING) {
        Logger.log(`Row ${rowNum}: Skipped (no product ID)`);
      }
      result.skipped++;
      continue;
    }

    // Skip if spec sheet already exists (unless force overwrite)
    if (!forceOverwrite && currentSpecSheet && currentSpecSheet.trim()) {
      if (DEBUG_LOGGING) {
        Logger.log(`Row ${rowNum}: Skipped (spec sheet already exists)`);
      }
      result.skipped++;
      continue;
    }

    try {
      const specSheetUrl = fetchSpecSheetFromShopify(productId);

      if (specSheetUrl) {
        sheet.getRange(rowNum, COLUMNS.SPEC_SHEET).setValue(specSheetUrl);
        Logger.log(`✅ Row ${rowNum}: Updated with spec sheet`);
        result.updated++;
      } else {
        if (DEBUG_LOGGING) {
          Logger.log(`⚠️ Row ${rowNum}: No spec sheet found in Shopify`);
        }
        result.skipped++;
      }

      // Rate limiting
      Utilities.sleep(RATE_LIMIT_DELAY_MS);

    } catch (error) {
      Logger.log(`❌ Row ${rowNum}: Error - ${error.message}`);
      result.errors++;
    }

    // Progress update every 10 rows
    if ((i + 1) % 10 === 0) {
      Logger.log(`Progress: ${i + 1}/${numRows} rows processed`);
    }
  }

  return result;
}

/**
 * Get all metafields for a product (for debugging)
 */
function getAllMetafieldsForProduct(productId) {
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/products/${productId}/metafields.json`;

  const options = {
    method: 'get',
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const statusCode = response.getResponseCode();

  if (statusCode !== 200) {
    throw new Error(`Shopify API error: ${statusCode} - ${response.getContentText()}`);
  }

  const data = JSON.parse(response.getContentText());
  return data.metafields || [];
}

/**
 * Fetch spec sheet URL from Shopify for a given product ID
 */
function fetchSpecSheetFromShopify(productId) {
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/products/${productId}/metafields.json`;

  const options = {
    method: 'get',
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const statusCode = response.getResponseCode();

  if (statusCode !== 200) {
    throw new Error(`Shopify API error: ${statusCode} - ${response.getContentText()}`);
  }

  const data = JSON.parse(response.getContentText());

  // Find the spec sheet metafield
  const metafields = data.metafields || [];
  const specSheetMetafield = metafields.find(m =>
    m.namespace === METAFIELD_NAMESPACE && m.key === METAFIELD_KEY
  );

  if (specSheetMetafield && specSheetMetafield.value) {
    return specSheetMetafield.value;
  }

  return null;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Runs when the spreadsheet is opened
 */
function onOpen() {
  setupMenu();
}
