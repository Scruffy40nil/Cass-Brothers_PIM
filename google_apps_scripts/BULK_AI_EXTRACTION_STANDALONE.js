/**
 * STANDALONE BULK AI EXTRACTION - Google Apps Script
 *
 * This script performs AI extraction directly in Google Sheets without calling external APIs.
 * It uses Google's built-in UrlFetchApp to scrape product URLs and extract data.
 *
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet (Taps Raw_Data)
 * 2. Go to Extensions → Apps Script
 * 3. Create a new script file and paste this code
 * 4. Add your OpenAI API key in the configuration below
 * 5. Run setupMenu() once to add the menu
 * 6. Use the "AI Extraction" menu to start bulk extraction
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

// IMPORTANT: Add your OpenAI API key here
const OPENAI_API_KEY = 'YOUR_OPENAI_API_KEY_HERE';

const BATCH_SIZE = 3; // Process 3 products at a time (conservative to avoid timeouts)
const DELAY_BETWEEN_BATCHES = 30000; // 30 seconds delay between batches
const DELAY_BETWEEN_REQUESTS = 5000; // 5 seconds between individual requests

// Column numbers (1-indexed) - Based on TapsCollection config
const COLUMNS = {
  URL: 1,              // Column A (supplier_url)
  SKU: 2,              // Column B (variant_sku)
  TITLE: 6,            // Column F (title)
  VENDOR: 7,           // Column G (vendor)
  BRAND: 8,            // Column H (brand_name)
  RANGE: 9,            // Column I (range)
  STYLE: 10,           // Column J (style)
  MOUNTING_TYPE: 11,   // Column K (mounting_type)
  COLOUR_FINISH: 12,   // Column L (colour_finish)
  MATERIAL: 13,        // Column M (material)
  HANDLE_TYPE: 17,     // Column Q (handle_type)
  HANDLE_COUNT: 18,    // Column R (handle_count)
  SWIVEL_SPOUT: 19,    // Column S (swivel_spout)
  CARTRIDGE_TYPE: 20,  // Column T (cartridge_type)
  WATERMARK_CERT: 26,  // Column Z (watermark_certification)
  LEAD_FREE: 27,       // Column AA (lead_free_compliance)
  APPLICATION: 28,     // Column AB (application_location)
};

// ============================================================================
// MENU SETUP
// ============================================================================

function setupMenu() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🤖 AI Extraction (Standalone)')
    .addItem('📊 Count Products Ready', 'countProductsReadyForExtraction')
    .addSeparator()
    .addItem('▶️ Extract ALL Products', 'extractAllProducts')
    .addItem('🔢 Extract Range', 'extractRangeDialog')
    .addSeparator()
    .addItem('⚙️ Settings', 'showSettings')
    .addToUi();

  Logger.log('✅ Menu added!');
  SpreadsheetApp.getActiveSpreadsheet().toast('Menu added! Refresh the page.', '✅ Success', 5);
}

function onOpen() {
  setupMenu();
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

function countProductsReadyForExtraction() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('No data found in sheet.');
    return;
  }

  const urlColumn = sheet.getRange(2, COLUMNS.URL, lastRow - 1, 1).getValues();
  const colourColumn = sheet.getRange(2, COLUMNS.COLOUR_FINISH, lastRow - 1, 1).getValues();

  let withURL = 0;
  let alreadyExtracted = 0;

  for (let i = 0; i < urlColumn.length; i++) {
    const url = urlColumn[i][0];
    const colour = colourColumn[i][0];

    if (url && url.toString().trim() !== '') {
      if (colour && colour.toString().trim() !== '') {
        alreadyExtracted++;
      } else {
        withURL++;
      }
    }
  }

  const message =
    '📊 EXTRACTION READINESS\n\n' +
    'Ready for extraction: ' + withURL + '\n' +
    'Already extracted: ' + alreadyExtracted + '\n' +
    'Total: ' + (lastRow - 1) + '\n\n' +
    'Extract the ' + withURL + ' products?';

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('Extraction Report', message, ui.ButtonSet.YES_NO);

  if (response == ui.Button.YES) {
    extractAllProducts();
  }
}

function extractAllProducts() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('No data found.');
    return;
  }

  const urlColumn = sheet.getRange(2, COLUMNS.URL, lastRow - 1, 1).getValues();
  const colourColumn = sheet.getRange(2, COLUMNS.COLOUR_FINISH, lastRow - 1, 1).getValues();

  const rowsToExtract = [];
  for (let i = 0; i < urlColumn.length; i++) {
    const url = urlColumn[i][0];
    const colour = colourColumn[i][0];
    const rowNum = i + 2;

    if (url && url.toString().trim() !== '' && (!colour || colour.toString().trim() === '')) {
      rowsToExtract.push(rowNum);
    }
  }

  if (rowsToExtract.length === 0) {
    SpreadsheetApp.getUi().alert('No products need extraction.');
    return;
  }

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Bulk Extraction',
    'Extract ' + rowsToExtract.length + ' products?\n\n' +
    'Batch size: ' + BATCH_SIZE + '\n' +
    'Est. time: ' + Math.ceil(rowsToExtract.length / BATCH_SIZE * 0.5) + ' minutes',
    ui.ButtonSet.YES_NO
  );

  if (response == ui.Button.YES) {
    bulkExtract(rowsToExtract);
  }
}

function extractRangeDialog() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Extract Range',
    'Enter row range (e.g., "2-50"):',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const input = response.getResponseText().trim();
  const parts = input.split('-');
  const start = parseInt(parts[0]);
  const end = parseInt(parts[1]);

  if (isNaN(start) || isNaN(end)) {
    ui.alert('Invalid format. Use: 2-50');
    return;
  }

  const rowsToExtract = [];
  for (let i = start; i <= end; i++) {
    rowsToExtract.push(i);
  }

  bulkExtract(rowsToExtract);
}

// ============================================================================
// EXTRACTION LOGIC
// ============================================================================

function bulkExtract(rowNumbers) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const startTime = new Date();

  Logger.log('🚀 Starting extraction for ' + rowNumbers.length + ' rows');
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Starting extraction...',
    '🤖 AI Extraction',
    5
  );

  const results = {
    total: rowNumbers.length,
    succeeded: 0,
    failed: 0,
    errors: []
  };

  // Process in batches
  for (let i = 0; i < rowNumbers.length; i += BATCH_SIZE) {
    const batch = rowNumbers.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rowNumbers.length / BATCH_SIZE);

    Logger.log('📦 Batch ' + batchNum + '/' + totalBatches + ': ' + batch.join(', '));
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'Batch ' + batchNum + '/' + totalBatches + ' (' + results.succeeded + ' done)',
      '⏳ Extracting',
      5
    );

    for (const rowNum of batch) {
      try {
        const result = extractSingleProduct(rowNum, sheet);

        if (result.success) {
          results.succeeded++;
          Logger.log('✅ Row ' + rowNum);
        } else {
          results.failed++;
          results.errors.push({row: rowNum, error: result.error});
          Logger.log('❌ Row ' + rowNum + ': ' + result.error);
        }

        Utilities.sleep(DELAY_BETWEEN_REQUESTS);

      } catch (error) {
        results.failed++;
        results.errors.push({row: rowNum, error: error.toString()});
        Logger.log('❌ Row ' + rowNum + ': ' + error);
      }
    }

    if (i + BATCH_SIZE < rowNumbers.length) {
      Logger.log('⏸️ Waiting ' + (DELAY_BETWEEN_BATCHES/1000) + 's...');
      SpreadsheetApp.getActiveSpreadsheet().toast(
        'Waiting to avoid rate limits...\n' + results.succeeded + ' done, ' + results.failed + ' failed',
        '⏸️ Batch Complete',
        10
      );
      Utilities.sleep(DELAY_BETWEEN_BATCHES);
    }
  }

  const duration = Math.round((new Date() - startTime) / 1000 / 60);

  Logger.log('🎉 Complete! ' + results.succeeded + ' succeeded, ' + results.failed + ' failed');

  let errorReport = '';
  if (results.errors.length > 0) {
    errorReport = '\n\nErrors:\n' + results.errors.slice(0, 3).map(function(e) {
      return 'Row ' + e.row + ': ' + e.error;
    }).join('\n');
  }

  SpreadsheetApp.getUi().alert(
    '🎉 Complete',
    'Processed ' + results.total + ' in ' + duration + ' min\n\n' +
    '✅ Success: ' + results.succeeded + '\n' +
    '❌ Failed: ' + results.failed +
    errorReport
  );
}

function extractSingleProduct(rowNum, sheet) {
  try {
    // Get URL from sheet
    const url = sheet.getRange(rowNum, COLUMNS.URL).getValue();

    if (!url || url.toString().trim() === '') {
      return {success: false, error: 'No URL'};
    }

    Logger.log('🔄 Extracting row ' + rowNum + ': ' + url);

    // Fetch HTML content
    const html = fetchHTML(url);
    if (!html) {
      return {success: false, error: 'Failed to fetch HTML'};
    }

    // Extract data using OpenAI
    const extractedData = extractWithAI(html, url);
    if (!extractedData) {
      return {success: false, error: 'AI extraction failed'};
    }

    // Write data to sheet
    writeDataToSheet(sheet, rowNum, extractedData);

    return {success: true};

  } catch (error) {
    return {success: false, error: error.toString()};
  }
}

function fetchHTML(url) {
  try {
    const options = {
      method: 'get',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      muteHttpExceptions: true,
      followRedirects: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();

    if (statusCode === 200) {
      return response.getContentText();
    }

    return null;

  } catch (error) {
    Logger.log('HTML fetch error: ' + error);
    return null;
  }
}

function extractWithAI(html, url) {
  try {
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'YOUR_OPENAI_API_KEY_HERE') {
      throw new Error('OpenAI API key not configured');
    }

    // Clean HTML (remove scripts, styles)
    const cleanedHTML = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .substring(0, 4000); // Limit to 4000 chars

    const prompt =
      'Extract tap/faucet product information from this HTML. Return ONLY valid JSON.\n\n' +
      'Required format:\n' +
      '{\n' +
      '  "brand_name": "brand",\n' +
      '  "range": "product range/series",\n' +
      '  "style": "style (e.g., Modern, Traditional)",\n' +
      '  "mounting_type": "Hob Mounting or Wall Mounted",\n' +
      '  "colour_finish": "color/finish",\n' +
      '  "material": "material (e.g., Brass, Stainless Steel)",\n' +
      '  "handle_type": "handle type",\n' +
      '  "handle_count": "1 or 2",\n' +
      '  "swivel_spout": "Yes or No",\n' +
      '  "cartridge_type": "cartridge type",\n' +
      '  "watermark_certification": "Yes or No",\n' +
      '  "lead_free_compliance": "Yes or No",\n' +
      '  "application_location": "Kitchen, Bathroom, or Laundry"\n' +
      '}\n\n' +
      'HTML: ' + cleanedHTML;

    const apiUrl = 'https://api.openai.com/v1/chat/completions';
    const payload = {
      model: 'gpt-4o-mini',
      messages: [
        {role: 'system', content: 'You are a product data extraction assistant. Return only valid JSON.'},
        {role: 'user', content: prompt}
      ],
      temperature: 0.1,
      max_tokens: 500
    };

    const options = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + OPENAI_API_KEY,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(apiUrl, options);
    const statusCode = response.getResponseCode();

    if (statusCode !== 200) {
      Logger.log('OpenAI API error: ' + statusCode + ' - ' + response.getContentText());
      return null;
    }

    const result = JSON.parse(response.getContentText());
    const content = result.choices[0].message.content;

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      Logger.log('No JSON found in response');
      return null;
    }

    const extractedData = JSON.parse(jsonMatch[0]);

    // Also set vendor = brand_name
    if (extractedData.brand_name) {
      extractedData.vendor = extractedData.brand_name;
    }

    return extractedData;

  } catch (error) {
    Logger.log('AI extraction error: ' + error);
    return null;
  }
}

function writeDataToSheet(sheet, rowNum, data) {
  // Map extracted data to columns and write
  const updates = [
    {col: COLUMNS.BRAND, value: data.brand_name},
    {col: COLUMNS.VENDOR, value: data.vendor},
    {col: COLUMNS.RANGE, value: data.range},
    {col: COLUMNS.STYLE, value: data.style},
    {col: COLUMNS.MOUNTING_TYPE, value: data.mounting_type},
    {col: COLUMNS.COLOUR_FINISH, value: data.colour_finish},
    {col: COLUMNS.MATERIAL, value: data.material},
    {col: COLUMNS.HANDLE_TYPE, value: data.handle_type},
    {col: COLUMNS.HANDLE_COUNT, value: data.handle_count},
    {col: COLUMNS.SWIVEL_SPOUT, value: data.swivel_spout},
    {col: COLUMNS.CARTRIDGE_TYPE, value: data.cartridge_type},
    {col: COLUMNS.WATERMARK_CERT, value: data.watermark_certification},
    {col: COLUMNS.LEAD_FREE, value: data.lead_free_compliance},
    {col: COLUMNS.APPLICATION, value: data.application_location}
  ];

  for (let i = 0; i < updates.length; i++) {
    const update = updates[i];
    if (update.value && update.value !== null && update.value !== '') {
      sheet.getRange(rowNum, update.col).setValue(update.value);
    }
  }

  Logger.log('✅ Wrote ' + Object.keys(data).length + ' fields to row ' + rowNum);
}

// ============================================================================
// SETTINGS
// ============================================================================

function showSettings() {
  const ui = SpreadsheetApp.getUi();
  const hasKey = OPENAI_API_KEY && OPENAI_API_KEY !== 'YOUR_OPENAI_API_KEY_HERE';

  ui.alert(
    '⚙️ Settings',
    'OpenAI API Key: ' + (hasKey ? '✅ Configured' : '❌ Not set') + '\n' +
    'Batch Size: ' + BATCH_SIZE + '\n' +
    'Delay Between Batches: ' + (DELAY_BETWEEN_BATCHES/1000) + 's\n\n' +
    'To change settings, edit the script.',
    ui.ButtonSet.OK
  );
}
