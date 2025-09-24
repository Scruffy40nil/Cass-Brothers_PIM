/**
 * Updated Shopify Product Data Sync for Google Sheets
 * Matches Cass Brothers PIM collection structure
 *
 * Pulls comprehensive product data from Shopify using Product IDs in column D
 * Updates existing columns and populates Shopify data columns
 *
 * SETUP INSTRUCTIONS:
 * 1. In Google Apps Script, go to Project Settings (gear icon)
 * 2. In Script Properties, add:
 *    - Key: SHOPIFY_ACCESS_TOKEN
 *    - Value: Your Shopify private app access token (starts with shpat_)
 */

// ===============================
// CONFIGURATION - UPDATE THESE
// ===============================

const SHOPIFY_CONFIG = {
  shop_url: 'cassbrothers.myshopify.com',
  access_token: PropertiesService.getScriptProperties().getProperty('SHOPIFY_ACCESS_TOKEN') || 'YOUR_SHOPIFY_ACCESS_TOKEN_HERE',
  api_version: '2024-01'
};

// Sheet configuration
const SHEET_CONFIG = {
  // Source column (what we read from to identify products)
  PRODUCT_ID_COLUMN: 'D',

  // Sheet structure
  HEADER_ROW: 1,
  FIRST_DATA_ROW: 2,

  // Existing columns we want to update (map to column letters)
  EXISTING_COLUMNS: {
    'Product Status': { column: 'L', columnIndex: 12, type: 'text' },
    'Shopify Product ID': { column: 'M', columnIndex: 13, type: 'text' },
    'Image URLs': { column: 'U', columnIndex: 21, type: 'text' },
    'Image Status': { column: 'V', columnIndex: 22, type: 'text' },
    'Shopify Image URLs': { column: 'W', columnIndex: 23, type: 'text' },
    'Primary Category': { column: 'X', columnIndex: 24, type: 'text' },
    'Published': { column: 'Y', columnIndex: 25, type: 'text' }
  }
};

// Shopify columns configuration (Column AM onwards - matching your exact structure)
const SHOPIFY_COLUMNS = {
  'Shopify Status': { column: 'AM', columnIndex: 39, type: 'text' },
  'Shopify Price': { column: 'AN', columnIndex: 40, type: 'currency' },
  'Shopify Compare Price': { column: 'AO', columnIndex: 41, type: 'currency' },
  'Shopify Weight': { column: 'AP', columnIndex: 42, type: 'number' },
  'Shopify Tags': { column: 'AQ', columnIndex: 43, type: 'text' },
  'Search Engine Page Title': { column: 'AR', columnIndex: 44, type: 'text' },
  'Search Engine Meta Description': { column: 'AS', columnIndex: 45, type: 'text' },
  'Shopify Images': { column: 'AT', columnIndex: 46, type: 'text' },
  'Shopify Collections': { column: 'AV', columnIndex: 48, type: 'text' },
  'Shopify URL': { column: 'AW', columnIndex: 49, type: 'text' },
  'Last Shopify Sync': { column: 'AX', columnIndex: 50, type: 'datetime' }
};

// Metafield columns (if needed in the future)
const METAFIELD_COLUMNS = {
  // Add metafield mappings here if needed
  // 'Custom Field': { column: 'AY', columnIndex: 51, type: 'text' }
};

// Performance configuration
const PERFORMANCE_CONFIG = {
  SKIP_COLLECTIONS: true,     // Skip collections due to API access issues
  SKIP_METAFIELDS: true,      // Skip metafields for better performance
  MAX_COLLECTIONS_CHECK: 10   // Limit collections check for performance
};

// ===============================
// MAIN SYNC FUNCTIONS
// ===============================

/**
 * Main function to sync all collection sheets with Shopify data
 */
function syncAllShopifyData() {
  try {
    console.log('🚀 Starting Shopify sync for all collection sheets...');

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const allSheets = spreadsheet.getSheets();

    // Filter to collection sheets (exclude dashboard, etc)
    const collectionSheets = allSheets.filter(sheet => {
      const name = sheet.getName().toLowerCase();
      return !name.includes('dashboard') &&
             !name.includes('config') &&
             !name.includes('template') &&
             !name.includes('summary');
    });

    console.log(`📄 Found ${collectionSheets.length} collection sheets to process`);

    let totalUpdated = 0;
    let totalErrors = 0;

    for (const sheet of collectionSheets) {
      try {
        console.log(`\n🔄 Processing ${sheet.getName()}...`);

        // Verify columns exist
        verifyShopifyColumns(sheet);

        // Sync the sheet
        const result = syncSheetWithShopify(sheet);
        totalUpdated += result.updated;
        totalErrors += result.errors;

        // Add a delay to avoid hitting API rate limits
        Utilities.sleep(2000);

      } catch (error) {
        console.error(`❌ Error processing sheet ${sheet.getName()}:`, error);
        totalErrors++;
      }
    }

    console.log(`\n✅ Sync complete!`);
    console.log(`   📦 Updated: ${totalUpdated} products`);
    console.log(`   ❌ Errors: ${totalErrors} products`);
    console.log(`   📄 Sheets: ${collectionSheets.length}`);

    // Update the dashboard
    updateSyncDashboard(collectionSheets.length, totalUpdated, totalErrors);

  } catch (error) {
    console.error('❌ Fatal error in syncAllShopifyData:', error);
  }
}

/**
 * Sync only the currently active sheet
 */
function syncCurrentSheetOnly() {
  try {
    console.log('🚀 Starting Shopify sync for current sheet...');

    const sheet = SpreadsheetApp.getActiveSheet();
    console.log(`📄 Syncing: ${sheet.getName()}`);

    // Verify columns exist
    verifyShopifyColumns(sheet);

    // Sync the sheet
    const result = syncSheetWithShopify(sheet);

    console.log(`\n✅ Sync complete for ${sheet.getName()}!`);
    console.log(`   📦 Updated: ${result.updated} products`);
    console.log(`   ❌ Errors: ${result.errors} products`);

    return result;

  } catch (error) {
    console.error('❌ Error in syncCurrentSheetOnly:', error);
    throw error;
  }
}

// ===============================
// SHEET VERIFICATION
// ===============================

/**
 * Verify that Shopify columns exist in the sheet (don't create them, just verify)
 */
function verifyShopifyColumns(sheet) {
  console.log(`🏗️ Verifying Shopify columns in ${sheet.getName()}...`);

  // Get current headers
  const lastColumn = sheet.getLastColumn();
  const headerRange = sheet.getRange(SHEET_CONFIG.HEADER_ROW, 1, 1, lastColumn);
  const headers = headerRange.getValues()[0];

  let missingColumns = [];

  // Check existing columns
  Object.keys(SHEET_CONFIG.EXISTING_COLUMNS).forEach(columnName => {
    const columnInfo = SHEET_CONFIG.EXISTING_COLUMNS[columnName];
    const columnIndex = columnLetterToNumber(columnInfo.column);

    if (columnIndex > headers.length || !headers[columnIndex - 1]) {
      missingColumns.push(`${columnName} (${columnInfo.column})`);
    }
  });

  // Check Shopify columns
  Object.keys(SHOPIFY_COLUMNS).forEach(columnName => {
    const columnInfo = SHOPIFY_COLUMNS[columnName];
    const columnIndex = columnInfo.columnIndex;

    if (columnIndex > headers.length || !headers[columnIndex - 1]) {
      missingColumns.push(`${columnName} (${columnInfo.column})`);
    }
  });

  if (missingColumns.length > 0) {
    console.warn(`⚠️ Missing columns in ${sheet.getName()}: ${missingColumns.join(', ')}`);
    console.warn(`   Please ensure your sheet has the correct column structure`);
  } else {
    console.log(`✅ All required columns found in ${sheet.getName()}`);
  }
}

/**
 * Sync a single sheet with Shopify data
 */
function syncSheetWithShopify(sheet) {
  const sheetName = sheet.getName();
  console.log(`🔄 Syncing Shopify data for ${sheetName}...`);

  // Get all product IDs from column D
  const lastRow = sheet.getLastRow();
  if (lastRow <= SHEET_CONFIG.HEADER_ROW) {
    console.log(`⚠️ No data found in ${sheetName}`);
    return { updated: 0, errors: 0 };
  }

  const productIdRange = sheet.getRange(`${SHEET_CONFIG.PRODUCT_ID_COLUMN}${SHEET_CONFIG.FIRST_DATA_ROW}:${SHEET_CONFIG.PRODUCT_ID_COLUMN}${lastRow}`);
  const productIds = productIdRange.getValues().flat();

  console.log(`📦 Found ${productIds.length} product rows in ${sheetName}`);
  console.log(`🔄 Will update existing columns: ${Object.keys(SHEET_CONFIG.EXISTING_COLUMNS).join(', ')}`);
  console.log(`➕ Will update Shopify columns: ${Object.keys(SHOPIFY_COLUMNS).join(', ')}`);

  if (Object.keys(METAFIELD_COLUMNS).length > 0) {
    console.log(`🏷️ Will update metafield columns: ${Object.keys(METAFIELD_COLUMNS).join(', ')}`);
  }

  let updatedCount = 0;
  let errorCount = 0;
  const batchUpdates = {};

  // Initialize batch update arrays for existing columns
  Object.keys(SHEET_CONFIG.EXISTING_COLUMNS).forEach(columnName => {
    batchUpdates[columnName] = [];
  });

  // Initialize batch update arrays for Shopify columns
  Object.keys(SHOPIFY_COLUMNS).forEach(columnName => {
    batchUpdates[columnName] = [];
  });

  // Initialize batch update arrays for metafield columns
  Object.keys(METAFIELD_COLUMNS).forEach(columnName => {
    batchUpdates[columnName] = [];
  });

  // Process in smaller batches to avoid timeout and API limits
  const batchSize = 20;
  for (let i = 0; i < productIds.length; i += batchSize) {
    const batchIds = productIds.slice(i, i + batchSize);
    const batchStartRow = SHEET_CONFIG.FIRST_DATA_ROW + i;

    console.log(`🔍 Processing batch ${Math.floor(i/batchSize) + 1}: rows ${batchStartRow}-${batchStartRow + batchIds.length - 1}`);

    // Process each product in the batch
    for (let j = 0; j < batchIds.length; j++) {
      const productId = batchIds[j];
      const rowNumber = batchStartRow + j;
      const arrayIndex = i + j;

      if (!productId || productId.toString().trim() === '') {
        // Empty product ID - fill with empty values
        fillEmptyProductData(batchUpdates, arrayIndex);
        continue;
      }

      try {
        console.log(`🔍 Fetching Shopify data for product ${productId} (arrayIndex: ${arrayIndex}, rowNumber: ${rowNumber})`);

        // Get detailed product data from Shopify
        const productData = getShopifyProductById(productId.toString().trim());

        if (productData) {
          // Extract all the data we need
          const extractedData = extractShopifyData(productData);

          // Add to batch updates - existing columns
          Object.keys(SHEET_CONFIG.EXISTING_COLUMNS).forEach(columnName => {
            batchUpdates[columnName][arrayIndex] = extractedData[columnName] || '';
          });

          // Add to batch updates - Shopify columns
          Object.keys(SHOPIFY_COLUMNS).forEach(columnName => {
            const value = extractedData[columnName] || '';
            batchUpdates[columnName][arrayIndex] = value;
            // Debug first few products
            if (arrayIndex < 3) {
              console.log(`🔍 Setting ${columnName}[${arrayIndex}] = "${value}"`);
            }
          });

          // Debug array length after each product for first few
          if (arrayIndex < 3) {
            console.log(`🔍 After product ${arrayIndex}: Status array length = ${batchUpdates['Shopify Status'].length}`);
          }

          // Add to batch updates - metafield columns
          Object.keys(METAFIELD_COLUMNS).forEach(columnName => {
            batchUpdates[columnName][arrayIndex] = extractedData[columnName] || '';
          });

          updatedCount++;

        } else {
          // Product not found
          console.warn(`⚠️ Product ${productId} not found in Shopify`);
          fillNotFoundProductData(batchUpdates, arrayIndex, productId);
          errorCount++;
        }

      } catch (error) {
        console.error(`❌ Error processing product ${productId}:`, error);
        fillErrorProductData(batchUpdates, arrayIndex, productId);
        errorCount++;
      }
    }

    // Add delay between batches
    if (i + batchSize < productIds.length) {
      Utilities.sleep(1000);
    }
  }

  // Debug: Check what data we have before applying updates
  console.log(`🔍 Debug: About to apply updates for ${productIds.length} products`);
  console.log(`🔍 Debug: Total array indices populated: ${Object.keys(batchUpdates).map(key => batchUpdates[key].length).join(', ')}`);
  console.log(`🔍 Debug: Non-empty arrays: ${Object.keys(batchUpdates).filter(key => batchUpdates[key] && batchUpdates[key].length > 0).join(', ')}`);
  console.log(`🔍 Debug: Sample batch data:`, {
    'Shopify Status': batchUpdates['Shopify Status'] ? batchUpdates['Shopify Status'].slice(0, 3) : 'undefined',
    'Shopify Price': batchUpdates['Shopify Price'] ? batchUpdates['Shopify Price'].slice(0, 3) : 'undefined'
  });
  console.log(`🔍 Debug: Full status array length: ${batchUpdates['Shopify Status'] ? batchUpdates['Shopify Status'].length : 'undefined'}`);
  console.log(`🔍 Debug: Checking for undefined/null values in first 10 status entries:`,
    batchUpdates['Shopify Status'] ? batchUpdates['Shopify Status'].slice(0, 10).map((val, idx) => `${idx}:${val}`) : 'no array');

  // Apply all updates to the sheet
  applyBatchUpdates(sheet, batchUpdates, productIds.length);

  console.log(`✅ ${sheetName} sync complete:`);
  console.log(`   📦 Updated: ${updatedCount} products`);
  console.log(`   ❌ Errors: ${errorCount} products`);

  return { updated: updatedCount, errors: errorCount };
}

/**
 * Fill empty product data
 */
function fillEmptyProductData(batchUpdates, arrayIndex) {
  Object.keys(SHEET_CONFIG.EXISTING_COLUMNS).forEach(columnName => {
    batchUpdates[columnName][arrayIndex] = '';
  });
  Object.keys(SHOPIFY_COLUMNS).forEach(columnName => {
    batchUpdates[columnName][arrayIndex] = '';
  });
  Object.keys(METAFIELD_COLUMNS).forEach(columnName => {
    batchUpdates[columnName][arrayIndex] = '';
  });
}

/**
 * Fill product not found data
 */
function fillNotFoundProductData(batchUpdates, arrayIndex, productId) {
  Object.keys(SHEET_CONFIG.EXISTING_COLUMNS).forEach(columnName => {
    batchUpdates[columnName][arrayIndex] = '';
  });
  Object.keys(SHOPIFY_COLUMNS).forEach(columnName => {
    if (columnName === 'Shopify Status') {
      batchUpdates[columnName][arrayIndex] = `NOT FOUND (${productId})`;
    } else {
      batchUpdates[columnName][arrayIndex] = '';
    }
  });
  Object.keys(METAFIELD_COLUMNS).forEach(columnName => {
    batchUpdates[columnName][arrayIndex] = '';
  });
}

/**
 * Fill error product data
 */
function fillErrorProductData(batchUpdates, arrayIndex, productId) {
  Object.keys(SHEET_CONFIG.EXISTING_COLUMNS).forEach(columnName => {
    batchUpdates[columnName][arrayIndex] = '';
  });
  Object.keys(SHOPIFY_COLUMNS).forEach(columnName => {
    if (columnName === 'Shopify Status') {
      batchUpdates[columnName][arrayIndex] = `ERROR (${productId})`;
    } else {
      batchUpdates[columnName][arrayIndex] = '';
    }
  });
  Object.keys(METAFIELD_COLUMNS).forEach(columnName => {
    batchUpdates[columnName][arrayIndex] = '';
  });
}

/**
 * Apply all batch updates to the sheet
 */
function applyBatchUpdates(sheet, batchUpdates, totalRows) {
  if (totalRows === 0) return;

  console.log(`📝 Applying updates to ${totalRows} rows in ${sheet.getName()}...`);
  console.log(`🔍 Debug: Sheet has ${sheet.getLastRow()} rows and ${sheet.getLastColumn()} columns`);

  const startRow = SHEET_CONFIG.FIRST_DATA_ROW;
  const endRow = startRow + totalRows - 1;

  console.log(`🔍 Debug: Updating rows ${startRow} to ${endRow}`);
  console.log(`🔍 Debug: Available batch update keys:`, Object.keys(batchUpdates));

  try {
    // Update existing columns first
    Object.keys(SHEET_CONFIG.EXISTING_COLUMNS).forEach(columnName => {
      const columnInfo = SHEET_CONFIG.EXISTING_COLUMNS[columnName];
      const columnLetter = columnInfo.column;
      const range = sheet.getRange(`${columnLetter}${startRow}:${columnLetter}${endRow}`);
      const updateData = batchUpdates[columnName];

      // Convert to 2D array for setValues
      const values2D = updateData.map(value => [value || '']);

      // Apply formatting based on column type
      if (columnInfo.type === 'currency') {
        range.setNumberFormat('$#,##0.00');
      } else if (columnInfo.type === 'datetime') {
        range.setNumberFormat('yyyy-mm-dd hh:mm:ss');
      } else if (columnInfo.type === 'number') {
        range.setNumberFormat('#,##0');
      }

      // Set the values
      range.setValues(values2D);
      console.log(`   🔄 Updated existing column ${columnLetter} (${columnName})`);
    });

    // Update Shopify columns
    Object.keys(SHOPIFY_COLUMNS).forEach(columnName => {
      const columnInfo = SHOPIFY_COLUMNS[columnName];
      const columnLetter = columnInfo.column;
      const updateData = batchUpdates[columnName];

      console.log(`🔍 Debug: Processing ${columnName} → Column ${columnLetter}`);
      console.log(`🔍 Debug: Update data length: ${updateData ? updateData.length : 'undefined'}`);
      console.log(`🔍 Debug: First 3 values:`, updateData ? updateData.slice(0, 3) : 'no data');

      if (!updateData || updateData.length === 0) {
        console.warn(`⚠️ No update data for ${columnName}, skipping`);
        return;
      }

      const range = sheet.getRange(`${columnLetter}${startRow}:${columnLetter}${endRow}`);

      // Convert to 2D array for setValues
      const values2D = updateData.map(value => [value || '']);

      // Apply formatting based on column type
      if (columnInfo.type === 'currency') {
        range.setNumberFormat('$#,##0.00');
      } else if (columnInfo.type === 'datetime') {
        range.setNumberFormat('yyyy-mm-dd hh:mm:ss');
      } else if (columnInfo.type === 'number') {
        range.setNumberFormat('#,##0');
      }

      // Set the values
      range.setValues(values2D);
      console.log(`   ✅ Updated Shopify column ${columnLetter} (${columnName}) with ${values2D.length} values`);
    });

    // Update metafield columns
    Object.keys(METAFIELD_COLUMNS).forEach(columnName => {
      const columnInfo = METAFIELD_COLUMNS[columnName];
      const columnLetter = columnInfo.column;
      const range = sheet.getRange(`${columnLetter}${startRow}:${columnLetter}${endRow}`);
      const updateData = batchUpdates[columnName];

      // Convert to 2D array for setValues
      const values2D = updateData.map(value => [value || '']);

      // Apply formatting based on column type
      if (columnInfo.type === 'currency') {
        range.setNumberFormat('$#,##0.00');
      } else if (columnInfo.type === 'datetime') {
        range.setNumberFormat('yyyy-mm-dd hh:mm:ss');
      } else if (columnInfo.type === 'number') {
        range.setNumberFormat('#,##0');
      }

      // Set the values
      range.setValues(values2D);
      console.log(`   🔄 Updated metafield column ${columnLetter} (${columnName})`);
    });

    // Update the Last Shopify Sync timestamp
    const syncTimestamp = new Date();
    const syncColumn = SHOPIFY_COLUMNS['Last Shopify Sync'];
    const syncRange = sheet.getRange(`${syncColumn.column}${startRow}:${syncColumn.column}${endRow}`);
    const syncValues2D = Array(totalRows).fill().map(() => [syncTimestamp]);
    syncRange.setValues(syncValues2D);

    console.log(`✅ All batch updates applied successfully to ${sheet.getName()}`);

  } catch (error) {
    console.error(`❌ Error applying batch updates:`, error);
    throw error;
  }
}

// ===============================
// SHOPIFY API FUNCTIONS
// ===============================

/**
 * Get detailed product data from Shopify by ID
 */
function getShopifyProductById(productId) {
  try {
    if (!productId || productId === '') {
      console.warn('⚠️ Empty product ID provided');
      return null;
    }

    const url = `https://${SHOPIFY_CONFIG.shop_url}/admin/api/${SHOPIFY_CONFIG.api_version}/products/${productId}.json`;

    const response = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_CONFIG.access_token,
        'Content-Type': 'application/json'
      }
    });

    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      return data.product;
    } else if (response.getResponseCode() === 404) {
      console.warn(`⚠️ Product ${productId} not found in Shopify`);
      return null;
    } else {
      console.error(`❌ Shopify API error ${response.getResponseCode()}: ${response.getContentText()}`);
      return null;
    }

  } catch (error) {
    console.error(`❌ Error fetching product ${productId}:`, error);
    return null;
  }
}

/**
 * Extract data from Shopify product object
 */
function extractShopifyData(productData) {
  if (!productData) return {};

  try {
    // Get the primary variant (usually the first one)
    const primaryVariant = productData.variants && productData.variants.length > 0
      ? productData.variants[0]
      : null;

    const extractedData = {
      // Existing columns data
      'Product Status': productData.status || '',
      'Shopify Product ID': productData.id ? productData.id.toString() : '',
      'Image URLs': productData.images && productData.images.length > 0
        ? productData.images.map(img => img.src).join('\n')
        : '',
      'Image Status': productData.images && productData.images.length > 0 ? 'Available' : 'No Images',
      'Shopify Image URLs': productData.images && productData.images.length > 0
        ? productData.images.map(img => img.src).join('\n')
        : '',
      'Primary Category': productData.product_type || '',
      'Published': productData.status === 'active' ? 'Yes' : 'No',

      // Shopify columns data
      'Shopify Status': productData.status || '',
      'Shopify Price': primaryVariant && primaryVariant.price ? parseFloat(primaryVariant.price) : '',
      'Shopify Compare Price': primaryVariant && primaryVariant.compare_at_price
        ? parseFloat(primaryVariant.compare_at_price)
        : '',
      'Shopify Weight': primaryVariant && primaryVariant.weight ? parseFloat(primaryVariant.weight) : '',
      'Shopify Tags': productData.tags || '',
      'Search Engine Page Title': productData.seo_title || productData.title || '',
      'Search Engine Meta Description': productData.seo_description || '',
      'Shopify Images': productData.images && productData.images.length > 0
        ? productData.images.map(img => img.src).join('\n')
        : '',
      'Shopify Collections': '', // Will be populated separately if needed
      'Shopify URL': productData.handle ? `https://${SHOPIFY_CONFIG.shop_url.replace('.myshopify.com', '.com')}/products/${productData.handle}` : '',
      'Last Shopify Sync': new Date()
    };

    return extractedData;

  } catch (error) {
    console.error('❌ Error extracting Shopify data:', error);
    return {};
  }
}

// ===============================
// UTILITY FUNCTIONS
// ===============================

/**
 * Convert column letter to number (A=1, B=2, etc.)
 */
function columnLetterToNumber(letter) {
  let result = 0;
  for (let i = 0; i < letter.length; i++) {
    result = result * 26 + (letter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  return result;
}

/**
 * Convert column number to letter (1=A, 2=B, etc.)
 */
function columnNumberToLetter(number) {
  let result = '';
  while (number > 0) {
    number--; // Adjust for 0-based indexing
    result = String.fromCharCode('A'.charCodeAt(0) + (number % 26)) + result;
    number = Math.floor(number / 26);
  }
  return result;
}

/**
 * Update sync dashboard (if exists)
 */
function updateSyncDashboard(sheetsProcessed, productsUpdated, errors) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

    // Try to find dashboard sheet
    const dashboardSheet = spreadsheet.getSheetByName('Dashboard') ||
                          spreadsheet.getSheetByName('Summary') ||
                          spreadsheet.getSheetByName('Sync Status');

    if (dashboardSheet) {
      // Update sync statistics (adjust ranges as needed)
      const timestamp = new Date();

      // You can customize these cell references based on your dashboard layout
      dashboardSheet.getRange('B1').setValue('Last Sync');
      dashboardSheet.getRange('C1').setValue(timestamp);
      dashboardSheet.getRange('B2').setValue('Sheets Processed');
      dashboardSheet.getRange('C2').setValue(sheetsProcessed);
      dashboardSheet.getRange('B3').setValue('Products Updated');
      dashboardSheet.getRange('C3').setValue(productsUpdated);
      dashboardSheet.getRange('B4').setValue('Errors');
      dashboardSheet.getRange('C4').setValue(errors);

      console.log('✅ Dashboard updated successfully');
    }
  } catch (error) {
    console.warn('⚠️ Could not update dashboard:', error.message);
  }
}

// ===============================
// TESTING FUNCTIONS
// ===============================

/**
 * Test function to verify sheet structure
 */
function testSheetStructure() {
  console.log('🧪 Testing sheet structure...');

  const sheet = SpreadsheetApp.getActiveSheet();
  console.log(`📄 Testing sheet: ${sheet.getName()}`);

  // Get headers
  const lastColumn = sheet.getLastColumn();
  const headerRange = sheet.getRange(1, 1, 1, lastColumn);
  const headers = headerRange.getValues()[0];

  console.log(`📊 Sheet has ${headers.length} columns and ${sheet.getLastRow()} rows`);

  // Test key column mappings
  Object.keys(SHOPIFY_COLUMNS).forEach(columnName => {
    const columnInfo = SHOPIFY_COLUMNS[columnName];
    const columnIndex = columnInfo.columnIndex;
    const header = headers[columnIndex - 1];

    console.log(`🔍 Column ${columnInfo.column} (${columnIndex}): "${header}" - Expected: "${columnName}"`);
  });

  // Test product ID column
  const productIdColumn = SHEET_CONFIG.PRODUCT_ID_COLUMN;
  const productIdIndex = columnLetterToNumber(productIdColumn) - 1;
  const productIdHeader = headers[productIdIndex];

  console.log(`🔍 Product ID Column ${productIdColumn}: "${productIdHeader}"`);

  // Get first few product IDs
  const productIdRange = sheet.getRange(`${productIdColumn}2:${productIdColumn}4`);
  const productIds = productIdRange.getValues().flat();

  console.log(`📦 Sample Product IDs:`, productIds);

  console.log('✅ Sheet structure test complete');
}

/**
 * Test function to sync a single product
 */
function testSingleProductSync() {
  console.log('🧪 Testing single product sync...');

  const sheet = SpreadsheetApp.getActiveSheet();

  // Get first product ID
  const productIdRange = sheet.getRange(`${SHEET_CONFIG.PRODUCT_ID_COLUMN}2`);
  const productId = productIdRange.getValue();

  if (!productId) {
    console.error('❌ No product ID found in first row');
    return;
  }

  console.log(`🔍 Testing with Product ID: ${productId}`);

  // Test API call
  const productData = getShopifyProductById(productId.toString().trim());

  if (productData) {
    console.log(`✅ Successfully fetched product: ${productData.title}`);
    console.log(`📊 Status: ${productData.status}`);
    console.log(`💰 Price: ${productData.variants[0]?.price || 'N/A'}`);

    // Test data extraction
    const extractedData = extractShopifyData(productData);
    console.log(`🔍 Extracted data keys:`, Object.keys(extractedData));

    // Test writing to a single cell (Shopify Status)
    const statusColumn = SHOPIFY_COLUMNS['Shopify Status'].column;
    const statusRange = sheet.getRange(`${statusColumn}2`);
    statusRange.setValue(extractedData['Shopify Status']);

    console.log(`✅ Successfully wrote status "${extractedData['Shopify Status']}" to column ${statusColumn}`);

  } else {
    console.error('❌ Failed to fetch product data');
  }
}

/**
 * Sync just the first 5 products for testing
 */
function syncFirst5Products() {
  console.log('🧪 Testing sync of first 5 products...');

  const sheet = SpreadsheetApp.getActiveSheet();

  // Get first 5 product IDs
  const productIdRange = sheet.getRange(`${SHEET_CONFIG.PRODUCT_ID_COLUMN}2:${SHEET_CONFIG.PRODUCT_ID_COLUMN}6`);
  const productIds = productIdRange.getValues().flat();

  console.log(`📦 Testing with Product IDs:`, productIds);

  const batchUpdates = {};

  // Initialize batch arrays
  Object.keys(SHOPIFY_COLUMNS).forEach(columnName => {
    batchUpdates[columnName] = [];
  });

  // Process each product
  for (let i = 0; i < productIds.length; i++) {
    const productId = productIds[i];

    if (!productId || productId.toString().trim() === '') {
      // Fill with empty values
      Object.keys(SHOPIFY_COLUMNS).forEach(columnName => {
        batchUpdates[columnName][i] = '';
      });
      continue;
    }

    try {
      console.log(`🔍 Processing product ${i + 1}: ${productId}`);

      const productData = getShopifyProductById(productId.toString().trim());

      if (productData) {
        const extractedData = extractShopifyData(productData);

        Object.keys(SHOPIFY_COLUMNS).forEach(columnName => {
          batchUpdates[columnName][i] = extractedData[columnName] || '';
        });

        console.log(`✅ Product ${i + 1} processed: ${productData.title}`);
      } else {
        Object.keys(SHOPIFY_COLUMNS).forEach(columnName => {
          if (columnName === 'Shopify Status') {
            batchUpdates[columnName][i] = `NOT FOUND (${productId})`;
          } else {
            batchUpdates[columnName][i] = '';
          }
        });
      }

    } catch (error) {
      console.error(`❌ Error processing product ${productId}:`, error);
      Object.keys(SHOPIFY_COLUMNS).forEach(columnName => {
        batchUpdates[columnName][i] = columnName === 'Shopify Status' ? `ERROR (${productId})` : '';
      });
    }
  }

  // Apply updates to sheet
  console.log('📝 Applying batch updates...');

  Object.keys(SHOPIFY_COLUMNS).forEach(columnName => {
    const columnInfo = SHOPIFY_COLUMNS[columnName];
    const range = sheet.getRange(`${columnInfo.column}2:${columnInfo.column}6`);
    const values2D = batchUpdates[columnName].map(value => [value || '']);

    range.setValues(values2D);
    console.log(`✅ Updated column ${columnInfo.column} (${columnName})`);
  });

  console.log('✅ Test sync of 5 products complete!');
}