# Supplier Products - Testing Guide

## 🎯 What's Been Built

A complete system for importing products from supplier catalogs and adding them to your PIM.

## ✅ Test Data Ready

**15 Abey sink products** have been imported into the supplier database:

- FRA540 - Alfresco 540 Large Bowl Sink
- FRA700 - Alfresco 700 Large Bowl Sink
- FRA340 - Alfresco Single Bowl Sink
- FRA400D - Alfresco Double Bowl Sink
- 1X942I - Barazza R15 Double Bowl
- 1X842I - Barazza R15 Double Bowl
- 1X7040I - Barazza R15 Large Bowl
- 1X4540I - Barazza R15 Single Bowl
- 1X3440I - Barazza R15 Single Bowl
- 1ISX100L - Barazza Select 100 Single Bowl with Drainer (Left)
- 1ISX100R - Barazza Select 100 Single Bowl with Drainer (Right)
- 1ISX120L - Barazza Select 120 One and Third Bowl with Drainer (Left)
- 1ISX120R - Barazza Select 120 One and Third Bowl with Drainer (Right)
- ESA380 - Boutique Eco Sink
- STQ360DDCO - Boutique Lugano Double Bowl Double Drainer

All products are:
- ✅ In the supplier database
- ✅ Tagged as 'sinks' collection
- ✅ Ready to be discovered

## 🧪 How to Test

### 1. Start the Flask App

```bash
python flask_app.py
```

### 2. Go to Sinks Collection

Navigate to: `http://localhost:8000/sinks`

### 3. Test "Add Products from Supplier Catalog"

Click **Add Product** dropdown → **From Supplier Catalog**

### Test Scenario 1: Search by SKU

1. In the **Search by SKU** tab
2. Enter SKUs (try these):
   ```
   FRA540
   FRA700
   1X942I
   ```
3. Click **Search Catalog**
4. You should see 3 product cards with:
   - Product images (will extract from Abey website)
   - SKU and product name
   - "sinks" collection badge (95% confidence)
   - Supplier: Abey

5. Check some products → Click **Add to Work in Progress**

### Test Scenario 2: Find Missing Products

1. Switch to **Missing Products** tab
2. Click **Find Missing Products**
3. Should show all 15 Abey sinks (assuming they're not in your PIM yet)
4. Select multiple products
5. Add to WIP

### Test Scenario 3: Work in Progress

1. Switch to **Work in Progress** tab
2. You should see all products you added
3. Each card shows:
   - Status badge (pending, extracting, reviewing, completed)
   - Product image
   - Extract button (for AI extraction)
   - Edit button

## 📊 Database Location

The supplier database is stored at:
```
/workspaces/Cass-Brothers_PIM/supplier_products.db
```

## 🔍 Verify Database

```bash
sqlite3 supplier_products.db "SELECT sku, product_name, detected_collection, confidence_score FROM supplier_products;"
```

## 🚀 Next Steps After Testing

Once the UI is working, we can:

1. **Extract Images**: The system will automatically fetch og:image from Abey URLs
2. **AI Extraction**: Integrate with your existing AI extraction to pull product data
3. **Complete & Upload**: Add finished products to Google Sheets
4. **Import More Data**: Import your full supplier catalog CSV

## 📝 Known Limitations

- Image extraction happens on-demand (first view might be slow)
- Collection detection is keyword-based (works well for sinks, taps, baths)
- WIP editing not yet connected to existing product modal

## 🐛 Troubleshooting

**No products showing in "Missing Products"?**
- Check that you're on the 'sinks' collection page
- Verify products are in database: `python test_import_supplier_products.py`

**Images not loading?**
- Images are extracted from Abey website on first load
- Check browser console for errors
- Some products might not have og:image tags

**Database errors?**
- Delete `supplier_products.db` and re-run import scripts
- Check file permissions

## 💡 Future Enhancements

- CSV upload UI for bulk import
- Edit WIP products in existing modal
- Bulk AI extraction
- Export WIP to Google Sheets
- Duplicate detection
- Supplier management page
