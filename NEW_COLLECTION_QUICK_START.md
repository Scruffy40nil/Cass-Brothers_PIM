# 🚀 NEW COLLECTION QUICK START GUIDE

**Use this as a quick reference when adding a new collection**

---

## ✅ CHECKLIST FORMAT

Copy this checklist and fill it out for each new collection:

```
Collection Name: _______________
Collection Key: _______________
Spreadsheet ID: _______________
Webhook URL: _______________
```

---

## 📝 STEP-BY-STEP GUIDE

### STEP 1: Google Sheets Setup (2-4 hours)

```
[ ] Create new Google Spreadsheet
[ ] Name it: "{Collection Name} - PIM Data"
[ ] Create worksheet "Raw_Data"
[ ] Add system columns (A-G):
    [ ] A: url
    [ ] B: variant_sku
    [ ] C: key
    [ ] D: id
    [ ] E: handle
    [ ] F: title
    [ ] G: vendor

[ ] Add your collection-specific columns (H+)
    Example for Sinks:
    [ ] H: colour
    [ ] I: installation_type
    [ ] J: product_material
    [ ] K: grade_of_material
    ... (list all your fields)

[ ] Add standard columns at end:
    [ ] BE (57): selected (checkbox)
    [ ] BF (58): faqs
    [ ] BG (59): our_current_price
    [ ] BH (60): competitor_name
    [ ] BI (61): competitor_price
    [ ] BJ (62): price_last_updated

[ ] Create rule sheets:
    [ ] Material_Rules (columns: Search Term | Standard Name)
    [ ] Type_Rules (columns: Search Term | Standard Name)
    [ ] Finish_Rules (columns: Search Term | Standard Name)
    [ ] Warranty_Rules (columns: Brand Name | Warranty Years)
    [ ] (Add more as needed)

[ ] Copy Spreadsheet ID from URL
    Format: https://docs.google.com/spreadsheets/d/COPY_THIS_PART/edit
```

---

### STEP 2: Environment Configuration (10 minutes)

Add to `.env` file:

```bash
# Add this line (replace YOUR_ID and YOUR_KEY)
YOUR_COLLECTION_KEY_SPREADSHEET_ID=your_spreadsheet_id_here

# Example:
SHOWER_SCREENS_SPREADSHEET_ID=1abc123def456...
```

---

### STEP 3: Backend Configuration (1-2 hours)

**File**: `config/collections.py`

```python
# 1. Create new collection class
class YourCollectionCollection(CollectionConfig):
    """Configuration for Your Collection collection"""

    def setup_fields(self):
        # Enable features
        self.extract_images = True  # Set to True if you want AI image extraction
        self.pricing_enabled = False  # Set to True if you have pricing data

        # Define what AI should extract from supplier URLs
        self.ai_extraction_fields = [
            'sku',
            'title',
            'brand_name',
            'vendor',
            # Add your collection-specific fields here
            'field1',
            'field2',
            'field3',
        ]

        # Define what counts toward quality score
        self.quality_fields = [
            'brand_name',
            'field1',
            'field2',
            'field3',
            # Add all important fields for your collection
        ]

        # Map field names to Google Sheets column numbers
        self.column_mapping = {
            # System fields (standard for all collections)
            'url': 1,                      # A
            'variant_sku': 2,              # B
            'key': 3,                      # C
            'id': 4,                       # D
            'handle': 5,                   # E
            'title': 6,                    # F
            'vendor': 7,                   # G

            # Your collection-specific fields
            'field1': 8,                   # H
            'field2': 9,                   # I
            'field3': 10,                  # J
            # ... continue for all your fields

            # Standard end columns
            'selected': 57,                # BE
            'faqs': 58,                    # BF
            'our_current_price': 59,       # BG
            'competitor_name': 60,         # BH
            'competitor_price': 61,        # BI
            'price_last_updated': 62       # BJ
        }

        # AI content fields (standard)
        self.ai_description_field = 'body_html'
        self.ai_features_field = 'features'
        self.ai_care_field = 'care_instructions'


# 2. Register collection in COLLECTIONS dict (bottom of file)
COLLECTIONS = {
    'sinks': SinksCollection(...),
    'taps': TapsCollection(...),
    # Add your collection here:
    'your_collection_key': YourCollectionCollection(
        name='Your Collection Display Name',
        description='Short description of this collection',
        spreadsheet_id=os.environ.get('YOUR_COLLECTION_KEY_SPREADSHEET_ID', ''),
        worksheet_name='Raw_Data',
        checkbox_column='selected'
    ),
}
```

---

### STEP 4: AI Extraction Prompts (2-3 hours)

**File**: `core/ai_extractor.py`

```python
# 1. Add extraction prompt function (around line 42)
self.extraction_prompts = {
    'sinks': self._build_sinks_extraction_prompt,
    'taps': self._build_taps_extraction_prompt,
    # Add yours here:
    'your_collection_key': self._build_your_collection_extraction_prompt,
}

# 2. Add description prompt function (around line 49)
self.description_prompts = {
    'sinks': self._build_sinks_description_prompt,
    'taps': self._build_taps_description_prompt,
    # Add yours here:
    'your_collection_key': self._build_your_collection_description_prompt,
}

# 3. Create prompt functions (at end of class, around line 500+)
def _build_your_collection_extraction_prompt(self, url, html_content):
    """Build AI extraction prompt for Your Collection products"""
    return f"""
    You are extracting product information for a {YOUR_PRODUCT_TYPE} from a supplier website.

    URL: {url}

    Extract the following fields in JSON format:

    {{
        "sku": "Product SKU or model number",
        "title": "Full product title",
        "brand_name": "Brand/manufacturer name",
        "vendor": "Supplier/vendor name",
        "field1": "Description of field1",
        "field2": "Description of field2",
        "field3": "Description of field3",
        // Add all your collection-specific fields
    }}

    IMPORTANT RULES:
    - Extract exact values, don't make assumptions
    - If a field is not found, use empty string ""
    - For dimensions, extract numbers only (no units in value)
    - For boolean fields, use true/false
    - For numeric fields, use numbers without units

    HTML Content:
    {html_content[:15000]}
    """

def _build_your_collection_description_prompt(self, data):
    """Build AI description generation prompt for Your Collection"""
    # Extract product details
    title = data.get('title', 'Product')
    brand = data.get('brand_name', '')
    field1 = data.get('field1', '')
    field2 = data.get('field2', '')

    return f"""
    Generate a professional, SEO-optimized product description for this {YOUR_PRODUCT_TYPE}:

    PRODUCT DETAILS:
    - Title: {title}
    - Brand: {brand}
    - Field1: {field1}
    - Field2: {field2}
    (Include all relevant fields)

    Write a compelling description that:
    - Starts with a strong opening paragraph
    - Highlights key features and benefits
    - Uses industry-appropriate terminology
    - Is 150-250 words
    - Includes 2-3 paragraphs
    - Is formatted as clean HTML (use <p> tags)

    Focus on what makes this product unique and why customers should buy it.
    """

# 4. Add features and care prompts (similar structure)
def _build_your_collection_features_prompt(self, data):
    # Similar to description but generates bullet points

def _build_your_collection_care_prompt(self, data):
    # Generates maintenance/care instructions
```

---

### STEP 5: Frontend Template (3-5 hours)

**File**: `templates/collection/your_collection.html`

Copy `templates/collection/sinks.html` and modify:

```html
{% extends "collection/base.html" %}

{% block extra_styles %}
/* Your collection-specific styles */
.your-specific-class {
  /* Custom CSS */
}
{% endblock %}

{% block collection_modal %}
<!-- EDIT PRODUCT MODAL - Customize for your fields -->
<div class="modal fade" id="editModal">
  <div class="modal-dialog modal-xl">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Edit Product</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>

      <div class="modal-body">
        <!-- Image Section (standard) -->
        <div class="image-section">
          <!-- Keep image gallery code -->
        </div>

        <!-- Your Collection-Specific Fields -->
        <div class="field-group">
          <h6>Your Field Group Name</h6>

          <div class="row">
            <div class="col-md-6">
              <label>Field 1</label>
              <input type="text" id="editField1" class="form-control">
            </div>

            <div class="col-md-6">
              <label>Field 2</label>
              <select id="editField2" class="form-control">
                <option value="">Select...</option>
                <option value="Option1">Option 1</option>
                <option value="Option2">Option 2</option>
              </select>
            </div>
          </div>

          <!-- Add all your fields with proper IDs -->
          <!-- ID format: edit{FieldName} where FieldName matches column_mapping key -->
        </div>

        <!-- Content Tabs (standard) -->
        <div class="content-section">
          <!-- Keep description/features/care/faq tabs -->
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
        <button type="button" class="btn btn-primary" onclick="saveCurrentProduct()">Save Changes</button>
      </div>
    </div>
  </div>
</div>
{% endblock %}
```

**Important**: Field IDs must match `column_mapping` keys with "edit" prefix:
- `column_mapping['field1']` → `<input id="editField1">`
- `column_mapping['field2']` → `<input id="editField2">`

---

### STEP 6: Google Apps Script (4-6 hours)

```
[ ] Open your Google Sheet
[ ] Extensions → Apps Script
[ ] Create new project: "{Collection} PIM Data Processor"
[ ] Copy static/rulebase.gs as starting point
[ ] Update QUALITY_SCORE_FIELDS array (around line 15)
[ ] Update column numbers in processRowSafely() (around line 200+)
[ ] Update rule loading (around line 180)
[ ] Add collection-specific calculated fields
[ ] Add collection-specific boolean logic
[ ] Create rule sheets in Google Sheets
[ ] Test with sample data
[ ] Deploy as web app (optional for webhook)
[ ] Add webhook URL to .env
```

---

### STEP 7: Testing (2-3 hours)

```
[ ] Restart Flask app
[ ] Navigate to /collection/your_collection_key
[ ] Test: Add product with URL
[ ] Verify: AI extraction works
[ ] Verify: Fields save to Google Sheet
[ ] Verify: Images extract (if enabled)
[ ] Test: Edit product in modal
[ ] Verify: All fields save correctly
[ ] Test: Check Apps Script checkbox
[ ] Verify: Data cleaning works
[ ] Verify: Quality score calculates
[ ] Test: Generate description
[ ] Verify: All 4 content sections generate
[ ] Test: CSV export
[ ] Test: CSV import
[ ] Verify: No JavaScript errors in console
```

---

## 📊 COMMON FIELD MAPPINGS REFERENCE

Standard system fields (same for all collections):

```python
{
    'url': 1,                      # A - Source URL
    'variant_sku': 2,              # B - Product SKU
    'key': 3,                      # C - Lookup key
    'id': 4,                       # D - System ID
    'handle': 5,                   # E - URL handle
    'title': 6,                    # F - Product title
    'vendor': 7,                   # G - Vendor/supplier
}
```

Standard end fields (same for all collections):

```python
{
    'quality_score': 38,           # AL - Quality percentage
    'shopify_status': 39,          # AM - Active/Draft
    'shopify_price': 40,           # AN - Current price
    'shopify_compare_price': 41,   # AO - Compare at price
    'shopify_weight': 42,          # AP - Weight
    'shopify_tags': 43,            # AQ - Tags
    'seo_title': 44,               # AR - SEO title
    'seo_description': 45,         # AS - SEO description
    'shopify_images': 46,          # AT - Image URLs (comma-separated)
    'shopify_spec_sheet': 47,      # AU - Spec sheet URL
    'shopify_collections': 48,     # AV - Collections
    'shopify_url': 49,             # AW - Shopify URL
    'last_shopify_sync': 50,       # AX - Last sync timestamp
    'selected': 57,                # BE - Checkbox
    'faqs': 58,                    # BF - AI FAQs
    'our_current_price': 59,       # BG - Our price
    'competitor_name': 60,         # BH - Competitor
    'competitor_price': 61,        # BI - Competitor price
    'price_last_updated': 62,      # BJ - Price update date
}
```

Your collection-specific fields go in columns H (8) through AL (38).

---

## 🎯 VALIDATION CHECKLIST

Before considering your collection complete:

```
[ ] Collection appears in home page list
[ ] Collection page loads without errors
[ ] Add product modal opens
[ ] URL validation works
[ ] AI extraction completes successfully
[ ] Data appears in Google Sheet
[ ] Edit modal opens with correct fields
[ ] All fields save correctly
[ ] Quality score calculates
[ ] Apps Script cleaning works
[ ] Description generation works
[ ] Image extraction works (if enabled)
[ ] CSV export includes all fields
[ ] CSV import updates products
[ ] No JavaScript console errors
[ ] No Python errors in logs
```

---

## ⚠️ COMMON MISTAKES TO AVOID

1. **Column number mismatch** - Count carefully! Column A = 1, not 0
2. **Field ID mismatch** - Modal field IDs must match column_mapping keys
3. **Missing prompt registration** - Add to extraction_prompts and description_prompts dicts
4. **Forgot to register collection** - Add to COLLECTIONS dict at bottom of collections.py
5. **Environment variable typo** - Use EXACT name: {KEY}_SPREADSHEET_ID
6. **Apps Script column numbers** - Must match your column_mapping exactly
7. **Quality fields mismatch** - Apps Script QUALITY_SCORE_FIELDS must match config
8. **Template file name** - Must match collection key: {key}.html

---

## 🆘 QUICK TROUBLESHOOTING

**Collection doesn't appear**: Check COLLECTIONS dict registration + .env variable

**AI extraction fails**: Check prompt function name matches collection key

**Fields don't save**: Check modal field IDs match column_mapping keys

**Quality score wrong**: Check quality_fields list matches Apps Script

**Apps Script fails**: Check column numbers match exactly

**Images don't extract**: Check extract_images = True in config

---

## ⏱️ TIME ESTIMATES

- Google Sheets setup: 2-4 hours
- Backend config: 1-2 hours
- AI prompts: 2-3 hours
- Frontend template: 3-5 hours
- Apps Script: 4-6 hours
- Testing: 2-3 hours

**Total: 14-23 hours per collection**

---

## 📞 REFERENCE DOCS

- Full audit: `COLLECTION_SYSTEM_AUDIT.md`
- Sinks example: `config/collections.py` (SinksCollection class)
- Apps Script example: `static/rulebase.gs`
- Template example: `templates/collection/sinks.html`

---

**Good luck with your new collection! 🚀**
