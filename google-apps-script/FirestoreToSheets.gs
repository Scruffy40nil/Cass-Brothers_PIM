/**
 * Google Apps Script: Sync Firestore → Google Sheets
 *
 * This script pulls all products from Firestore and writes them to Google Sheets
 * Use this ONCE to populate your sheet with existing Firestore data
 *
 * After this initial sync, use DirectFirestoreSync.gs for ongoing Sheets → Firestore sync
 */

// ============================================================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================================================

const CONFIG = {
  // Your Firestore credentials
  FIREBASE_PROJECT_ID: 'product-extractor-464023',

  FIREBASE_CLIENT_EMAIL: 'product-extractor@product-extractor-464023.iam.gserviceaccount.com',

  FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQCbvbKggsaW58Rv\noCL0NIPIYRlgjRqwcW/9vVDhHUqON/t/cWrca+SPYZAlzFbUrh+ofCWMjRaVmaZ/\n9yFS2qf124wGlCGoTqwD2hdJEV3fD0XVEKfqeXOu0kY0FPSsUCr9uiubp3Vwc+KB\nxmx5ELoNHXJXsEMGMvcuZQF4wGjOmHGrudjiStLy54jsWZxhiBNuy2t1XH04NdS5\n2yLUzHlyW2uApblCf7mnGrYN0K0dwFwERb8+5a9bNdDIjxIB+l5LRQN/CikgvdCl\nj4rbxzU4GStGYRaaUIKUD+6rPjTpZtsz5BwxvE5R6G7X7M0CDj3FydMjMYNRxsrW\nHGJdvleHAgMBAAECggEAIfJWVjBLMydvpNkl5U7xDqNDkc0P7Te8rnUuhPMKhjdj\npWLGZSdLWYltjx+cKZ2Onv34fUtfidpE9Y2bgODSTX++ZMyzDWmgivJlsvKLIIzG\nruuDflNcyNViogWTU1/iDw4eZT46FfncfGcQy86+jw9FFiIAagB/6mfvyy89aRJw\nGb4t4x64s85DCSuSv2vwcj2Hv8eFkMoDLtJQfNpvDorB33qtFJC5xIFHWwdnM2g6\nBeUTwwka/2occHZZ+uesmE7lLt2l/hoKiE6BnUdwSy2+e0qEnZisPQsrVNmngAeJ\nQtNdh6u4NOH0DdoL2O4vjJ7ziRuToP/QdWoE6BnKAQKBgQDYPTv7CP7Fj8LTu6TI\nQncFsl/uzlV2Fv94cjqFoM3kbDQvDK6/aklX9A7FOt9hI7nW5KgM7/sLL8qzMV5B\nCI4ljB4kmP8UHDoseW52H7NQiSrQIG70OrEtHK7q2QdEHSBQh6jE5EazVp+4b28Q\n0Q2oRTKjj/eFEiYEokDs7pwTAQKBgQC4YLSaiFZlVWYRcHU/Kbec4om80lZgGfZC\nB1YTVatSwMRSwqCtQ6bUTKVUArlX+BmrdEEtVUx9IOox/gGxwGMAWZXYk6n4p0DW\nuJMYW8msL4NI53SnYV+cL/BgGHJlV9xa7M63UnRxVy31MEWBNtNzWToxBpA7tPdS\n7me83VpShwKBgQCnl2XqXQFgSthb052V2/V1Q9cYNXCE8rQTPKzgrk2E0Nvs7y5s\nikrH0Q61i7hfCBpbU6JvTHtMI0E9enCrhJ7uuNcP1Eg15N6tY3vaLx2BuJ2m6swz\nm12AMi/bMlNwVgaag1mpJ6coDWYCwtLYvL2SAfeKTuUujG9MvhgFybTLAQKBgQCT\nM8odMkpf3t19gN5qzkCkxYyYLwn88d1U/AxxpU0B5ZsYRAEKM9/m0UaRmxckr5S2\n+TrsGZTWtcekoBn0MxgXeG6VGddzCP1QMM5nfSi3CrvzIa9Vzv0JcpCj+ACk/o+U\nHEoxvGfw8Vxky+RB9Ga/SfaWm5ndwW5QTLyP4d2x0wKBgQCfvEs4NAzSlpVFke/H\ndUbam3RVujLsMv6XlBEts0JLGv2RON1ioYDG+J1Qr0CRD/Vgavk7Tgbs2tXZKeKe\nSIg2FsXKwaQ5vuOjzJYaWe43KaA41djDLGS/ITgokm+j0Y4V7uC5OeLmchW1tTp9\ngaihOqetuZi36AqH133X9KDtkA==\n-----END PRIVATE KEY-----\n',

  // Collection name in Firestore
  FIRESTORE_COLLECTION: 'sinks',

  // Column mapping - Maps Firestore fields to Google Sheets columns
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
// MAIN SYNC FUNCTION
// ============================================================================

/**
 * Sync ALL products from Firestore to Google Sheets
 * Run this from: Extensions → Apps Script → Run → syncFirestoreToSheets
 */
function syncFirestoreToSheets() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Starting sync from Firestore...',
    '🔄 Syncing',
    -1  // Show until dismissed
  );

  try {
    Logger.log('Starting Firestore → Sheets sync...');

    // Get all documents from Firestore
    const documents = getAllFirestoreDocuments();

    if (!documents || documents.length === 0) {
      Logger.log('⚠️ No documents found in Firestore');
      SpreadsheetApp.getActiveSpreadsheet().toast(
        'No documents found in Firestore collection: ' + CONFIG.FIRESTORE_COLLECTION,
        '⚠️ Warning',
        5
      );
      return;
    }

    Logger.log(`📥 Retrieved ${documents.length} documents from Firestore`);

    // Sort documents by row number
    documents.sort((a, b) => {
      const rowA = parseInt(a.rowNumber) || 0;
      const rowB = parseInt(b.rowNumber) || 0;
      return rowA - rowB;
    });

    // Process each document and write to sheet
    let updatedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];

      try {
        // Write this document to the sheet
        writeDocumentToSheet(sheet, doc);
        updatedCount++;

        // Progress update every 50 rows
        if ((i + 1) % 50 === 0) {
          Logger.log(`Progress: ${i + 1}/${documents.length} rows written...`);
          SpreadsheetApp.getActiveSpreadsheet().toast(
            `Progress: ${i + 1}/${documents.length} rows written...`,
            '🔄 Syncing',
            -1
          );
        }

      } catch (error) {
        Logger.log(`❌ Error writing row ${doc.rowNumber}: ${error.message}`);
        errorCount++;
      }
    }

    Logger.log(`\n✅ Sync complete!`);
    Logger.log(`✅ Success: ${updatedCount} rows`);
    Logger.log(`❌ Errors: ${errorCount} rows`);

    SpreadsheetApp.getActiveSpreadsheet().toast(
      `Synced ${updatedCount} rows from Firestore. ${errorCount} errors.`,
      '✅ Sync Complete',
      5
    );

  } catch (error) {
    Logger.log(`❌ Fatal error: ${error.message}`);
    Logger.log(error.stack);

    SpreadsheetApp.getActiveSpreadsheet().toast(
      `Error: ${error.message}`,
      '❌ Sync Failed',
      10
    );
  }
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
 * Get all documents from Firestore collection with pagination
 */
function getAllFirestoreDocuments() {
  try {
    const accessToken = getFirestoreAccessToken();
    const projectId = CONFIG.FIREBASE_PROJECT_ID;
    const collection = CONFIG.FIRESTORE_COLLECTION;

    const allDocuments = [];
    let pageToken = null;
    let pageCount = 0;

    do {
      // Firestore collection path with pagination
      // Path is: collections/{collection_name}/products
      let firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/collections/${collection}/products?pageSize=300`;

      if (pageToken) {
        firestoreUrl += `&pageToken=${encodeURIComponent(pageToken)}`;
      }

      const options = {
        method: 'get',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        muteHttpExceptions: true
      };

      Logger.log(`Fetching page ${pageCount + 1} from: ${firestoreUrl}`);

      const response = UrlFetchApp.fetch(firestoreUrl, options);
      const responseCode = response.getResponseCode();

      if (responseCode !== 200) {
        Logger.log(`❌ Failed to fetch documents. Status: ${responseCode}`);
        Logger.log(`Response: ${response.getContentText()}`);
        break;
      }

      const data = JSON.parse(response.getContentText());

      if (!data.documents || data.documents.length === 0) {
        Logger.log(`No more documents found on page ${pageCount + 1}`);
        break;
      }

      // Parse Firestore documents
      for (const doc of data.documents) {
        const parsedDoc = parseFirestoreDocument(doc);
        allDocuments.push(parsedDoc);
      }

      Logger.log(`✅ Page ${pageCount + 1}: Retrieved ${data.documents.length} documents (total: ${allDocuments.length})`);

      // Check for next page
      pageToken = data.nextPageToken || null;
      pageCount++;

      // Safety limit
      if (pageCount > 20) {
        Logger.log('⚠️ Reached page limit (20 pages)');
        break;
      }

    } while (pageToken);

    Logger.log(`📥 Total documents retrieved: ${allDocuments.length}`);
    return allDocuments;

  } catch (error) {
    Logger.log(`❌ Error fetching Firestore documents: ${error.message}`);
    Logger.log(error.stack);
    throw error;
  }
}

/**
 * Parse Firestore document format to simple object
 */
function parseFirestoreDocument(firestoreDoc) {
  const result = {
    rowNumber: extractDocumentId(firestoreDoc.name)
  };

  // Parse each field
  const fields = firestoreDoc.fields || {};
  for (const [fieldName, fieldValue] of Object.entries(fields)) {
    result[fieldName] = extractFirestoreValue(fieldValue);
  }

  return result;
}

/**
 * Extract document ID from Firestore document name
 * e.g., "projects/xxx/databases/(default)/documents/sinks/123" → "123"
 */
function extractDocumentId(documentName) {
  const parts = documentName.split('/');
  return parts[parts.length - 1];
}

/**
 * Extract value from Firestore field format
 */
function extractFirestoreValue(fieldValue) {
  if (fieldValue.stringValue !== undefined) {
    return fieldValue.stringValue;
  }
  if (fieldValue.integerValue !== undefined) {
    return parseInt(fieldValue.integerValue);
  }
  if (fieldValue.doubleValue !== undefined) {
    return fieldValue.doubleValue;
  }
  if (fieldValue.booleanValue !== undefined) {
    return fieldValue.booleanValue;
  }
  if (fieldValue.nullValue !== undefined) {
    return '';
  }
  return '';
}

/**
 * Write a Firestore document to a Google Sheets row
 */
function writeDocumentToSheet(sheet, document) {
  const rowNumber = parseInt(document.rowNumber);

  if (!rowNumber || rowNumber < 2) {
    Logger.log(`Skipping invalid row number: ${document.rowNumber}`);
    return;
  }

  // Build row data array based on column mapping
  const rowData = [];
  const columnLetters = Object.keys(CONFIG.COLUMN_MAPPING).sort();

  for (const columnLetter of columnLetters) {
    const fieldName = CONFIG.COLUMN_MAPPING[columnLetter];
    const value = document[fieldName] || '';
    rowData.push(value);
  }

  // Write the row to the sheet
  const range = sheet.getRange(rowNumber, 1, 1, rowData.length);
  range.setValues([rowData]);

  Logger.log(`✅ Wrote row ${rowNumber} to sheet`);
}

// ============================================================================
// TEST FUNCTION
// ============================================================================

/**
 * Test function to fetch and display one document
 * Run this from: Extensions → Apps Script → Run → testFetchOneDocument
 */
function testFetchOneDocument() {
  try {
    Logger.log('Testing document fetch...');

    const accessToken = getFirestoreAccessToken();
    Logger.log('✅ Got access token');

    const projectId = CONFIG.FIREBASE_PROJECT_ID;
    const collection = CONFIG.FIRESTORE_COLLECTION;

    // Try to fetch the entire collection
    // Path is: collections/{collection_name}/products
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/collections/${collection}/products?pageSize=5`;

    const options = {
      method: 'get',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      muteHttpExceptions: true
    };

    Logger.log(`Fetching from: ${firestoreUrl}`);

    const response = UrlFetchApp.fetch(firestoreUrl, options);
    const responseCode = response.getResponseCode();

    if (responseCode === 200) {
      const data = JSON.parse(response.getContentText());
      Logger.log(`✅ Found ${data.documents ? data.documents.length : 0} documents`);

      if (data.documents && data.documents.length > 0) {
        const firstDoc = parseFirestoreDocument(data.documents[0]);
        Logger.log(`Sample document (row ${firstDoc.rowNumber}):`);
        Logger.log(JSON.stringify(firstDoc, null, 2));

        SpreadsheetApp.getActiveSpreadsheet().toast(
          `Successfully fetched ${data.documents.length} sample documents!`,
          '✅ Test Success',
          3
        );
      }
    } else {
      Logger.log(`❌ Failed. Status: ${responseCode}`);
      Logger.log(`Response: ${response.getContentText()}`);

      SpreadsheetApp.getActiveSpreadsheet().toast(
        `Test failed: ${responseCode}`,
        '❌ Test Failed',
        5
      );
    }

  } catch (error) {
    Logger.log(`❌ Error: ${error.message}`);
    Logger.log(error.stack);

    SpreadsheetApp.getActiveSpreadsheet().toast(
      `Error: ${error.message}`,
      '❌ Test Error',
      5
    );
  }
}
