# Deploy Import/Export CSV Feature to PythonAnywhere

## 🚀 Changes Made
- Added Export CSV and Import CSV buttons to all collection pages
- Export functionality: Downloads all products with key fields (SKU, Title, Vendor, Quality Score)
- Import functionality: Bulk upload CSV to update existing products or create new ones
- Backend API endpoint already exists at `/api/{collection}/products/import`

## 📦 Files Modified
1. `templates/collection/base.html` - Added buttons to action bar (lines 2214-2220)
2. `static/js/collection/base.js` - Added 3 new functions (~220 lines at end of file):
   - `exportToCSV()` - Export all products to CSV
   - `showImportModal()` - Display import modal dialog
   - `startImport()` - Handle CSV upload and processing

## 🔄 PythonAnywhere Deployment Steps

### Step 1: Open PythonAnywhere Bash Console
```bash
# Navigate to your project directory
cd ~/Cass-Brothers_PIM
```

### Step 2: Pull Latest Changes from GitHub
```bash
# Pull the latest code (commit e5fb6c4)
git pull origin main

# Verify you got the import CSV changes
git log --oneline -1
# Should show: e5fb6c4 Add: Import and Export CSV buttons to all collection pages
```

### Step 3: Verify Files Were Updated
```bash
# Check that the button code exists
grep -n "Import CSV" templates/collection/base.html
# Should show line ~2219 with Import CSV button

# Check that JavaScript functions exist
grep -n "function showImportModal" static/js/collection/base.js
# Should show the function around line 9912
```

### Step 4: Reload Your Web App
**Option A: Via Web Interface**
1. Go to PythonAnywhere Web tab
2. Click the green **"Reload"** button for your web app

**Option B: Via Command Line**
```bash
# Touch the WSGI file to trigger reload
touch /var/www/*_pythonanywhere_com_wsgi.py
# Or use your specific WSGI file name
```

### Step 5: Clear Browser Cache
After deploying, you MUST clear your browser cache:
- **Windows**: `Ctrl + Shift + R`
- **Mac**: `Cmd + Shift + R`
- **Or**: Open DevTools (F12) → Network tab → Check "Disable cache"

## ✅ Verification Steps

### 1. Check the UI
1. Navigate to any collection page (Sinks, Taps, Lighting, etc.)
2. Look for two new buttons in the action bar:
   - **"Export CSV"** button (with download icon)
   - **"Import CSV"** button (with upload icon)

### 2. Test Export Functionality
1. Click the "Export CSV" button
2. Should download a file named `{collection}_export_{date}.csv`
3. Open the CSV to verify it contains: Row, SKU, Title, Vendor, Quality Score

### 3. Test Import Functionality
1. Click the "Import CSV" button
2. Should see a modal with:
   - Instructions for CSV format
   - File upload input
   - "Start Import" button
3. Try uploading a CSV file:
   - Should show progress bar
   - Should display results (updated/created/skipped/errors)
   - Should auto-reload the page after 2 seconds

### 4. Check Browser Console (F12)
Look for these log messages:
- `📁 Exporting to CSV...` (when clicking Export)
- `📥 Showing import modal...` (when clicking Import)
- `📤 Starting import of file: {filename}` (when uploading)

### 5. Test Backend API
```bash
# Check the import endpoint exists
curl -X POST https://your-app.pythonanywhere.com/api/sinks/products/import \
  -F "file=@test.csv"
# Should return JSON with success status and results
```

## 🐛 Troubleshooting

### Buttons Not Appearing
- **Clear browser cache** (most common issue)
- Check git log shows commit e5fb6c4
- Verify you reloaded the web app
- Check browser console for JavaScript errors
- Verify base.html and base.js were actually updated on server

### Import Not Working
- Check backend API endpoint exists in flask_app.py (line 3354)
- Check Google Sheets API credentials are configured
- Look at PythonAnywhere error logs
- Verify CSV has SKU column (variant_sku, SKU, or sku)

### JavaScript Errors
- Check browser console (F12)
- Verify `allProductsCache` is populated (used by exportToCSV)
- Verify `COLLECTION_NAME` is defined globally
- Verify Bootstrap modal library is loaded (used by showImportModal)

### File Upload Fails
- Check file size limits in PythonAnywhere
- Verify CSV encoding is UTF-8
- Check Flask file upload configuration
- Look at server error logs

## 📊 Expected Behavior

### Export CSV
- Exports all products currently loaded in the collection
- Generates timestamped filename: `{collection}_export_2025-10-13.csv`
- Comma-separated format with proper escaping
- Shows success notification when complete

### Import CSV
1. User uploads CSV file
2. Progress bar shows: "Uploading and processing..." (30%)
3. Backend processes file, matches SKUs, updates/creates products
4. Progress bar shows: "Processing results..." (70%)
5. Progress bar shows: "Complete!" (100%)
6. Results displayed showing counts of updated/created/skipped/errors
7. Page auto-reloads after 2 seconds to show updated data

### CSV Format
**Required Column**: One of these for SKU matching
- `variant_sku`, `SKU`, or `sku`

**Optional Columns** (mapped automatically):
- title, Product Title
- brand_name, Brand, Brand Name
- product_material, Material
- grade_of_material, Grade
- installation_type, Installation Type
- And many more (see flask_app.py line 3444-3514 for full mapping)

## 🔗 Related Files
- Backend API: `flask_app.py` lines 3354-3603
- Frontend Template: `templates/collection/base.html` lines 2214-2220
- Frontend JS: `static/js/collection/base.js` lines 9878-10102

## 📝 Notes
- The backend API endpoint was already implemented (commit c231c4f)
- This deployment only adds the frontend UI buttons and modal
- Import respects existing data (only fills blanks, doesn't overwrite)
- Works for all collection types (sinks, taps, lighting, etc.)

## 🎯 Next Steps After Deployment
1. Test with a small sample CSV first
2. Verify quality scores update after import
3. Check that dimension data auto-populates correctly
4. Monitor error logs for any issues

---
**Deployed**: 2025-10-13
**Commit**: e5fb6c4
**Files Changed**: 2 files, 230+ lines added
