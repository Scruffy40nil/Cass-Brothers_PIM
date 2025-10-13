# 🔍 COMPLETE COLLECTION SYSTEM AUDIT
## Comprehensive Guide to How Collections Work & What to Change for New Collections

**Last Updated**: 2025-10-13
**Purpose**: Document every feature, data flow, and configuration needed for adding new collections

---

## 📋 TABLE OF CONTENTS

1. [System Overview](#system-overview)
2. [Data Flow Architecture](#data-flow-architecture)
3. [Collection Page Features](#collection-page-features)
4. [Configuration Files](#configuration-files)
5. [New Collection Setup Checklist](#new-collection-setup-checklist)
6. [Feature-by-Feature Breakdown](#feature-by-feature-breakdown)
7. [Google Apps Script Integration](#google-apps-script-integration)

---

## 🏗️ SYSTEM OVERVIEW

### What is a Collection?
A **collection** is a product category (Sinks, Taps, Lighting, etc.) with:
- **Unique Google Sheet** - Different columns, different data structure
- **Unique App Script** - Different data cleaning rules per collection
- **Unique AI Extraction** - Different fields extracted per product type
- **Unique Field Mapping** - Each collection tracks different attributes

### Current Collections
| Collection | Spreadsheet | Template | App Script | Status |
|------------|-------------|----------|------------|--------|
| Sinks & Tubs | ✅ | `sinks.html` | `rulebase.gs` | Active |
| Taps & Faucets | ✅ | `taps.html` | TBD | Active |
| Lighting | ✅ | `lighting.html` | TBD | Active |
| Shower Mixers | ✅ | `shower_mixers.html` | TBD | Active |
| Bathroom Vanities | ✅ | `bathroom_vanities.html` | TBD | Active |

---

## 🔄 DATA FLOW ARCHITECTURE

```
┌──────────────────┐
│  Supplier URLs   │  ← User provides product URLs
└────────┬─────────┘
         │
         ↓
┌──────────────────────────────────────────────────────────┐
│  AI EXTRACTION STAGE (OpenAI GPT-4 Vision)               │
│                                                           │
│  1. Fetch webpage content & images                       │
│  2. Extract fields based on collection config            │
│     • Sinks: installation_type, material, dimensions...  │
│     • Taps: tap_type, finish, flow_rate...              │
│     • Lighting: bulb_type, wattage, IP_rating...        │
│  3. AI Image Extraction (if enabled)                     │
│  4. Save to Google Sheets Raw_Data                       │
└────────┬─────────────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────────────┐
│  GOOGLE SHEETS STORAGE                                    │
│                                                           │
│  • Each collection = separate spreadsheet                 │
│  • Different columns per collection                       │
│  • Checkbox column (BE) triggers cleaning                 │
└────────┬─────────────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────────────┐
│  GOOGLE APPS SCRIPT CLEANING (Collection-Specific)       │
│                                                           │
│  • Runs rulebase.gs (or equivalent per collection)       │
│  • Standardizes values using rule sheets                  │
│  • Auto-calculates dimensions                             │
│  • Sets boolean flags                                     │
│  • Highlights non-standard values                         │
└────────┬─────────────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────────────┐
│  DESCRIPTION GENERATION (ChatGPT / OpenAI)               │
│                                                           │
│  • body_html: Main product description                    │
│  • features: Bullet points of key features                │
│  • care_instructions: Maintenance guidance                │
│  • faqs: AI-generated Q&A                                 │
└────────┬─────────────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────────────┐
│  PRICING COMPARISON (Caprice - Optional)                 │
│                                                           │
│  • Loads from separate pricing sheet                      │
│  • Compares our price vs competitors                      │
│  • Shows price differences                                │
└────────┬─────────────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────────────┐
│  COLLECTION PAGE UI (Flask + JavaScript)                 │
│                                                           │
│  • Displays products in cards                             │
│  • Shows quality scores                                   │
│  • Allows editing/export/import                           │
└────────┬─────────────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────────────┐
│  SHOPIFY SYNC (Future)                                    │
│                                                           │
│  • Syncs cleaned data to Shopify store                    │
│  • Updates product listings                               │
└───────────────────────────────────────────────────────────┘
```

---

## 🎨 COLLECTION PAGE FEATURES

### 1. **Product Card Display**
**Location**: `templates/collection/base.html` + `templates/collection/{collection}.html`

**What it shows**:
- Product image (first from `shopify_images`)
- Title
- SKU
- Brand/Vendor
- Quality Score (colored badge)
- Status (active/draft)
- Select checkbox

**Collection-Specific**:
- ✅ **Modal fields change per collection** (different attributes shown)
- ✅ **Quality fields differ** (what counts toward completion)

---

### 2. **Action Buttons** (Top of Page)

| Button | Function | Collection-Specific? | File |
|--------|----------|---------------------|------|
| **Add Product** | Opens modal to add product URLs | ❌ Universal | `base.html:2194` |
| **Missing Some Info** | Filter by incomplete fields | ✅ Fields differ | `base.html:2198` |
| **Export Selected** | Export selected products | ❌ Universal | `base.html:2202` |
| **Import CSV** | Bulk import/update products | ⚠️ Column mapping differs | `base.html:2206` |
| **Clear Selection** | Uncheck all selected products | ❌ Universal | `base.html:2210` |

---

### 3. **Add Products Modal (Bulk URL Entry)**
**Location**: `templates/collection/modals/add_product_modal.html`

**Process**:
1. User pastes URLs (one per line or comma-separated)
2. System validates URLs
3. Sends to AI extraction endpoint
4. Shows progress: Pending → Extracting → Generating → Cleaning
5. Auto-refreshes when complete

**Collection-Specific**:
- ✅ **AI Extraction Prompt** - Different fields extracted per collection
- ✅ **AI Extraction Fields** - Defined in `config/collections.py`

**Configuration Required**:
```python
# config/collections.py - ai_extraction_fields
'sinks': ['sku', 'title', 'brand_name', 'installation_type', 'material', ...]
'taps': ['sku', 'title', 'brand_name', 'tap_type', 'finish', ...]
'lighting': ['sku', 'title', 'brand_name', 'light_type', 'wattage', ...]
```

---

### 4. **AI Image Extraction**
**Location**: `core/ai_extractor.py` + `static/js/collection/base.js`

**Process**:
1. AI analyzes product page images
2. Extracts only product images (not logos, banners, etc.)
3. Downloads images to local storage
4. Stores URLs in `shopify_images` column

**Collection-Specific**:
- ✅ **Enabled per collection** via `extract_images` flag
- ❌ **Extraction logic is universal**

**Configuration**:
```python
# config/collections.py
self.extract_images = True  # Enable for this collection
```

---

### 5. **AI Description Generation**
**Location**: `core/ai_extractor.py` + Flask endpoints

**Generates**:
- `body_html` - Main product description (HTML formatted)
- `features` - Bullet-pointed key features
- `care_instructions` - Cleaning and maintenance guide
- `faqs` - AI-generated Q&A

**Collection-Specific**:
- ✅ **Unique prompts per collection**
- ✅ **Uses different product fields** for context
- ✅ **Industry-specific terminology**

**Configuration Required**:
```python
# core/ai_extractor.py - Build prompts per collection
def _build_sinks_description_prompt(self, data):
    # Uses sink-specific fields: installation_type, bowls_number, etc.

def _build_taps_description_prompt(self, data):
    # Uses tap-specific fields: spout_type, flow_rate, etc.
```

---

### 6. **Quality Score**
**Location**: Google Sheets formula + `config/collections.py`

**How it works**:
- Counts completed fields vs. total quality fields
- Formula: `(filled_fields / total_fields) * 100`
- Color-coded: 90%+ green, 70-89% yellow, 50-69% light red, <50% dark red

**Collection-Specific**:
- ✅ **Different fields per collection**
- ✅ **Different total field count**

**Configuration**:
```python
# config/collections.py - quality_fields
'sinks': ['brand_name', 'installation_type', 'material', 'dimensions', ...]  # 23 fields
'taps': ['brand_name', 'tap_type', 'finish', 'flow_rate', ...]  # 18 fields
```

---

### 7. **Missing Info Filter**
**Location**: `templates/collection/base.html` + Modal

**Process**:
1. Analyzes all products
2. Counts missing fields per category
3. Shows badges with counts
4. Click badge → filter to only products missing that field

**Collection-Specific**:
- ✅ **Field categories differ** (e.g., Sinks has "Dimensions", Taps has "Flow")
- ✅ **Critical fields differ** per collection

**Configuration**:
Done via `quality_fields` in collection config.

---

### 8. **Product Edit Modal**
**Location**: `templates/collection/{collection}.html` (each collection has unique modal)

**Fields Displayed**:
- Collection-specific fields (differs per product type)
- Image gallery with navigation
- Pricing fields (if enabled)
- Content tabs (Description, Features, Care Instructions, FAQs)

**Collection-Specific**:
- ✅ **Completely different fields**
- ✅ **Different validation rules**
- ✅ **Different field groups/sections**

**Example**:
- **Sinks Modal**: installation_type, bowls_number, drain_position, bowl dimensions
- **Taps Modal**: tap_type, spout_type, flow_rate, aerator_type
- **Lighting Modal**: bulb_type, wattage, lumens, IP_rating

---

### 9. **Pricing Comparison (Caprice)**
**Location**: Pricing modal in collection page

**Process**:
1. Loads pricing data from separate Google Sheet
2. Compares your price vs. competitor prices
3. Shows: Current price, Competitor name, Competitor price, Last updated

**Collection-Specific**:
- ✅ **Enabled per collection** via `pricing_enabled` flag
- ✅ **Pricing sheet ID per collection**
- ⚠️ **Column mappings may differ**

**Configuration**:
```python
# config/collections.py
self.pricing_enabled = True
self.pricing_sheet_id = "1Kky3LE5qBgyeA7G-7g2pvfjDjoeRfRg1NQL7XiF8ToU"
self.pricing_lookup_config = {
    'sku_column': 6,
    'our_price_column': 10,
    'competitor_price_column': 25,
}
```

---

### 10. **CSV Import/Export**
**Location**: `templates/collection/base.html` + `flask_app.py:3354-3603`

**Export**: Downloads all products with key fields
**Import**:
- Matches by SKU
- Updates existing products
- Creates new products
- Smart column mapping (handles variations like "SKU" vs "variant_sku")

**Collection-Specific**:
- ✅ **Column mappings differ** per collection
- ✅ **Field validation differs**
- ✅ **Available fields differ**

**Configuration**:
Field mapping in `flask_app.py` maps CSV column names to internal fields based on `column_mapping` from collection config.

---

### 11. **Google Apps Script Cleaning**
**Location**: `static/rulebase.gs` (Sinks example)

**What it does**:
1. Triggered by checkbox in column BE or webhook
2. Standardizes values using rule sheets
3. Auto-calculates dimensions from lookup tables
4. Sets boolean flags (e.g., is_undermount, is_topmount)
5. Highlights non-standard values in red
6. Updates quality score

**Collection-Specific**:
- ✅ **Completely different script per collection**
- ✅ **Different rule sheets** (Material_Rules, Installation_Rules, etc.)
- ✅ **Different calculated fields**
- ✅ **Different boolean logic**

**Rule Sheets Per Collection**:
- Sinks: Material_Rules, Installation_Rules, Style_Rules, Grade_Rules, Drain_Rules, Location_Rules, Warranty_Rules
- Taps: Material_Rules, Finish_Rules, Type_Rules, Mounting_Rules, etc.
- Lighting: Type_Rules, Bulb_Rules, Mounting_Rules, etc.

---

## ⚙️ CONFIGURATION FILES

### 1. **Main Collection Config** - `config/collections.py`

**What it defines**:
- Collection name and description
- Google Sheets spreadsheet ID
- Worksheet name (usually "Raw_Data")
- Column mappings (field name → column number)
- AI extraction fields
- Quality score fields
- Pricing configuration (if enabled)
- Image extraction enabled/disabled

**Collection-Specific**: ✅ **EVERYTHING**

**Example Structure**:
```python
class SinksCollection(CollectionConfig):
    def setup_fields(self):
        # Enable/disable features
        self.extract_images = True
        self.pricing_enabled = True

        # What fields AI should extract
        self.ai_extraction_fields = [
            'sku', 'title', 'brand_name', 'installation_type',
            'product_material', 'bowls_number', ...
        ]

        # What fields count toward quality score
        self.quality_fields = [
            'brand_name', 'installation_type', 'material',
            'dimensions', 'warranty_years', ...
        ]

        # Map field names to column numbers
        self.column_mapping = {
            'variant_sku': 2,      # Column B
            'title': 6,            # Column F
            'vendor': 7,           # Column G
            'installation_type': 9, # Column I
            # ... 60+ more mappings
        }

        # Pricing configuration (optional)
        self.pricing_fields = {...}
        self.pricing_sheet_id = "..."
```

---

### 2. **Environment Variables** - `.env`

**Collection-Specific Variables**:
```bash
# Spreadsheet IDs (one per collection)
SINKS_SPREADSHEET_ID=1abc...
TAPS_SPREADSHEET_ID=2def...
LIGHTING_SPREADSHEET_ID=3ghi...

# Google Apps Script URLs (optional - for webhook integration)
GOOGLE_SCRIPTS_SINKS_WEBHOOK_URL=https://script.google.com/...
GOOGLE_SCRIPTS_TAPS_WEBHOOK_URL=https://script.google.com/...
```

---

### 3. **AI Extraction Prompts** - `core/ai_extractor.py`

**What it defines**:
- Collection-specific extraction prompts
- Collection-specific description prompts
- Collection-specific features prompts
- Collection-specific care prompts

**Collection-Specific**: ✅ **EVERYTHING**

**Example**:
```python
def _build_sinks_extraction_prompt(self, url, html_content):
    return f"""
    Extract information for a KITCHEN/BATHROOM SINK from: {url}

    Fields to extract:
    - installation_type (Undermount/Topmount/Flushmount)
    - bowls_number (1, 2, or 3)
    - material (Stainless Steel, Granite, etc.)
    - dimensions in mm (length, width, depth)
    ...
    """

def _build_taps_extraction_prompt(self, url, html_content):
    return f"""
    Extract information for a KITCHEN/BATHROOM TAP from: {url}

    Fields to extract:
    - tap_type (Mixer, Separate, Pillar, Wall Mounted)
    - spout_type (High Spout, Low Spout, Pull Out)
    - finish (Chrome, Brushed Nickel, Matte Black)
    ...
    """
```

---

### 4. **Collection Template** - `templates/collection/{collection}.html`

**What it defines**:
- Modal structure with collection-specific fields
- Custom CSS for collection-specific UI
- Field grouping and layout

**Collection-Specific**: ✅ **EVERYTHING**

**Key Sections**:
```html
{% extends "collection/base.html" %}

{% block extra_styles %}
/* Sinks-specific styles */
.sink-dimensions { ... }
.bowl-dimensions { ... }
{% endblock %}

{% block collection_modal %}
<!-- Sinks-specific edit modal -->
<div id="editModal">
  <!-- Installation Type -->
  <select id="editInstallationType">
    <option>Undermount</option>
    <option>Topmount</option>
  </select>

  <!-- Bowl Dimensions -->
  <input id="editBowlWidth" placeholder="Bowl Width (mm)">
  <input id="editBowlDepth" placeholder="Bowl Depth (mm)">

  <!-- Sinks-specific fields -->
</div>
{% endblock %}
```

---

### 5. **Google Apps Script** - `static/rulebase.gs` (example)

**What it does**:
- Data cleaning and standardization
- Auto-calculation of fields
- Validation and highlighting

**Collection-Specific**: ✅ **EVERYTHING**

**Key Functions**:
```javascript
// Collection-specific rule sheets
const warrantyRules = loadRulesFromSheet(spreadsheet, 'Warranty_Rules');
const materialRules = loadRulesFromSheet(spreadsheet, 'Material_Rules');

// Collection-specific calculations
const cabinetSize = calculateCabinetSize(widthMm);  // Sinks only
const flowRate = calculateFlowRate(pressure);        // Taps only
const lumens = calculateLumens(wattage);             // Lighting only

// Collection-specific boolean logic
const isUndermount = installationType.includes('UNDERMOUNT');
const isPullOut = spoutType.includes('PULL OUT');
const isDimmable = features.includes('DIMMABLE');
```

---

## 📝 NEW COLLECTION SETUP CHECKLIST

### Phase 1: Planning & Google Sheets Setup

- [ ] **1.1 Define Collection Requirements**
  - Product type name (e.g., "Shower Screens")
  - Key attributes to track (e.g., frame_type, glass_thickness, width_mm, height_mm)
  - Quality fields (what matters for completeness)
  - AI extraction needs (what to pull from supplier sites)

- [ ] **1.2 Create Google Spreadsheet**
  - Create new Google Sheet
  - Name worksheet "Raw_Data"
  - Define columns:
    - A-G: System fields (url, variant_sku, key, id, handle, title, vendor)
    - H+: Collection-specific fields
    - BE: Checkbox column (selected)
  - Set up Rule Sheets (Material_Rules, Type_Rules, etc.)
  - Note down Spreadsheet ID

- [ ] **1.3 Create Dimension Map Sheet (Optional)**
  - If you need auto-dimension population
  - Create "Dimension_Map" worksheet
  - Columns: Key, Title, Length, Width, Depth

---

### Phase 2: Backend Configuration

- [ ] **2.1 Add to Environment Variables** (`.env`)
  ```bash
  # Add spreadsheet ID
  {COLLECTION}_SPREADSHEET_ID=your_spreadsheet_id_here

  # Optional: Add webhook URL (after Apps Script setup)
  GOOGLE_SCRIPTS_{COLLECTION}_WEBHOOK_URL=
  ```

- [ ] **2.2 Create Collection Class** (`config/collections.py`)
  ```python
  class NewCollection(CollectionConfig):
      def setup_fields(self):
          self.extract_images = True/False
          self.pricing_enabled = True/False

          self.ai_extraction_fields = [
              # Fields AI should extract from supplier sites
          ]

          self.quality_fields = [
              # Fields that count toward quality score
          ]

          self.column_mapping = {
              # field_name: column_number
              'variant_sku': 2,
              'title': 6,
              # ... all your fields
          }
  ```

- [ ] **2.3 Register Collection** (`config/collections.py`)
  ```python
  COLLECTIONS = {
      'collection_key': NewCollection(
          name='Display Name',
          description='Short description',
          spreadsheet_id=os.environ.get('COLLECTION_SPREADSHEET_ID', ''),
          worksheet_name='Raw_Data',
          checkbox_column='selected'
      )
  }
  ```

- [ ] **2.4 Create AI Extraction Prompts** (`core/ai_extractor.py`)
  - Add `_build_{collection}_extraction_prompt()`
  - Add `_build_{collection}_description_prompt()`
  - Add `_build_{collection}_features_prompt()`
  - Add `_build_{collection}_care_prompt()`
  - Register in `extraction_prompts` and `description_prompts` dicts

---

### Phase 3: Frontend Setup

- [ ] **3.1 Create Collection Template** (`templates/collection/{collection}.html`)
  - Copy from `templates/collection/sinks.html` as template
  - Modify modal fields for your collection
  - Update CSS for collection-specific styling
  - Update field IDs and labels

- [ ] **3.2 Create/Update Modal Sections**
  - Image section (universal)
  - Collection-specific fields grouped logically
  - Pricing section (if pricing_enabled)
  - Content tabs (Description, Features, Care, FAQs)

- [ ] **3.3 Register Route in Flask** (`flask_app.py`)
  - Route should auto-register via collection registry
  - Test: Visit `/collection/{collection_key}`

---

### Phase 4: Google Apps Script

- [ ] **4.1 Create Apps Script Project**
  - Open Google Sheet
  - Extensions → Apps Script
  - Name project: "{Collection} PIM Data Processor"

- [ ] **4.2 Adapt rulebase.gs**
  - Copy `static/rulebase.gs` as template
  - Update `QUALITY_SCORE_FIELDS` for your collection
  - Create rule sheets (Material_Rules, Type_Rules, etc.)
  - Update `processRowSafely()` function:
    - Map to your column numbers
    - Add collection-specific logic
    - Update calculated fields
    - Update boolean flags

- [ ] **4.3 Create Rule Sheets**
  - Material_Rules (Search Term → Standard Name)
  - Type_Rules (Search Term → Standard Name)
  - Finish_Rules (Search Term → Standard Name)
  - Warranty_Rules (Brand Name → Warranty Years)
  - Any other standardization needed

- [ ] **4.4 Setup Triggers**
  - Add `onEdit` trigger for checkbox column
  - Optional: Deploy as web app for webhook integration

---

### Phase 5: Testing & Validation

- [ ] **5.1 Test AI Extraction**
  - Go to `/collection/{collection_key}`
  - Click "Add Product"
  - Paste test supplier URLs
  - Verify fields extract correctly
  - Check images extract correctly (if enabled)

- [ ] **5.2 Test Apps Script Cleaning**
  - Check checkbox in column BE
  - Verify rule-based cleaning works
  - Verify calculated fields populate
  - Verify highlights appear for non-standard values

- [ ] **5.3 Test Description Generation**
  - Click "Generate Description" on a product
  - Verify context is collection-appropriate
  - Check all 4 sections generate (body_html, features, care, faqs)

- [ ] **5.4 Test Quality Score**
  - Verify quality score formula in Google Sheets
  - Check colors apply correctly
  - Verify count matches expected fields

- [ ] **5.5 Test CSV Import/Export**
  - Export sample data
  - Modify CSV
  - Import back
  - Verify updates apply correctly

- [ ] **5.6 Test Pricing (if enabled)**
  - Create pricing sheet
  - Configure lookup columns
  - Verify prices load correctly

---

### Phase 6: Deployment

- [ ] **6.1 Commit Code**
  ```bash
  git add .
  git commit -m "Add: {Collection} collection support"
  git push origin main
  ```

- [ ] **6.2 Deploy to PythonAnywhere**
  ```bash
  cd ~/Cass-Brothers_PIM
  git pull origin main
  touch /var/www/*_wsgi.py
  ```

- [ ] **6.3 Configure Environment Variables**
  - Add spreadsheet ID to PythonAnywhere environment
  - Add webhook URL (if using)
  - Reload web app

- [ ] **6.4 Verify Collection Accessible**
  - Visit `https://your-app.pythonanywhere.com/collection/{collection_key}`
  - Test all features

---

## 🔧 FEATURE-BY-FEATURE BREAKDOWN

### Feature: **AI Extraction from Supplier URLs**

**Files Involved**:
- `core/ai_extractor.py` - AI extraction logic
- `config/collections.py` - Field definitions
- `templates/collection/modals/add_product_modal.html` - UI
- `static/js/collection/add_products.js` - Frontend logic
- `flask_app.py` - API endpoint `/api/<collection>/process/extract`

**Collection-Specific Parts**:
1. **AI Extraction Prompt** (`core/ai_extractor.py`)
   - Function: `_build_{collection}_extraction_prompt()`
   - Needs: Collection-specific field descriptions

2. **Field List** (`config/collections.py`)
   - Property: `ai_extraction_fields`
   - Example: `['sku', 'title', 'brand_name', 'installation_type', ...]`

3. **Column Mapping** (`config/collections.py`)
   - Property: `column_mapping`
   - Maps field names to Google Sheets columns

**What to Change for New Collection**:
- ✅ Add extraction prompt function in `ai_extractor.py`
- ✅ Define `ai_extraction_fields` list in collection config
- ✅ Create `column_mapping` for your fields

---

### Feature: **AI Image Extraction**

**Files Involved**:
- `core/ai_extractor.py` - Image extraction logic
- `config/collections.py` - Enable/disable flag
- `flask_app.py` - API endpoint `/api/<collection>/process/extract-images`

**Collection-Specific Parts**:
1. **Enable Flag** (`config/collections.py`)
   - Property: `extract_images = True/False`

2. **Image Column** (`config/collections.py`)
   - Must have `shopify_images` in `column_mapping`

**What to Change for New Collection**:
- ✅ Set `extract_images = True` in collection config
- ✅ Add `shopify_images` to column mapping

---

### Feature: **AI Description Generation**

**Files Involved**:
- `core/ai_extractor.py` - Description generation logic
- `config/collections.py` - Field mappings
- `flask_app.py` - API endpoint `/api/<collection>/products/<row>/generate-description`

**Collection-Specific Parts**:
1. **Description Prompt** (`core/ai_extractor.py`)
   - Function: `_build_{collection}_description_prompt()`
   - Uses collection-specific product fields

2. **Features Prompt** (`core/ai_extractor.py`)
   - Function: `_build_{collection}_features_prompt()`
   - Generates bullet points

3. **Care Prompt** (`core/ai_extractor.py`)
   - Function: `_build_{collection}_care_prompt()`
   - Maintenance instructions

**What to Change for New Collection**:
- ✅ Add description prompt function
- ✅ Add features prompt function
- ✅ Add care prompt function
- ✅ Register in `description_prompts` dict

---

### Feature: **Google Apps Script Cleaning**

**Files Involved**:
- `static/rulebase.gs` - Example script (Sinks)
- Google Sheets - Rule sheets
- `core/google_apps_script_manager.py` - Webhook integration
- `.env` - Webhook URL configuration

**Collection-Specific Parts**:
1. **Apps Script File** (Entirely unique per collection)
   - Rule sheet loading
   - Column mappings
   - Calculated fields
   - Boolean logic
   - Validation rules

2. **Rule Sheets** (Google Sheets)
   - Material_Rules, Type_Rules, etc.
   - Search Term → Standard Name mappings

3. **Webhook URL** (`.env`)
   - `GOOGLE_SCRIPTS_{COLLECTION}_WEBHOOK_URL`

**What to Change for New Collection**:
- ✅ Create new Apps Script project
- ✅ Copy and adapt `rulebase.gs`
- ✅ Update all column numbers
- ✅ Create rule sheets
- ✅ Update calculated field logic
- ✅ Deploy as web app (optional)
- ✅ Add webhook URL to `.env`

---

### Feature: **Quality Score**

**Files Involved**:
- `config/collections.py` - Field definitions
- Google Sheets - Formula
- `templates/collection/base.html` - Display

**Collection-Specific Parts**:
1. **Quality Fields List** (`config/collections.py`)
   - Property: `quality_fields`
   - List of fields that count toward completion

2. **Formula** (Google Sheets)
   - Created by Apps Script
   - Counts filled fields / total fields * 100

**What to Change for New Collection**:
- ✅ Define `quality_fields` list in collection config
- ✅ Apps Script creates formula automatically

---

### Feature: **Pricing Comparison (Caprice)**

**Files Involved**:
- `config/collections.py` - Pricing configuration
- Separate Google Sheet - Pricing data
- `flask_app.py` - Pricing API endpoints
- Collection template - Pricing modal

**Collection-Specific Parts**:
1. **Enable Flag** (`config/collections.py`)
   - Property: `pricing_enabled = True/False`

2. **Pricing Sheet Config** (`config/collections.py`)
   - `pricing_sheet_id` - Google Sheet with pricing data
   - `pricing_lookup_config` - Column numbers for data

3. **Pricing Fields** (`config/collections.py`)
   - `pricing_fields` - Field name mappings

**What to Change for New Collection**:
- ✅ Set `pricing_enabled = True`
- ✅ Create pricing sheet
- ✅ Set `pricing_sheet_id`
- ✅ Configure `pricing_lookup_config` columns
- ✅ Add pricing fields to `column_mapping`

---

### Feature: **CSV Import/Export**

**Files Involved**:
- `flask_app.py:3354-3603` - Import API endpoint
- `static/js/collection/base.js` - Export function
- `templates/collection/base.html` - Buttons

**Collection-Specific Parts**:
1. **Column Mapping** (`flask_app.py`)
   - Uses `column_mapping` from collection config
   - Maps CSV column names to internal fields

2. **Field Validation**
   - Checks against `column_mapping`
   - Only updates mapped fields

**What to Change for New Collection**:
- ✅ Ensure `column_mapping` is complete
- ✅ No additional changes needed (auto-adapts)

---

### Feature: **Product Edit Modal**

**Files Involved**:
- `templates/collection/{collection}.html` - Modal HTML
- `static/js/collection/base.js` - Modal logic
- `flask_app.py` - Update endpoint

**Collection-Specific Parts**:
1. **Modal HTML** (Entirely unique per collection)
   - Field inputs
   - Field grouping
   - Labels and placeholders
   - Validation rules

2. **Field IDs**
   - Must match `column_mapping` keys

**What to Change for New Collection**:
- ✅ Create new template file
- ✅ Design modal layout for your fields
- ✅ Use field IDs matching `column_mapping`
- ✅ Add collection-specific CSS

---

## 🔗 GOOGLE APPS SCRIPT INTEGRATION

### How It Works

1. **AI Extraction Completes** → Data saved to Google Sheets
2. **Optional: Trigger Apps Script** → Via webhook or checkbox
3. **Apps Script Runs** → Cleans and standardizes data
4. **Result** → Updated data with quality score

### Integration Methods

**Method 1: Webhook (Recommended)**
- Fastest and most reliable
- Apps Script deployed as web app
- PIM system POSTs to webhook after AI completion
- Apps Script automatically cleans row

**Method 2: Checkbox Trigger**
- User/system checks box in column BE
- Apps Script `onEdit` trigger fires
- Cleans that row automatically

**Method 3: Manual Trigger**
- User runs "Process All Checked Rows" from menu
- Batch processes multiple rows

### Webhook Setup (Per Collection)

1. **Create `doPost()` function** in Apps Script:
```javascript
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  if (data.source === 'PIM_AI_System' && data.row_number) {
    cleanSingleRow(data.row_number);
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: `Row ${data.row_number} cleaned`
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
```

2. **Deploy as Web App**:
   - Deploy → New deployment → Web app
   - Execute as: Me
   - Access: Anyone
   - Copy webhook URL

3. **Add to `.env`**:
```bash
GOOGLE_SCRIPTS_{COLLECTION}_WEBHOOK_URL=https://script.google.com/...
```

---

## 🎯 QUICK REFERENCE: WHAT DIFFERS PER COLLECTION

| Component | Universal? | Collection-Specific? | Notes |
|-----------|------------|---------------------|-------|
| **Base Template** | ✅ | ❌ | `base.html` is shared |
| **Collection Template** | ❌ | ✅ | Each has unique modal |
| **Google Sheet** | ❌ | ✅ | Different columns entirely |
| **Apps Script** | ❌ | ✅ | Different logic per collection |
| **AI Extraction Fields** | ❌ | ✅ | Different fields extracted |
| **AI Extraction Prompt** | ❌ | ✅ | Different prompts per type |
| **Description Prompt** | ❌ | ✅ | Different prompts per type |
| **Quality Fields** | ❌ | ✅ | Different fields per collection |
| **Column Mapping** | ❌ | ✅ | Different columns per sheet |
| **Pricing Config** | ⚠️ | ✅ | Optional, differs if enabled |
| **Image Extraction** | ⚠️ | ❌ | Optional, logic is universal |
| **Rule Sheets** | ❌ | ✅ | Different rules per collection |
| **Calculated Fields** | ❌ | ✅ | Different calculations per type |

---

## 📌 SUMMARY

### Universal Components (Work for All Collections):
- Flask routing system
- Base template UI structure
- Google Sheets integration
- Image extraction logic (if enabled)
- CSV import/export logic (adapts automatically)
- Frontend JavaScript (adapts based on COLLECTION_NAME)

### Collection-Specific Components (Must Create for Each):
1. **Collection config class** in `config/collections.py`
2. **AI extraction prompts** in `core/ai_extractor.py`
3. **Collection template** in `templates/collection/{collection}.html`
4. **Google Apps Script** (adapted from `rulebase.gs`)
5. **Google Sheet** with correct columns
6. **Rule sheets** for data standardization
7. **Environment variables** (spreadsheet ID, webhook URL)

### Time Estimate for New Collection:
- **Planning & Sheet Setup**: 2-4 hours
- **Backend Config**: 1-2 hours
- **AI Prompts**: 2-3 hours
- **Frontend Template**: 3-5 hours
- **Apps Script Adaptation**: 4-6 hours
- **Testing**: 2-3 hours
- **Total**: 14-23 hours per collection

---

## 🆘 TROUBLESHOOTING

### AI Extraction Not Working
- ✅ Check `ai_extraction_fields` defined in config
- ✅ Verify prompt function registered in `extraction_prompts`
- ✅ Check OpenAI API key valid
- ✅ Check column numbers in `column_mapping`

### Quality Score Not Calculating
- ✅ Check `quality_fields` defined in config
- ✅ Verify Apps Script setup_quality_score run
- ✅ Check formula in Google Sheets column

### Apps Script Not Triggering
- ✅ Check webhook URL in `.env`
- ✅ Verify `doPost()` function deployed as web app
- ✅ Check Apps Script execution log for errors
- ✅ Verify checkbox column mapped correctly

### Modal Fields Not Saving
- ✅ Check field IDs match `column_mapping` keys
- ✅ Verify column numbers correct in config
- ✅ Check browser console for JavaScript errors

---

**End of Audit Document**
**Version**: 1.0
**Last Updated**: 2025-10-13
