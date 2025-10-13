# 📁 COLLECTION FILES REFERENCE
## What Files to Modify for Each Collection

**Quick reference for which files need collection-specific changes**

---

## 🔴 MUST MODIFY FOR EACH COLLECTION

### 1. `config/collections.py` ⭐⭐⭐
**What**: Collection configuration class
**Changes**:
- Create new class: `YourCollectionCollection(CollectionConfig)`
- Define `ai_extraction_fields` list
- Define `quality_fields` list
- Create `column_mapping` dict (field names → column numbers)
- Set `extract_images` flag
- Set `pricing_enabled` flag
- Register in `COLLECTIONS` dict

**Example**:
```python
class ShowerScreensCollection(CollectionConfig):
    def setup_fields(self):
        self.extract_images = True
        self.ai_extraction_fields = ['sku', 'title', 'frame_type', ...]
        self.quality_fields = ['brand_name', 'frame_type', ...]
        self.column_mapping = {
            'variant_sku': 2,
            'title': 6,
            'frame_type': 8,
            # ... all fields
        }

COLLECTIONS = {
    'shower_screens': ShowerScreensCollection(...),
}
```

---

### 2. `core/ai_extractor.py` ⭐⭐⭐
**What**: AI extraction and description prompts
**Changes**:
- Add extraction prompt function: `_build_{collection}_extraction_prompt()`
- Add description prompt function: `_build_{collection}_description_prompt()`
- Add features prompt function: `_build_{collection}_features_prompt()`
- Add care prompt function: `_build_{collection}_care_prompt()`
- Register in `extraction_prompts` dict (line ~42)
- Register in `description_prompts` dict (line ~49)
- Register in `chatgpt_features_prompts` dict (line ~56)
- Register in `chatgpt_care_prompts` dict (line ~62)

**Lines to modify**:
- ~42: Add to `self.extraction_prompts`
- ~49: Add to `self.description_prompts`
- ~56: Add to `self.chatgpt_features_prompts`
- ~62: Add to `self.chatgpt_care_prompts`
- ~500+: Add your 4 prompt functions at end

---

### 3. `templates/collection/{collection}.html` ⭐⭐⭐
**What**: Collection-specific template with edit modal
**Changes**:
- Copy `templates/collection/sinks.html` as starting point
- Modify `{% block extra_styles %}` for collection-specific CSS
- Completely rewrite `{% block collection_modal %}` with your fields
- Field IDs must match `column_mapping` keys with "edit" prefix
- Update field groups, labels, and input types

**Key sections**:
```html
{% block extra_styles %}
  /* Your CSS */
{% endblock %}

{% block collection_modal %}
  <!-- Your edit modal -->
  <input id="editFieldName">  <!-- matches column_mapping['field_name'] -->
{% endblock %}
```

---

### 4. Google Apps Script ⭐⭐⭐
**What**: Data cleaning and standardization script
**Changes**:
- Copy `static/rulebase.gs` as template
- Update `QUALITY_SCORE_FIELDS` array (line ~15)
- Update column numbers in `processRowSafely()` (line ~200+)
- Update rule sheet loading (line ~180)
- Add collection-specific calculated fields
- Add collection-specific boolean logic
- Update field mappings to match your columns

**Critical sections**:
```javascript
// Line ~15: Update quality fields
const QUALITY_SCORE_FIELDS = [
  'brand_name',
  'your_field1',
  'your_field2',
  // ... your fields
];

// Line ~200+: Update column mappings
const title = row[5];          // Column F
const vendor = row[6];         // Column G
const yourField1 = row[7];     // Column H (update!)
```

---

### 5. `.env` file ⭐⭐
**What**: Environment configuration
**Changes**:
- Add `{COLLECTION_KEY}_SPREADSHEET_ID=your_id_here`
- Optional: Add `GOOGLE_SCRIPTS_{COLLECTION_KEY}_WEBHOOK_URL=`

**Example**:
```bash
SHOWER_SCREENS_SPREADSHEET_ID=1abc123...
GOOGLE_SCRIPTS_SHOWER_SCREENS_WEBHOOK_URL=https://script.google.com/...
```

---

### 6. Google Sheets ⭐⭐⭐
**What**: Data storage spreadsheet
**Changes**:
- Create new Google Spreadsheet
- Add worksheet "Raw_Data"
- Define all columns (A-G system, H+ custom, BE+ standard)
- Create rule sheets (Material_Rules, Type_Rules, etc.)
- Note spreadsheet ID for `.env`

---

## 🟡 OPTIONAL/CONDITIONAL MODIFICATIONS

### 7. `core/google_apps_script_manager.py`
**When**: If using webhook integration
**Changes**: Add to `script_configs` dict (line ~24)

```python
self.script_configs = {
    'sinks': {...},
    'your_collection': {
        'script_id': self.settings.GOOGLE_SCRIPTS.get('YOUR_COLLECTION_SCRIPT_ID'),
        'webhook_url': self.settings.GOOGLE_SCRIPTS.get('YOUR_COLLECTION_WEBHOOK_URL')
    }
}
```

---

### 8. Pricing Sheet (Google Sheets)
**When**: If `pricing_enabled = True`
**Changes**:
- Create separate pricing spreadsheet
- Add to `pricing_sheet_id` in collection config
- Configure `pricing_lookup_config` column numbers

---

## 🟢 NO CHANGES NEEDED (Auto-Adapts)

### Files that work automatically:
- ✅ `flask_app.py` - Routes auto-register via collection registry
- ✅ `templates/collection/base.html` - Shared base template
- ✅ `static/js/collection/base.js` - JavaScript adapts via COLLECTION_NAME
- ✅ `core/sheets_manager.py` - Uses column_mapping dynamically
- ✅ `core/data_processor.py` - Uses collection config dynamically
- ✅ CSV import/export - Uses column_mapping dynamically

---

## 📋 FILE MODIFICATION CHECKLIST

Copy this for each new collection:

```
Configuration Files:
[ ] config/collections.py - Create collection class
[ ] config/collections.py - Register in COLLECTIONS dict
[ ] .env - Add SPREADSHEET_ID variable
[ ] .env - Add WEBHOOK_URL (optional)

AI/Backend Files:
[ ] core/ai_extractor.py - Add extraction prompt
[ ] core/ai_extractor.py - Add description prompt
[ ] core/ai_extractor.py - Add features prompt
[ ] core/ai_extractor.py - Add care prompt
[ ] core/ai_extractor.py - Register in extraction_prompts
[ ] core/ai_extractor.py - Register in description_prompts
[ ] core/google_apps_script_manager.py - Add webhook config (optional)

Frontend Files:
[ ] templates/collection/{collection}.html - Create template
[ ] templates/collection/{collection}.html - Update modal fields
[ ] templates/collection/{collection}.html - Update CSS

Google Workspace:
[ ] Create Google Spreadsheet
[ ] Add Raw_Data worksheet with columns
[ ] Create rule sheets
[ ] Copy spreadsheet ID to .env
[ ] Create Apps Script project
[ ] Copy and adapt rulebase.gs
[ ] Update column numbers in script
[ ] Update quality fields in script
[ ] Update calculated fields logic
[ ] Deploy as web app (optional)
[ ] Copy webhook URL to .env (optional)
```

---

## 🎯 CRITICAL COLUMN NUMBER MAPPING

**Most Common Mistake**: Column numbers don't match between files

Verify these match **exactly**:

1. **Google Sheet** - Actual column letters (A=1, B=2, C=3...)
2. **config/collections.py** - `column_mapping` dict
3. **templates/collection/{collection}.html** - Field IDs
4. **Google Apps Script** - Row index references (remember row[5] = column F)

Example:
```
Google Sheet Column H (8) = "frame_type"
↓
config/collections.py: 'frame_type': 8
↓
Template: <input id="editFrameType">
↓
Apps Script: const frameType = row[7]  // row is 0-indexed!
```

---

## 📊 FILE SIZE ESTIMATES

Typical lines of code per collection:

| File | New Lines | Modify Lines | Time |
|------|-----------|--------------|------|
| `collections.py` | ~150 | ~10 | 1-2h |
| `ai_extractor.py` | ~200 | ~20 | 2-3h |
| `{collection}.html` | ~800 | ~50 | 3-5h |
| Apps Script | ~2000 | ~500 | 4-6h |
| `.env` | ~2 | ~0 | 5min |

**Total**: ~3,150 new lines, ~580 modified lines per collection

---

## 🔍 FIND & REPLACE GUIDE

When copying an existing collection as template:

1. Collection name: `Sinks` → `YourCollection`
2. Collection key: `sinks` → `your_collection`
3. Collection variable: `SINKS` → `YOUR_COLLECTION`
4. Field names: `bowl_width_mm` → `your_field_name`
5. Column numbers: `row[25]` → `row[YOUR_COLUMN - 1]`

---

## 🆘 DEBUGGING FILE ISSUES

**Collection doesn't load**:
1. Check `collections.py` - Collection registered?
2. Check `.env` - Spreadsheet ID set?
3. Check Flask logs - Import errors?

**AI extraction fails**:
1. Check `ai_extractor.py` - Prompt function exists?
2. Check `ai_extractor.py` - Registered in dict?
3. Check `collections.py` - ai_extraction_fields defined?

**Modal fields don't save**:
1. Check template - Field IDs match column_mapping keys?
2. Check `collections.py` - All fields in column_mapping?
3. Check browser console - JavaScript errors?

**Apps Script fails**:
1. Check Apps Script - Column numbers match?
2. Check Apps Script - Quality fields match config?
3. Check Apps Script execution log - Errors?

---

## 📞 REFERENCE EXAMPLES

**Best reference collections**:
- **Sinks**: Most complete, has all features
- **Taps**: Simpler structure, good for learning
- **Lighting**: Medium complexity

**Files to study**:
- `config/collections.py` lines 51-190 (SinksCollection)
- `core/ai_extractor.py` lines 500-1200 (Sinks prompts)
- `templates/collection/sinks.html` (Full modal)
- `static/rulebase.gs` (Apps Script example)

---

**Pro Tip**: When creating a new collection, open these 4 files side-by-side:
1. `config/collections.py` (your config)
2. `core/ai_extractor.py` (your prompts)
3. `templates/collection/{collection}.html` (your modal)
4. Google Apps Script (your cleaning logic)

This lets you verify field names match across all files as you build!

---

**Last Updated**: 2025-10-13
