const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first'); 

const express = require("express");
const cors = require("cors");
const XLSX = require("xlsx");
const fs = require("fs");
const axios = require("axios");
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Robust normalization helper for branch matching
// For branch names
const normalizeText = (str) =>
  String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();

// For SKU / material codes
const normalizeSku = (str) =>
  String(str || "")
    .trim()
    .toUpperCase();

// Middleware to strip /api prefix from Vercel requests so they match our routes
app.use((req, res, next) => {
  if (req.url.startsWith('/api')) {
    req.url = req.url.replace(/^\/api/, '');
  }
  next();
});

// Prevent API caching
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

// Initialize Supabase Client (Uses Port 443 - rarely blocked)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase;
if (!supabaseUrl || !supabaseKey) {
  console.error("❌ CRITICAL: Supabase environment variables are missing. Check Vercel settings.");
} else {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log("✅ Supabase client initialized with URL:", supabaseUrl.substring(0, 15) + "...");
  } catch (err) {
    console.error("❌ SUPABASE INIT ERROR:", err.message);
  }
}

// Middleware to prevent crashes if Supabase is not initialized
app.use((req, res, next) => {
  if (!supabase && req.url !== '/debug-db') {
    return res.status(503).json({ 
      success: false, 
      error: "Backend misconfigured: Supabase client not initialized. Check Environment Variables." 
    });
  }
  next();
});

// Test Supabase SDK Connection immediately on startup
async function testConnection() {
  try {
    if (!supabase) {
      console.error('❌ Supabase client was not initialized.');
      return;
    }

    const { data, error, count } = await supabase.from('individual_books').select('id', { count: 'exact', head: true });
    if (error) {
      console.error('❌ Supabase Client Failed:', error.message);
      return;
    }
    console.log(`✅ Connected to Supabase. Found ${count || 0} books.`);

    // Seed default admin user if not exists
    const { data: user, error: userError } = await supabase
      .from('book_list_users')
      .select('id')
      .eq('username', 'Raghavendra')
      .maybeSingle();

    if (userError) {
      console.error('❌ Error checking admin user:', userError.message);
    } else if (!user) {
      console.log('👤 Admin user not found. Attempting to seed...');
      const { error: seedError } = await supabase.from('book_list_users').insert([{
        username: 'Raghavendra',
        password: '8142037547',
        role: 'Admin',
        rights: JSON.stringify(['View', 'Edit/Delete'])
      }]);
      if (seedError) console.error('❌ Seeding failed:', seedError.message);
      console.log('👤 Default admin user seeded in database.');
    } else {
      console.log('👤 Admin user already exists.');
    }
  } catch (err) {
    console.error('❌ Startup Error:', err.message);
  }
}
// Only call testConnection if supabase was successfully initialized
if (supabase) {
  testConnection();
}

/* ============================
   🔍 CONNECTION DIAGNOSTICS
============================ */
app.get("/debug-db", async (req, res) => {
  try {
    const hasUrl = !!process.env.SUPABASE_URL;
    const hasKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    const { data, error } = await supabase.from('book_list_users').select('count', { count: 'exact', head: true });
    
    res.json({
      env: { hasUrl, hasKey, urlStart: process.env.SUPABASE_URL?.substring(0, 15) },
      connection: error ? "Failed" : "Success",
      error: error || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ============================
   📚 GET BOOKS
============================ */
app.get("/books", async (req, res) => {
  try {
    // Using SDK instead of pool.query to bypass port blocking
    const { data, error } = await supabase
      .from('individual_books')
      .select('*')
      .order('id', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error("GET BOOKS ERROR:", err.message, err.details, err.hint);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ============================
   📄 GET A SINGLE BOOK
============================ */
app.get("/books/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('individual_books')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (!data) {
      return res.status(404).json({ success: false, message: "Book not found" });
    }
    res.json(data); // Consider logging data length for debugging
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ============================
   ➕ BULK ADD BOOKS
============================ */
app.post("/books/bulk", async (req, res) => {
  const { kit_id, books } = req.body;

  if (!kit_id || !Array.isArray(books) || books.length === 0) {
    return res.status(400).json({ success: false, error: "kit_id and books array are required." });
  }

  try {
    // 1. Identify logical kit group
    const { data: seedKit } = await supabase.from('grade_wise_kits').select('name, zone, grade').eq('id', kit_id).single();
    if (!seedKit) throw new Error("Parent kit group not found");
    console.log(`BULK INSERT: Found seed kit for kit_id ${kit_id}:`, seedKit);

    const { data: kitRows } = await supabase
      .from('grade_wise_kits')
      .select('id, branch')
      .eq('name', seedKit.name)
      .eq('zone', seedKit.zone)
      .eq('grade', seedKit.grade);
    console.log(`BULK INSERT: Found ${kitRows?.length || 0} kit rows for logical group.`);

    // 2. Pre-fetch pricing for all unique materials in the batch
    const uniqueSkus = [...new Set(books.map(b => String(b.material_code || "").trim()))].filter(Boolean);
    const { data: pricingList } = await supabase.from('pricing').select('material_code, mrp, cost_price').in('material_code', uniqueSkus);
    console.log(`BULK INSERT: Found ${uniqueSkus.length} unique SKUs, fetched ${pricingList?.length || 0} pricing entries.`);
    const pricingMap = new Map((pricingList || []).map(p => [p.material_code, p]));

    // Optimization: Pre-map kitRows by normalized branch name for O(1) lookup
    const kitBranchMap = new Map();
    (kitRows || []).forEach(kr => {
      kitBranchMap.set(normalizeText(kr.branch), kr.id);
    });

    // 3. Prepare rows for batch insert
    const allRowsToInsert = [];

    for (const d of books) {
      const sku = String(d.material_code || "").trim();
      const priceEntry = pricingMap.get(sku);
      
      const qty = Number(d.quantity) || 0;
      const rate = Number(d.per_unit_rate) || 0;
      const mrp = priceEntry?.mrp ?? (Number(d.mrp) || 0);
      const cost_price = priceEntry?.cost_price ?? (Number(d.cost_price) || 0);
      const total = Number(d.total_amount) || qty * rate;

      // Determine branches: explicitly from row, or fallback to all branches in this logical kit
      let branchInput = d.branch;
      if (!branchInput || (Array.isArray(branchInput) && branchInput.length === 0)) {
        branchInput = kitRows.map(kr => kr.branch);
      }

      const branchArray = Array.isArray(branchInput) 
        ? branchInput 
        : String(branchInput).split(/[,\n\r|]+/).map(s => s.trim()).filter(Boolean);

      branchArray.forEach(br => {
        const normBr = normalizeText(br);
        const linkedKitId = kitBranchMap.get(normBr) || kit_id;

        allRowsToInsert.push({
          zone: String(d.zone || seedKit.zone).trim(),
          grade: String(d.grade || seedKit.grade).trim(),
          branch_name: br,
          subject: String(d.subject || "").trim(),
          material_name: String(d.material_name || "").trim(),
          material_code: sku,
          tax_rate: Number(d.tax_rate) || 0,
          mandatory_optional: String(d.mandatory_optional || "").trim(),
          category: String(d.category || "").trim(),
          volume: String(d.volume || "").trim(),
          year: String(d.year || "").trim(),
          author: String(d.author || "").trim(),
          publisher: String(d.publisher || "").trim(),
          quantity: qty,
          per_unit_rate: rate,
          total_amount: total,
          mrp,
          cost_price,
          composite_code: String(d.composite_code || "").trim(),
          composite_name: String(d.composite_name || "").trim(),
          kit_id: linkedKitId
        });
      });
    }

    // 4. Batch Insert
    if (allRowsToInsert.length > 0) {
      console.log(`BULK INSERT: Attempting to insert ${allRowsToInsert.length} total rows in chunks.`);
      
      // Chunking to prevent timeouts and payload size limits
      const chunkSize = 500; 
      for (let i = 0; i < allRowsToInsert.length; i += chunkSize) {
        const chunk = allRowsToInsert.slice(i, i + chunkSize);
        const { error } = await supabase.from('individual_books').insert(chunk);
        if (error) {
          throw new Error(`Supabase insert error at chunk ${Math.floor(i/chunkSize)}: ${error.message} (Details: ${error.details})`);
        }
      }
    }

    console.log(`✅ BULK INSERT SUCCESS: ${allRowsToInsert.length} branch-rows inserted for ${books.length} items.`);
    res.json({ 
      success: true, 
      items_processed: books.length, 
      rows_created: allRowsToInsert.length 
    });

  } catch (err) {
    console.error("❌ BULK INSERT ERROR:", err.message, err.details, err.hint);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ============================
   📦 GET KITS
============================ */
app.get("/kits", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('grade_wise_kits')
      .select('*')
      .order('id', { ascending: false });
    if (error) throw error;

    // Aggregate branch-wise rows into logical kits for the UI
    const groupedKits = [];
    const kitMap = new Map();

    (data || []).forEach(item => {
      const key = `${item.name}|${item.zone}|${item.grade}`;
      if (!kitMap.has(key)) {
        const kit = { ...item, branch: [item.branch] };
        kitMap.set(key, kit);
        groupedKits.push(kit);
      } else {
        kitMap.get(key).branch.push(item.branch);
      }
    });

    res.json(groupedKits);
  } catch (err) {
    console.error("GET KITS ERROR:", err.message, err.details, err.hint);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ============================
   📦 GET A SINGLE KIT
============================ */
app.get("/kits/:id", async (req, res) => {
  try {
    // 1. Get the specific row requested to identify the logical kit group
    const { data: initialKit, error: kitError } = await supabase
      .from('grade_wise_kits')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (!initialKit) {
      return res.status(404).json({ success: false, message: "Kit not found" });
    }

    // 2. Find all branch rows belonging to this logical kit (same name, zone, grade)
    const { data: allBranchRows } = await supabase
      .from('grade_wise_kits')
      .select('id, branch')
      .eq('name', initialKit.name)
      .eq('zone', initialKit.zone)
      .eq('grade', initialKit.grade);

    const kitIds = (allBranchRows || []).map(r => r.id);
    const allBranches = (allBranchRows || []).map(r => r.branch);

    // 3. Fetch books associated with ANY of the branch rows for this group
    const { data: books } = await supabase
      .from('individual_books')
      .select('*')
      .in('kit_id', kitIds)
      .order('id', { ascending: false });

    // 4. Aggregate books for the UI (collapse same materials across branches into one row)
    const aggregatedBooks = [];
    const bookMap = new Map();

    (books || []).forEach(b => {
      const key = `${b.material_code}|${b.subject}|${b.category}`;
      if (!bookMap.has(key)) {
        const item = { ...b, branch_name: [b.branch_name] };
        bookMap.set(key, item);
        aggregatedBooks.push(item);
      } else {
        const existing = bookMap.get(key);
        if (!existing.branch_name.includes(b.branch_name)) {
          existing.branch_name.push(b.branch_name);
        }
      }
    });

    initialKit.branch = allBranches;
    initialKit.books = aggregatedBooks;
    res.json(initialKit);
  } catch (err) {
    console.error("❌ KIT FETCH ERROR:", err.message, err.details, err.hint);
    res.status(500).send(err.message);
  }
});

/* ============================
   ➕ ADD BOOK
============================ */
app.post("/books", async (req, res) => {
  const d = req.body;

  try {
    const zone = String(d.zone || "").trim();
    const grade = String(d.grade || "").trim();
    let branchName = Array.isArray(d.branch) ? d.branch : String(d.branch || "").trim(); // Consolidated declaration

    // If branch is missing but kit_id is present, inherit branches from the parent kit
    const isBranchEmpty = (Array.isArray(branchName) && branchName.length === 0) || (!Array.isArray(branchName) && !branchName);
    if (isBranchEmpty && d.kit_id) {
      const { data: kitData } = await supabase
        .from('grade_wise_kits')
        .select('branch')
        .eq('id', d.kit_id)
        .maybeSingle();
      
      if (kitData && kitData.branch) {
        branchName = Array.isArray(kitData.branch) ? kitData.branch : [String(kitData.branch).trim()];
      }
    }

    // Find the actual kit rows to get the correct kit_id per branch
    const { data: seedKit } = await supabase.from('grade_wise_kits').select('name, zone, grade').eq('id', d.kit_id).single();
    const { data: kitRows } = await supabase
      .from('grade_wise_kits')
      .select('id, branch')
      .eq('name', seedKit.name).eq('zone', seedKit.zone).eq('grade', seedKit.grade);

    const sku = String(d.material_code || "").trim();
    const subject = String(d.subject || "").trim();
    const materialName = String(d.material_name || "").trim();
    const taxRate = Number(d.tax_rate) || 0;
    const mandatoryOptional = String(d.mandatory_optional || "").trim();
    const category = String(d.category || "").trim();
    const volume = String(d.volume || "").trim();
    const year = String(d.year || "").trim();
    const author = String(d.author || "").trim();
    const publisher = String(d.publisher || "").trim();
    const qty = Number(d.quantity) || 0;
    const rate = Number(d.per_unit_rate) || 0;
    let mrp = Number(d.mrp) || 0;
    let costPrice = Number(d.cost_price) || 0;
    const compositeCode = String(d.composite_code || "").trim();
    const compositeName = String(d.composite_name || "").trim();

    // Pricing Lookup from master pricing table
    const { data: pricingData } = await supabase
      .from('pricing')
      .select('mrp, cost_price')
      .eq('material_code', sku)
      .maybeSingle();

    if (pricingData) {
      mrp = pricingData.mrp ?? mrp;
      costPrice = pricingData.cost_price ?? costPrice;
    }
    const total = Number(d.total_amount) || qty * rate;

    // Create one row per branch, linking to the specific row ID for that branch kit
    const branchArray = Array.isArray(branchName) ? branchName : [branchName];
    const rows = branchArray.map(br => {
      const kitRow = kitRows.find(kr => normalizeText(kr.branch) === normalizeText(br));
      return {
        zone, grade, branch_name: br, subject, material_name: materialName, material_code: sku,
        tax_rate: taxRate, mandatory_optional: mandatoryOptional, category, volume, year,
        author, publisher, quantity: qty, per_unit_rate: rate, total_amount: total,
        mrp, cost_price: costPrice, composite_code: compositeCode, composite_name: compositeName, 
        kit_id: kitRow ? kitRow.id : d.kit_id
      };
    });

    const { data, error } = await supabase
      .from('individual_books')
      .insert(rows)
      .select();

    if (error) throw error;

    // Aggregate the newly inserted rows into a single logical book object for the UI
    const responseBook = (data && data.length > 0) ? { 
      ...data[0], 
      branch_name: data.map(b => b.branch_name) 
    } : null;

    console.log("✅ INSERT SUCCESS. SKU:", sku);
    res.json({ success: true, book: responseBook });

  } catch (err) {
    console.error("❌ INSERT ERROR:", err.message, err.details, err.hint);
    res.status(500).send(err.message);
  }
});

/* ============================
   ➕ ADD KIT
============================ */
app.post("/kits", async (req, res) => {
  const d = req.body;

  try {
    const name = String(d.name || "").trim();
    const zone = String(d.zone || "").trim();
    const grade = String(d.grade || "").trim();
    const status = String(d.status || "Pending").trim();
    const createdBy = String(d.createdBy || "").trim();
    const createdAt = String(d.createdAt || "").trim();
    const statusInfo = String(d.statusInfo || "").trim();

    if (!name || !zone || !grade) {
      return res.status(400).json({ success: false, error: "Missing required fields: name, zone, and grade are mandatory." });
    }

    let branchValues = [];
    if (Array.isArray(d.branch)) {
      branchValues = d.branch.map(item => String(item || "").trim()).filter(Boolean);
    } else if (d.branch) {
      branchValues = [String(d.branch).trim()];
    }

    if (branchValues.length === 0) {
      const { data: zoneBranches, error: branchError } = await supabase
        .from('branches')
        .select('name')
        .eq('zone', zone);

      if (branchError) throw branchError;
      branchValues = (zoneBranches || []).map(b => String(b.name || "").trim()).filter(Boolean);
    }

    branchValues = [...new Set(branchValues)];

    if (branchValues.length === 0) {
      return res.status(400).json({ success: false, error: "No branches found for the selected zone. Please add branches for this zone first." });
    }

    const { data: existing, error: existingError } = await supabase
      .from('grade_wise_kits')
      .select('id')
      .eq('name', name)
      .eq('zone', zone)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ success: false, error: `A book list named "${name}" already exists for zone "${zone}".` });
    }

    // Insert one row per branch
    const rows = branchValues.map(br => ({
      name, zone, branch: br, grade, status, created_by: createdBy, created_at: createdAt, status_info: statusInfo
    }));

    const { data, error } = await supabase
      .from('grade_wise_kits')
      .insert(rows)
      .select();

    if (error) {
       console.error("❌ SUPABASE KIT INSERT ERROR:", error.message);
       throw error;
    }

    console.log("✅ KIT INSERT:", name, "zone:", zone, "branches:", branchValues.length);
    res.json({ success: true, kit: data });

  } catch (err) {
    console.error("❌ KIT INSERT ERROR:", err.message, err.details, err.hint);
    res.status(500).send(err.message);
  }
});

// PUT /kits/:id - Update a single kit with multiple branches
app.put("/kits/:id", async (req, res) => {
  const d = req.body;
  try {
    const id = req.params.id;
    const name = String(d.name || "").trim();
    const zone = String(d.zone || "").trim();
    const grade = String(d.grade || "").trim();
    const status = String(d.status || "Pending").trim();
    const createdBy = String(d.createdBy || "").trim();
    const createdAt = String(d.createdAt || "").trim();
    const statusInfo = String(d.statusInfo || "").trim();

    let branchValues = [];
    if (Array.isArray(d.branch)) {
      branchValues = d.branch.map(item => String(item || "").trim()).filter(Boolean);
    } else if (d.branch) {
      branchValues = [String(d.branch).trim()];
    }

    if (branchValues.length === 0 && zone) {
      const { data: zoneBranches, error: branchError } = await supabase
        .from('branches')
        .select('name')
        .eq('zone', zone);
      if (branchError) throw branchError;
      branchValues = (zoneBranches || []).map(b => String(b.name || "").trim()).filter(Boolean);
    }

    // 1. Find logical kit and all current IDs to prevent orphaned books
    const { data: original } = await supabase.from('grade_wise_kits').select('name, zone, grade').eq('id', id).single();
    if (!original) return res.status(404).json({ error: "Kit not found" });

    const { data: oldRows } = await supabase.from('grade_wise_kits').select('id').eq('name', original.name).eq('zone', original.zone).eq('grade', original.grade);
    const oldIds = (oldRows || []).map(r => r.id);

    // 2. Delete all existing rows for this logical group
    await supabase.from('grade_wise_kits').delete().eq('name', original.name).eq('zone', original.zone).eq('grade', original.grade);

    // 3. Re-insert new rows (one per branch)
    const rows = branchValues.map(br => ({
      name, zone, branch: br, grade, status, created_by: createdBy, created_at: createdAt, status_info: statusInfo
    }));

    const { data, error } = await supabase.from('grade_wise_kits').insert(rows).select();
    if (error) throw error;

    // 4. Synchronize individual books: Ensure every book in the kit exists for every branch of the updated kit
    if (oldIds.length > 0 && data.length > 0) {
      // 4.1 Fetch unique materials currently in the logical kit group
      const { data: existingBooks } = await supabase
        .from('individual_books')
        .select('*')
        .in('kit_id', oldIds);

      if (existingBooks && existingBooks.length > 0) {
        // Group by material_code to identify unique items in the kit
        const uniqueMaterials = new Map();
        existingBooks.forEach(b => {
          if (!uniqueMaterials.has(b.material_code)) {
            uniqueMaterials.set(b.material_code, b);
          }
        });

        const newBookRows = [];
        uniqueMaterials.forEach((template) => {
          // Create a book row for every branch in the updated kit
          data.forEach(newKitRow => {
            const { id, ...cleanBookData } = template;
            newBookRows.push({
              ...cleanBookData,
              zone: newKitRow.zone,
              grade: newKitRow.grade,
              branch_name: newKitRow.branch,
              kit_id: newKitRow.id
            });
          });
        });

        // 4.2 Delete old book records across the whole group
        await supabase.from('individual_books').delete().in('kit_id', oldIds);

        // 4.3 Insert the "re-exploded" book records (one per branch per material)
        if (newBookRows.length > 0) {
          const { error: syncError } = await supabase.from('individual_books').insert(newBookRows);
          if (syncError) console.error("❌ Syncing books failed during kit update:", syncError.message);
        }
      }
    }

    res.json({ success: true, kit: data[0] });
  } catch (err) {
    console.error("❌ KIT UPDATE ERROR:", err.message, err.details, err.hint);
    res.status(500).send(err.message);
  }
});

app.delete("/kits/:id", async (req, res) => {
  try {
    const kitId = req.params.id;
    // 1. Find logical identity to delete all associated branch rows
    const { data: kit } = await supabase.from('grade_wise_kits').select('name, zone, grade').eq('id', kitId).single();
    
    if (kit) {
      const { data: groupRows } = await supabase
        .from('grade_wise_kits')
        .select('id')
        .eq('name', kit.name)
        .eq('zone', kit.zone)
        .eq('grade', kit.grade);
      
      const groupIds = (groupRows || []).map(r => r.id);

      // 2. Delete associated books for all IDs in the group
      await supabase.from('individual_books').delete().in('kit_id', groupIds);
      
      // 3. Delete all branch rows
      const { error } = await supabase.from('grade_wise_kits').delete().in('id', groupIds);
      if (error) throw error;
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/branches", async (req, res) => {
  try {
    const zone = req.query.zone || null;
    let query = supabase.from('branches').select('id, name, zone, created_at').order('name', { ascending: true });
    
    if (zone) {
      query = query.eq('zone', zone);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("❌ BRANCHES FETCH ERROR:", err.message, err.details, err.hint);
    res.status(500).send(err.message);
  }
});

app.post("/branches", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const zone = String(req.body.zone || "").trim();
    const createdAt = req.body.created_at ? String(req.body.created_at) : new Date().toISOString();

    if (!name || !zone) {
      return res.status(400).json({ success: false, error: "Branch name and zone are required." });
    }

    const { data, error } = await supabase
      .from('branches')
      .insert([{ name, zone, created_at: createdAt }])
      .select()
      .single();

    if (error) {
      console.error("❌ BRANCH INSERT ERROR:", error.message);
      throw error;
    }

    res.json({ success: true, branch: data });
  } catch (err) {
    console.error("❌ BRANCH CREATE ERROR:", err.message, err.details, err.hint);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/student_projections", async (req, res) => {
  try {
    const grade = String(req.body.grade || "").trim();
    const branch = String(req.body.branch || "").trim();
    const zone = String(req.body.zone || "").trim();
    const newAdmissions = Number(req.body.new_admissions) || 0;
    const existingAdmissions = Number(req.body.existing_admissions) || 0;
    const totalProjection = Number(req.body.total_projection) || 0;

    if (!grade || !branch || !zone) {
      return res.status(400).json({ success: false, error: "Grade, branch, and zone are required." });
    }

    const { data, error } = await supabase
      .from('student_projections')
      .insert([{ grade, branch, zone, new_admissions: newAdmissions, existing_admissions: existingAdmissions, total_projection: totalProjection }])
      .select()
      .single();

    if (error) {
      console.error("❌ PROJECTION INSERT ERROR:", error.message);
      throw error;
    }

    res.json({ success: true, projection: data });
  } catch (err) {
    console.error("❌ PROJECTION CREATE ERROR:", err.message, err.details, err.hint);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/zones", async (req, res) => {
  try {
    const { data, error } = await supabase.from('branches').select('zone').not('zone', 'is', null).order('zone');
    if (error) throw error;

    // Get unique zones
    const uniqueZones = data ? [...new Set(data.map(item => item.zone))] : [];
    res.json(uniqueZones);
  } catch (err) {
    console.error("❌ ZONES FETCH ERROR:", err.message, err.details, err.hint);
    res.status(500).send(err.message);
  }
});

app.get("/grades", async (req, res) => {
  try {
    const { data, error } = await supabase.from('grades').select('name').order('name');
    if (error) throw error;

    res.json(data ? data.map(row => row.name) : []);
  } catch (err) {
    console.error("❌ GRADES FETCH ERROR:", err.message, err.details, err.hint);
    res.status(500).send(err.message);
  }
});

/* ============================
   ✏ UPDATE
============================ */
app.put("/books/:id", async (req, res) => {
  const d = req.body;
  const id = req.params.id;

  try {
    // 1. Identify the logical group for this book
    const { data: targetBook } = await supabase.from('individual_books').select('material_code, kit_id').eq('id', id).single();
    if (!targetBook) return res.status(404).json({ success: false, error: "Book not found" });

    // 2. Identify the logical kit group (all branches for this kit)
    const { data: seedKit } = await supabase.from('grade_wise_kits').select('name, zone, grade').eq('id', targetBook.kit_id).single();
    if (!seedKit) throw new Error("Parent kit group not found");

    const { data: kitRows } = await supabase
      .from('grade_wise_kits')
      .select('id, branch')
      .eq('name', seedKit.name).eq('zone', seedKit.zone).eq('grade', seedKit.grade);
    
    const kitIds = (kitRows || []).map(r => r.id);

    // 3. Delete existing rows for this material across the kit group
    await supabase.from('individual_books').delete().eq('material_code', targetBook.material_code).in('kit_id', kitIds);

    // 4. Prepare new rows based on updated branch selection
    const zone = String(d.zone || seedKit.zone).trim();
    const grade = String(d.grade || seedKit.grade).trim();
    let branchName = Array.isArray(d.branch) ? d.branch : [String(d.branch || "").trim()];
    branchName = branchName.filter(Boolean);

    const subject = String(d.subject || "").trim();
    const materialName = String(d.material_name || "").trim();
    const materialCode = String(d.material_code || "").trim();
    const taxRate = Number(d.tax_rate) || 0;
    const mandatoryOptional = String(d.mandatory_optional || "").trim();
    const category = String(d.category || "").trim();
    const volume = String(d.volume || "").trim();
    const year = String(d.year || "").trim();
    const author = String(d.author || "").trim();
    const publisher = String(d.publisher || "").trim();
    const qty = Number(d.quantity) || 0;
    const rate = Number(d.per_unit_rate) || 0;
    let mrp = Number(d.mrp) || 0;
    let costPrice = Number(d.cost_price) || 0;
    const compositeCode = String(d.composite_code || "").trim();
    const compositeName = String(d.composite_name || "").trim();

    const { data: pricingData } = await supabase
      .from('pricing')
      .select('mrp, cost_price')
      .eq('material_code', materialCode)
      .maybeSingle();

    if (pricingData) {
      mrp = pricingData.mrp ?? mrp;
      costPrice = pricingData.cost_price ?? costPrice;
    }
    const total = Number(d.total_amount) || qty * rate;

    const rows = branchName.map(br => {
      const kitRow = kitRows.find(kr => normalizeText(kr.branch) === normalizeText(br));
      return {
        zone, grade, branch_name: br, subject, material_name: materialName, material_code: materialCode,
        tax_rate: taxRate, mandatory_optional: mandatoryOptional, category, volume, year,
        author, publisher, quantity: qty, per_unit_rate: rate, total_amount: total,
        mrp, cost_price: costPrice, composite_code: compositeCode, composite_name: compositeName, 
        kit_id: kitRow ? kitRow.id : targetBook.kit_id
      };
    });

    const { data, error } = await supabase
      .from('individual_books')
      .insert(rows)
      .select();

    if (error) throw error;

    // Aggregate for the UI
    const responseBook = (data && data.length > 0) ? { 
      ...data[0], 
      branch_name: data.map(b => b.branch_name) 
    } : null;

    console.log("✏ UPDATED:", id);
    res.json({ success: true, book: responseBook });

  } catch (err) {
    console.error("❌ UPDATE ERROR:", err.message, err.details, err.hint);
    res.status(500).send(err.message);
  }
});

// PUT /pricing/:id - Update a pricing record
app.put("/pricing/:id", async (req, res) => {
  const { id } = req.params;
  const { material_code, mrp, cost_price } = req.body; // Assuming these are the fields to update

  try {
    const { data, error } = await supabase
      .from('pricing')
      .update({ material_code: String(material_code).trim(), mrp: Number(mrp), cost_price: Number(cost_price) })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: "Pricing record not found." });

    console.log("✏ UPDATED Pricing:", id);
    res.json({ success: true, record: data });
  } catch (err) {
    console.error("❌ PRICING UPDATE ERROR:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /grades/:id - Update a grade record
app.put("/grades/:id", async (req, res) => {
  const { id } = req.params;
  const { name } = req.body; // Assuming 'name' is the field to update

  try {
    const { data, error } = await supabase
      .from('grades')
      .update({ name: String(name).trim() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: "Grade record not found." });

    console.log("✏ UPDATED Grade:", id);
    res.json({ success: true, record: data });
  } catch (err) {
    console.error("❌ GRADE UPDATE ERROR:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /branches/:id - Update a branch record
app.put("/branches/:id", async (req, res) => {
  const { id } = req.params;
  const { name, zone } = req.body;
  try {
    const { data, error } = await supabase.from('branches').update({ name: String(name).trim(), zone: String(zone).trim() }).eq('id', id).select().single();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: "Branch record not found." });
    res.json({ success: true, record: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put("/student_projections/:id", async (req, res) => {
  const { id } = req.params;
  const {
    grade, branch, zone,
    new_admissions, existing_admissions, total_projection
  } = req.body;

  try {
    const payload = {
      grade: String(grade || "").trim(),
      branch: String(branch || "").trim(),
      zone: String(zone || "").trim(),
      new_admissions: Number(new_admissions) || 0,
      existing_admissions: Number(existing_admissions) || 0,
      total_projection: Number(total_projection) || 0
    };

    const { data, error } = await supabase.from('student_projections').update(payload).eq('id', id).select().single();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: "Projection record not found." });
    res.json({ success: true, record: data });
  } catch (err) {
    console.error("❌ PROJECTION UPDATE ERROR:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/student_projections/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const { error, count } = await supabase.from('student_projections').delete({ count: 'exact' }).eq('id', id);
    if (error) throw error;
    if (count === 0) return res.status(404).json({ success: false, error: "Projection record not found." });
    res.json({ success: true, affected: count });
  } catch (err) {
    console.error("❌ PROJECTION DELETE ERROR:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /books/:id - Delete an individual book record
/* ============================
   ❌ DELETE
============================ */
app.delete("/books/:id", async (req, res) => {
  try {
    const bookId = req.params.id;
    
    // 1. Identify the logical book and its kit group
    const { data: targetBook } = await supabase
      .from('individual_books')
      .select('material_code, kit_id')
      .eq('id', bookId)
      .single();

    let count = 0;
    if (targetBook) {
      const { data: seedKit } = await supabase.from('grade_wise_kits').select('name, zone, grade').eq('id', targetBook.kit_id).single();
      if (seedKit) {
        const { data: kitRows } = await supabase.from('grade_wise_kits').select('id').eq('name', seedKit.name).eq('zone', seedKit.zone).eq('grade', seedKit.grade);
        const kitIds = (kitRows || []).map(r => r.id);
        
        // 2. Delete all rows for this material across all branch kits in the group
        const deleteRes = await supabase.from('individual_books').delete({ count: 'exact' }).eq('material_code', targetBook.material_code).in('kit_id', kitIds);
        count = deleteRes.count || 0;
        if (deleteRes.error) throw deleteRes.error;
      }
    }
      
    
    console.log(`🗑️ DELETE REQUEST: ID ${bookId}, Rows Deleted: ${count}`);

    if (count === 0) {
      return res.status(404).json({ success: false, error: "Book record not found in database. No deletion occurred." });
    }

    res.json({ success: true, affected: count });
  } catch (err) {
    console.error("❌ DELETE ERROR:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /kits/:id - Delete a kit and its associated books
/* ============================
   ❌ DELETE KIT
============================ */
app.delete("/kits/:id", async (req, res) => {
  try {
    const kitId = req.params.id;

    // 1. Delete associated books first and capture the result
    const { error: booksError, count: booksDeleted } = await supabase
      .from('individual_books')
      .delete({ count: 'exact' })
      .eq('kit_id', kitId);
    
    if (booksError) {
      console.error(`❌ Error deleting books for Kit ${kitId}:`, booksError.message);
      throw new Error(`Failed to delete associated books: ${booksError.message}`);
    }
    console.log(`🧹 Associated books removed: ${booksDeleted} for Kit ID ${kitId}`);

    // 2. Delete the kit itself
    const { error } = await supabase.from('grade_wise_kits').delete().eq('id', kitId);
    if (error) throw error;

    console.log("🗑️ KIT DELETED:", kitId);
    res.json({ success: true, books_affected: booksDeleted });
  } catch (err) {
    console.error("❌ KIT DELETE ERROR:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ============================
   ➕ ADD USER
============================ */
app.post("/users", async (req, res) => {
  const d = req.body;

  try {
    const username = String(d.username || "").trim();
    const password = String(d.password || "").trim();
    const role = String(d.role || "Admin").trim();
    const rights = JSON.stringify(d.rights || []);

    const { data, error } = await supabase
      .from('book_list_users')
      .insert([{ username, password, role, rights }])
      .select('id, username, role, rights')
      .single();

    console.log("✅ USER CREATED:", username);
    res.json({ success: true, user: data });

  } catch (err) {
    console.error("❌ USER INSERT ERROR:", err.message, err.details, err.hint);
    res.status(500).send(err.message);
  }
});

app.get("/users", async (req, res) => {
  try {
    const { data, error } = await supabase.from('book_list_users').select('*').order('id', { ascending: false });
    if (error) throw error;

    const formattedUsers = (data || []).map(row => {
      let parsedRights = [];
      if (row.rights) {
        // Handle both stringified JSON and already-parsed JSONB types
        if (typeof row.rights === 'string') {
          try {
            parsedRights = JSON.parse(row.rights);
          } catch (e) {
            parsedRights = [];
          }
        } else if (Array.isArray(row.rights)) {
          parsedRights = row.rights;
        }
      }
      return { ...row, rights: parsedRights };
    });

    res.json(formattedUsers);
  } catch (err) {
    console.error("❌ USERS FETCH ERROR:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put("/users/:id", async (req, res) => {
  const d = req.body;
  try {
    const username = String(d.username || "").trim();
    const password = String(d.password || "").trim();
    const role = String(d.role || "Admin").trim();
    const rights = JSON.stringify(d.rights || []);

    const { data, error } = await supabase
      .from('book_list_users')
      .update({ username, password, role, rights })
      .eq('id', req.params.id)
      .select()
      .single();

    if (!data) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, user: data });
  } catch (err) {
    console.error("❌ USER UPDATE ERROR:", err.message, err.details, err.hint);
    res.status(500).send(err.message);
  }
});

// DELETE /pricing/:id - Delete a pricing record
app.delete("/pricing/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const { error, count } = await supabase
      .from('pricing')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) throw error;
    if (count === 0) return res.status(404).json({ success: false, error: "Pricing record not found." });

    console.log("🗑️ DELETED Pricing:", id);
    res.json({ success: true, affected: count });
  } catch (err) {
    console.error("❌ PRICING DELETE ERROR:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /grades/:id - Delete a grade record
app.delete("/grades/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const { error, count } = await supabase
      .from('grades')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) throw error;
    if (count === 0) return res.status(404).json({ success: false, error: "Grade record not found." });

    console.log("🗑️ DELETED Grade:", id);
    res.json({ success: true, affected: count });
  } catch (err) {
    console.error("❌ GRADE DELETE ERROR:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /tables - Get list of allowed tables for explorer
/* ============================
   🗄️ DATABASE EXPLORER
============================ */
app.get("/tables", async (req, res) => {
  // We provide the list of tables relevant to this application
  const tables = [
    { table_name: "individual_books" },
    { table_name: "grade_wise_kits" },
    { table_name: "pricing" },
    { table_name: "branches" },
    { table_name: "grades" },
    { table_name: "student_projections" },
    { table_name: "book_list_users" },
    { table_name: "purchase_orders" }
  ];
  res.json(tables);
});

// GET /data/:table - Get data for a specific table with optional filters
app.get("/data/:table", async (req, res) => {
  const { table } = req.params;
  const allowedTables = ["individual_books", "grade_wise_kits", "pricing", "branches", "grades", "student_projections", "book_list_users", "purchase_orders"];
  
  if (!allowedTables.includes(table)) {
    return res.status(403).json({ success: false, error: "Access denied to requested table." });
  }

  // Apply filters based on table
  let query = supabase.from(table).select("*");
  if (table === 'pricing') {
    const materialCode = req.query.material_code;
    if (materialCode) {
      query = query.ilike('material_code', `%${materialCode}%`); // Case-insensitive partial match
    }
  } else if (table === 'branches') {
    const nameFilter = req.query.name;
    const zoneFilter = req.query.zone;
    if (nameFilter) query = query.ilike('name', `%${nameFilter}%`);
    if (zoneFilter) query = query.ilike('zone', `%${zoneFilter}%`);
  } else if (table === 'grades') {
    const nameFilter = req.query.name;
    if (nameFilter) query = query.ilike('name', `%${nameFilter}%`);
  } else if (table === 'student_projections') {
    const gradeFilter = req.query.grade;
    const branchFilter = req.query.branch;
    const zoneFilter = req.query.zone;
    if (gradeFilter) query = query.ilike('grade', `%${gradeFilter}%`);
    if (branchFilter) query = query.ilike('branch', `%${branchFilter}%`);
    if (zoneFilter) query = query.ilike('zone', `%${zoneFilter}%`);
  } else if (table === 'book_list_users') {
    // For book_list_users, ensure only admin can view/filter
    // In a real app, this would be handled by authentication middleware
    // For now, we'll just allow filtering if the frontend sends it
    const usernameFilter = req.query.username;
    if (usernameFilter) query = query.ilike('username', `%${usernameFilter}%`);
  } else if (table === 'purchase_orders') {
    const zoneFilter = req.query.zone;
    const skuFilter = req.query.sku;
    const nameFilter = req.query.name;
    if (zoneFilter) query = query.ilike('zone', `%${zoneFilter}%`);
    if (skuFilter) query = query.ilike('sku', `%${skuFilter}%`);
    if (nameFilter) query = query.ilike('name', `%${nameFilter}%`);
  }

  try {
    const { data, error } = await query; // Removed limit to allow scrolling through all records

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(`❌ EXPLORER FETCH ERROR (${table}):`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /export-table/:table - Export data from a specific table as XLSX
app.get("/export-table/:table", async (req, res) => {
  const { table } = req.params;
  const allowedTables = ["individual_books", "grade_wise_kits", "pricing", "branches", "grades", "student_projections", "book_list_users", "purchase_orders"];

  if (!allowedTables.includes(table)) {
    return res.status(403).json({ success: false, error: "Access denied to requested table." });
  }

  try {
    const { data, error } = await supabase.from(table).select("*");
    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).send("No data to export for this table.");
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, table);

    const filePath = `/tmp/${table}-export.xlsx`;
    XLSX.writeFile(wb, filePath);

    res.download(filePath, `${table}-export.xlsx`, (err) => {
      if (err) {
        console.error("❌ EXPORT DOWNLOAD ERROR:", err.message);
      }
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) console.error("❌ ERROR DELETING TEMP FILE:", unlinkErr.message);
      });
    });

  } catch (err) {
    console.error(`❌ EXPORT TABLE ERROR (${table}):`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /users/:id - Delete a user record (Admin only)
app.delete("/users/:id", async (req, res) => {
  try {
    const { error } = await supabase
      .from('book_list_users')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("❌ USER DELETE ERROR:", err.message, err.details, err.hint);
    res.status(500).send(err.message);
  }
});

/* ============================
   📦 PURCHASE ORDERS CRUD
============================ */
app.post("/purchase_orders", async (req, res) => {
  try {
    const { zone, sku, name, quantity } = req.body;
    const { data, error } = await supabase
      .from('purchase_orders')
      .insert([{ 
        zone: String(zone || "").trim(), 
        sku: String(sku || "").trim(), 
        name: String(name || "").trim(), 
        quantity: Number(quantity) || 0 
      }])
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, record: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put("/purchase_orders/:id", async (req, res) => {
  try {
    const { zone, sku, name, quantity } = req.body;
    const { data, error } = await supabase
      .from('purchase_orders')
      .update({ 
        zone: String(zone || "").trim(), 
        sku: String(sku || "").trim(), 
        name: String(name || "").trim(), 
        quantity: Number(quantity) || 0 
      })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, record: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/purchase_orders/:id", async (req, res) => {
  try {
    const { error } = await supabase.from('purchase_orders').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ============================
   � DASHBOARD ENDPOINTS
============================ */

// Function to recalculate and store dashboard data in dashboard_item_summary
async function rebuildDashboardSummary() {
  console.log("🚀 Starting Dashboard Summary Rebuild...");
  
  // 1. Fetch all required source data
  const [
    { data: books },
    { data: orders },
    { data: projections },
    { data: boms },
    { data: branches }
  ] = await Promise.all([
    supabase.from('individual_books').select('*'), 
    supabase.from('orders_table').select('*'),
    supabase.from('student_projections').select('*'),
    supabase.from('sku_sap_bom').select('*'),
    supabase.from('branches').select('name, zone') // Fetch all branches for zone mapping
  ]);

  // 2. Map branch to zone for reliable lookups
  const branchToZoneMap = new Map();
  (branches || []).forEach(b => branchToZoneMap.set(normalizeText(b.name), b.zone));

  // 3. Map projections: branch|grade -> total_projection
  const projMap = new Map();
  (projections || []).forEach(p => {
    const key = `${normalizeText(p.branch)}|${String(p.grade).trim().toLowerCase()}`;
    projMap.set(key, (projMap.get(key) || 0) + (Number(p.total_projection) || 0));
  });

  // 4. Aggregate orders by branch|sku for quick lookup
  const orderAggregatedMap = new Map(); // Key: branch_norm|sku_norm -> total_qty
  (orders || []).forEach(o => {
    const brNorm = normalizeText(o.branch_name || o.branch || "");
    const sku = normalizeSku(o.material_code || o.sku || o.item_sku || "");
    if (!brNorm || !sku) return;
    const key = `${brNorm}|${sku}`;
    orderAggregatedMap.set(key, (orderAggregatedMap.get(key) || 0) + (Number(o.quantity) || 0));
  });

  // 5. Build Material-Branch-Grade entries from ALL sources
  const summaryMap = new Map(); // Key: material_code|branch_name|grade

  // Helper to add/initialize entry
  const addEntry = (materialCode, materialName, branchName, gradeName, zoneName) => {
    if (!materialCode) return null;
    const brNorm = normalizeText(branchName);
    const skuNorm = normalizeSku(materialCode);
    const gradeNorm = String(gradeName || "").trim();
    const key = `${skuNorm}|${brNorm}|${gradeNorm}`;

    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        material_code: skuNorm,
        material_name: materialName || "Unknown",
        branch_name: branchName || "",
        zone: zoneName || branchToZoneMap.get(brNorm) || "Unknown",
        grade: gradeNorm,
        projection_quantity: 0,
        paid_quantity: 0
      });
    }
    return summaryMap.get(key);
  };

  // Initialize from individual_books (Source for Projections)
  (books || []).forEach(b => {
    const entry = addEntry(b.material_code, b.material_name, b.branch_name || b.branch, b.grade, b.zone);
    if (!entry) return;
    const brNorm = normalizeText(entry.branch_name);
    const pQty = projMap.get(`${brNorm}|${String(entry.grade).toLowerCase()}`) || 0;
    entry.projection_quantity += pQty * (Number(b.quantity) || 0);
  });

  // Initialize from orders_table (Source for Paid Quantity)
  (orders || []).forEach(o => {
    addEntry(o.material_code || o.sku || o.item_sku, o.item_name || o.name, o.branch_name || o.branch, o.grade_name, o.zone);
  });

  // 6. Pre-calculate BOM component map
  const bomComponentToParentMap = new Map();
  (boms || []).forEach(bom => {
    const componentSku = normalizeSku(bom.component_code);
    if (!bomComponentToParentMap.has(componentSku)) bomComponentToParentMap.set(componentSku, []);
    bomComponentToParentMap.get(componentSku).push({
      parentSku: normalizeSku(bom.composite_code),
      qtyPerParent: Number(bom.component_quantity) || 1
    });
  });

  // 7. Calculate Paid Quantities with BOM expansion
  for (const [key, row] of summaryMap) {
    const brNorm = normalizeText(row.branch_name);
    const mSku = row.material_code;

    // Direct SKU orders for this branch
    let totalPaid = orderAggregatedMap.get(`${brNorm}|${mSku}`) || 0;

    // BOM Expansion: Sum up orders for kits that contain this component
    const parentKits = bomComponentToParentMap.get(mSku) || [];
    parentKits.forEach(bomEntry => {
      const parentOrders = orderAggregatedMap.get(`${brNorm}|${bomEntry.parentSku}`) || 0;
      totalPaid += parentOrders * bomEntry.qtyPerParent;
    });

    row.paid_quantity = totalPaid;
  }

  // 8. Clear and Refresh dashboard_item_summary Table
  const finalRows = Array.from(summaryMap.values()).map(r => ({
    ...r,
    total_requirement: Math.max(r.projection_quantity, r.paid_quantity),
    already_ordered_quantity: 0, // POs are global and best handled at aggregation time in GET
    final_requirement: Math.max(r.projection_quantity, r.paid_quantity)
  }));

  const { error: deleteError } = await supabase.from('dashboard_item_summary').delete().neq('id', 0);
  if (deleteError) throw deleteError;

  // Chunked Insert (Vercel/Supabase payload limits)
  const chunkSize = 500;
  for (let i = 0; i < finalRows.length; i += chunkSize) {
    const chunk = finalRows.slice(i, i + chunkSize);
    const { error: insertError } = await supabase.from('dashboard_item_summary').insert(chunk);
    if (insertError) throw insertError;
  }

  console.log(`✅ Dashboard Summary Rebuilt. Total records stored: ${finalRows.length}`);
  return finalRows.length;
}

// POST /dashboard/rebuild - Trigger manual summary table update
app.post("/dashboard/rebuild", async (req, res) => {
  try {
    const count = await rebuildDashboardSummary();
    res.json({ success: true, count });
  } catch (err) {
    console.error("❌ REBUILD ERROR:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /dashboard/item-wise-summary - Get aggregated item summary with grade-wise projection
app.get("/dashboard/item-wise-summary", async (req, res) => {
  try {
    const zoneFilter = String(req.query.zone || "").trim();
    const branchFilter = String(req.query.branch || "").trim();
    const gradeFilter = String(req.query.grade || "").trim();
    const materialNameFilter = String(req.query.material_name || "").trim();

    // 1. Fetch pre-calculated rows from the summary table with filters applied
    let query = supabase.from('dashboard_item_summary').select('*');
    if (zoneFilter) query = query.eq('zone', zoneFilter);
    if (branchFilter) query = query.eq('branch_name', branchFilter);
    if (gradeFilter) query = query.eq('grade', gradeFilter);
    if (materialNameFilter) query = query.ilike('material_name', `%${materialNameFilter}%`);

    const { data: rows, error } = await query;
    if (error) throw error;

    // 2. Fetch POs globally for calculation subtract logic
    const { data: poData } = await supabase.from('purchase_orders').select('sku, quantity'); // Fetch all POs
    const poMap = new Map();
    (poData || []).forEach(po => {
      const sku = normalizeSku(po.sku);
      poMap.set(sku, (poMap.get(sku) || 0) + (Number(po.quantity) || 0));
    });

    // 3. Aggregate granular branch rows into the material-grouped structure expected by the frontend
    const aggregated = {};
    const uniqueZones = new Set();

    (rows || []).forEach(r => {
      const sku = r.material_code;
      const zone = r.zone;
      uniqueZones.add(zone);

      if (!aggregated[sku]) {
        aggregated[sku] = {
          material_code: sku,
          material_name: r.material_name,
          zone_data: {},
          total_projection: 0,
          total_paid_quantity: 0
        };
      });

      const item = aggregated[sku];
      if (!item.zone_data[zone]) item.zone_data[zone] = { projection: 0, paid_quantity: 0 };
      
      item.zone_data[zone].projection += Number(r.projection_quantity) || 0;
      item.zone_data[zone].paid_quantity += Number(r.paid_quantity) || 0;
      item.total_projection += Number(r.projection_quantity) || 0;
      item.total_paid_quantity += Number(r.paid_quantity) || 0;
    });

    // 4. Calculate final requirement fields and format for return
    const allZonesSorted = Array.from(uniqueZones).sort();
    const resultData = Object.values(aggregated).map(item => {
      const totalReq = Math.max(item.total_projection, item.total_paid_quantity);
      const poQty = poMap.get(item.material_code) || 0;
      return {
        ...r,
        total_requirement: totalReq,
        already_ordered_quantity: poQty,
        final_requirement: totalReq - poQty
      };
    }).sort((a, b) => a.material_code.localeCompare(b.material_code));

    resultData.sort((a, b) => (a.material_code || "").localeCompare(b.material_code || ""));

    res.json({ zones: allZonesSorted, data: resultData });
  } catch (err) {
    console.error("❌ DASHBOARD FETCH ERROR:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
/* ============================
   🔍 DASHBOARD SOURCE DRILL-DOWN
============================ */
app.get("/dashboard/paid-quantity-source", async (req, res) => {
  try {
    const { material_code, zone } = req.query;
    if (!material_code) return res.status(400).json({ error: "Material code required" });
    if (!zone) return res.status(400).json({ error: "Zone required" });

    const normMaterialCode = normalizeSku(material_code); // Normalize material code
    const targetZone = normalizeText(zone);

    // Fetch all relevant data
    const { data: orderData } =
  await supabase
    .from('orders_table')
    .select('*')
    .range(0, 50000);
    const { data: bomData } = await supabase
  .from('sku_sap_bom')
  .select('*')
  .range(0, 50000);
    const { data: booksData } = await supabase.from('individual_books').select('*');
    const { data: branchList } = await supabase.from('branches').select('name, zone');

    // Create normalized zone mapping
    const branchToZoneMapNorm = {};
    (branchList || []).forEach(b => branchToZoneMapNorm[normalizeText(b.name)] = b.zone);
    const branchToZonesSet = {}; 
    const activeBranchesNorm = new Set();

    (branchList || []).forEach(b => {
      const br = normalizeText(b.name);
      if (!branchToZonesSet[br]) branchToZonesSet[br] = new Set();
      if (b.zone) branchToZonesSet[br].add(normalizeText(b.zone));
    });
    (booksData || []).forEach(b => {
  const branches = String(b.branch_name || b.branch || "")
    .split(/[,\n\r|]+/)
    .map(s => normalizeText(s))
    .filter(Boolean);

  branches.forEach(br => {
    if (!branchToZonesSet[br]) {
      branchToZonesSet[br] = new Set();
    }

    if (b.zone) {
  branchToZonesSet[br].add(normalizeText(b.zone));
}

    if (normalizeSku(b.material_code) === normMaterialCode) {
      activeBranchesNorm.add(br);
    }
  });
});
    // Identify active branches for this material and Setup Lookups for kit materials
    const kitMap = {}; 
    (booksData || []).forEach(b => {
      const matCode = normalizeSku(b.material_code);
      if (matCode === normMaterialCode) {
        const compCode = normalizeSku(b.composite_code);
        if (compCode) kitMap[compCode] = Number(b.quantity) || 0;
      }
    });

    // Setup BOM lookups
    const bomParents = {}; // parentCode -> qtyPerParent
    (bomData || []).forEach(b => {
      if (normalizeSku(b.component_code) === normMaterialCode) {
        bomParents[normalizeSku(b.composite_code)] = Number(b.component_quantity) || 0;
      }
    });

    // Filter and calculate
    const details = [];
    
    (orderData || []).forEach(order => {
      console.log("ORDER SAMPLE", order);
      const brNorm = normalizeText(order.branch_name || order.branch || "");
      
      const orderZone =
  normalizeText(
    branchToZoneMapNorm[brNorm] ||
    order.zone ||
    ""
  );

if (orderZone !== targetZone) {
  return;
}
      const sku = normalizeSku(order.material_code || order.sku || order.item_sku || ""); // Normalize SKU

      let contribution = 0;
      let source = "";

      if (sku === normMaterialCode) {
        contribution = Number(order.quantity) || 0;
        source = "Direct Order";
      } else if (bomParents[sku] !== undefined) {
        contribution = (Number(order.quantity) || 0) * bomParents[sku];
        source = `BOM Parent (${order.item_sku})`;
      } else if (kitMap[sku] !== undefined) {
        contribution = (Number(order.quantity) || 0) * kitMap[sku];
        source = `Kit Order (${order.item_sku})`;
      }

      if (contribution > 0) {
        details.push({
          branch_name: order.branch_name || "N/A",
          grade_name: order.grade_name || "N/A",
          ordered_sku: order.item_sku || "N/A",
          item_name: order.item_name || "N/A",
          ordered_qty: order.quantity || 0,
          source: source,
          contribution: contribution
        });
      }
    });

    res.json(details);
  } catch (err) {
    console.error("Paid Qty source error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/dashboard/total-paid-quantity-source", async (req, res) => {
  try {
    const { material_code } = req.query;
    if (!material_code) return res.status(400).json({ error: "Material code required" });
    const normMaterialCode = normalizeSku(material_code);

    const { data: orderData } =
  await supabase
    .from('orders_table')
    .select('*')
    .range(0, 50000);
    const { data: bomData } = await supabase
  .from('sku_sap_bom')
  .select('*')
  .range(0, 50000);
    const { data: booksData } = await supabase
  .from('individual_books')
  .select('*')
  .range(0, 50000);

    const kitMap = {};
    const activeBranchesNorm = new Set();
    (booksData || []).forEach(b => {
      const matCode = normalizeSku(b.material_code);
      if (matCode === normMaterialCode) {
        const brs = (Array.isArray(b.branch_name) ? b.branch_name : String(b.branch_name || b.branch || "").split(/[,\n\r|]+/))
          .map(s => normalizeText(s))
          .filter(Boolean);
        brs.forEach(brNorm => activeBranchesNorm.add(brNorm));
        const compCode = normalizeSku(b.composite_code);
        if (compCode) kitMap[compCode] = Number(b.quantity) || 0;
      }
    });

    const bomParents = {};
    (bomData || []).forEach(b => {
      if (normalizeSku(b.component_code) === normMaterialCode) {
        bomParents[normalizeSku(b.composite_code)] = Number(b.component_quantity) || 0;
      }
    });

    const details = [];
    (orderData || []).forEach(order => {
      const sku = normalizeSku(order.material_code || order.sku || order.item_sku || "");
      const brNorm = normalizeText(order.branch_name || order.branch || "");
      

      let contribution = 0;
      let source = "";
      if (sku === normMaterialCode) {
        contribution = Number(order.quantity) || 0;
        source = "Direct Order";
      } else if (bomParents[sku] !== undefined) {
        contribution = (Number(order.quantity) || 0) * bomParents[sku];
        source = `BOM Parent (${order.item_sku})`;
      } else if (kitMap[sku] !== undefined) {
        contribution = (Number(order.quantity) || 0) * kitMap[sku];
        source = `Kit Order (${order.item_sku})`;
      }

      if (contribution > 0) {
        details.push({
          zone: order.zone || "N/A",
          branch_name: order.branch_name || "N/A",
          grade_name: order.grade_name || "N/A",
          ordered_sku: order.item_sku || "N/A",
          item_name: order.item_name || "N/A",
          ordered_qty: order.quantity || 0,
          source: source,
          contribution: contribution
        });
      }
    });
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/dashboard/projection-source", async (req, res) => {
  try {
    const { material_code, zone } = req.query;
    if (!material_code) return res.status(400).json({ error: "Material code required" });
    
    const normMaterialCode = String(material_code).trim().toLowerCase();
    const targetZoneLower = String(zone || "").trim().toLowerCase();

    const { data: booksData } = await supabase.from('individual_books').select('*').ilike('material_code', normMaterialCode);
    if (!booksData || booksData.length === 0) return res.json([]);

    let projQuery = supabase.from('student_projections').select('*');
    if (zone) projQuery = projQuery.ilike('zone', targetZoneLower);
    const { data: projData } = await projQuery;

    const { data: branchList } = await supabase.from('branches').select('name, zone');
    const branchToZoneMap = {};
    (branchList || []).forEach(b => {
      const bNorm = normalizeText(b.name);
      if (bNorm) branchToZoneMap[bNorm] = b.zone;
    });

    const details = [];
    booksData.forEach(book => {
      const kitName = book.composite_name || "N/A";
      const qtyInKit = Number(book.quantity) || 0;
      const grade = String(book.grade).toLowerCase().trim();
      const branches = (Array.isArray(book.branch_name) ? book.branch_name : String(book.branch_name || book.branch || "").split(/[,\n\r|]+/))
        .map(s => String(s || "").trim())
        .filter(Boolean);

      branches.forEach(bName => {
        const brNorm = normalizeText(bName);
        const bZoneRaw = branchToZoneMap[brNorm] || String(book.zone || "");
        const bZoneLower = bZoneRaw.trim().toLowerCase();

        if (targetZoneLower && bZoneLower !== targetZoneLower) return;

        const projection = (projData || []).find(p => {
          const pGrade = String(p.grade || "").toLowerCase().trim();
          const pBranchNorm = normalizeText(p.branch);
          return pGrade === grade && pBranchNorm === brNorm;
        });

        if (projection) {
          const studentCount = Number(projection.total_projection) || 0;
          const contribution = studentCount * qtyInKit;
          if (contribution > 0) {
            details.push({
              kit_name: kitName,
              grade: book.grade,
              branch: bName,
              zone: bZoneRaw,
              students: studentCount,
              qty_kit: qtyInKit,
              contribution: contribution
            });
          }
        }
      });
    });
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/dashboard/total-projection-source", async (req, res) => {
  try {
    const { material_code } = req.query;
    if (!material_code) return res.status(400).json({ error: "Material code required" });
    
    const normMaterialCode = String(material_code).trim().toLowerCase();

    const { data: booksData } = await supabase.from('individual_books').select('*').ilike('material_code', normMaterialCode);
    if (!booksData || booksData.length === 0) return res.json([]);

    const { data: projData } = await supabase.from('student_projections').select('*');

    const { data: branchList } = await supabase.from('branches').select('name, zone');
    const branchToZoneMap = {};
    (branchList || []).forEach(b => {
      const bNorm = normalizeText(b.name);
      if (bNorm) branchToZoneMap[bNorm] = b.zone;
    });

    const details = [];
    booksData.forEach(book => {
      const kitName = book.composite_name || "N/A";
      const qtyInKit = Number(book.quantity) || 0;
      const grade = String(book.grade).toLowerCase().trim();
      const branches = (Array.isArray(book.branch_name) ? book.branch_name : String(book.branch_name || book.branch || "").split(/[,\n\r|]+/))
        .map(s => String(s || "").trim())
        .filter(Boolean);

      branches.forEach(bName => {
        const brNorm = normalizeText(bName);
        const bZoneRaw = branchToZoneMap[brNorm] || String(book.zone || "");

        const projection = (projData || []).find(p => {
          const pGrade = String(p.grade || "").toLowerCase().trim();
          const pBranchNorm = normalizeText(p.branch);
          return pGrade === grade && pBranchNorm === brNorm;
        });

        if (projection) {
          const studentCount = Number(projection.total_projection) || 0;
          const contribution = studentCount * qtyInKit;
          if (contribution > 0) {
            details.push({
              kit_name: kitName,
              grade: book.grade,
              branch: bName,
              zone: bZoneRaw,
              students: studentCount,
              qty_kit: qtyInKit,
              contribution: contribution
            });
          }
        }
      });
    });
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ============================
   �📥 DOWNLOAD
============================ */
app.get("/download", async (req, res) => {
  const { data, error } = await supabase.from('individual_books').select('*');
  if (error) {
    return res.status(500).send(error.message);
  }

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Books");

  const file = "books.xlsx";
  XLSX.writeFile(wb, file);

  res.download(file);
});

/* ============================
   🚀 RUN DISPATCH DATA LOAD
============================ */

// Helper functions
const clean = (value) => {
  if (value == null) return null;
  const v = String(value).trim();
  if (!v || v === 'none' || v === 'null' || v === 'nan') return null;
  if (v.endsWith('.0')) return v.slice(0, -2);
  return v;
};

const toInt = (value) => {
  try {
    if (value == null) return null;
    return Math.floor(parseFloat(value));
  } catch {
    return null;
  }
};

const cleanDatetime = (value) => {
  if (value == null) return null;
  try {
    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) return null;
    if (parsed.getFullYear() < 1900 || parsed.getFullYear() > 2100) return null;
    return parsed;
  } catch {
    return null;
  }
};

const getAccessToken = async () => {
  const response = await axios.post("https://orchids.letseduvate.com/qbox/erp_user/access-token/", {
    refresh: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc5MjgxOTM4NCwianRpIjoiYWZlYzE0YmQ2MDk5NDIxMmI3OTg0NmMzNjhiNjk0MTEiLCJ1c2VyX2lkIjo2NDUxNjMsImVtYWlsIjoibWVlbnVnYS5yYWdoYXZlbmRyYUBvcmNoaWRzaW50bC5lZHUuaW4iLCJmaXJzdF9uYW1lIjoiTUVFTlVHQSBSQUdIQVZFTkRSQSIsImxhc3RfbmFtZSI6IiIsImlzX2FjdGl2ZSI6dHJ1ZSwiaXNfc3VwZXJ1c2VyIjpmYWxzZSwidXNlcm5hbWUiOiIyMDI0MDAwMTE3OF9PSVMiLCJ1c2VyX2xldmVsIjozMywiYWNjZXNzX2xldmVsIjoiem9uZSIsInZlciI6MTB9.9_lvSVFhxyyPy5uX2ov0PDh7yuc3lnnRzjWYgEqgOSQ"
  });
  return response.data.data;
};

const processBranch = async (branch, accessToken, branchToZoneMapInternal) => {
  console.log(`🚀 Fetching branch ${branch}`);

  const url = `https://orchids.finance.letseduvate.com/qbox/ekart/branch-wise-dispatch-report/?finance_session_year=47&branch=${branch}&is_branch_wise_report=true`;

  try {
    const response = await axios.get(url, {
      headers: { "Authorization": `Bearer ${accessToken}` },
      responseType: 'arraybuffer',
      timeout: 120000 // 2 minutes per branch fetch
    });

    const workbook = XLSX.read(response.data, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    // Parse report data
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });

    const localAggregated = new Map();
    let rawCount = 0;

    for (const row of jsonData) {
      try {
        const qty = toInt(row['Quantity']);
        const sku = clean(row['Item SKU']);
        const bName = clean(row['Branch Name']);
        if (!qty || !sku || !bName) continue;
    
        const grade = clean(row['Grade Name']);
        const item = clean(row['Item Name']);
        const zName = clean(row['Zone Name']);
        const normBranch = bName.toLowerCase();
        const zone = branchToZoneMapInternal[normBranch] || zName || "Unknown";
        
        const key = `${zone}||${bName}||${grade}||${sku}||${item}`;
        if (localAggregated.has(key)) {
          localAggregated.get(key).quantity += qty;
        } else {
          localAggregated.set(key, { zone, branch_name: bName, grade_name: grade, item_sku: sku, item_name: item, quantity: qty });
        }
        rawCount++;
      } catch (e) {
        // Skip malformed rows
      }
    }

    console.log(`✅ branch=${branch} done; raw_rows=${rawCount}; aggregated_unique=${localAggregated.size}`);
    return { aggregated: localAggregated, count: rawCount };
  } catch (e) {
    console.error(`Failed branch ${branch}:`, e.message);
    return { failed_branch: branch, error: e.message };
  }
};

// Helper to get all branch IDs from the database (currently not used, hardcoded list is used)
const getAllBranchIds = async () => {
  const { data, error } = await supabase.from('branches').select('id');
  if (error) {
    console.error("❌ Error fetching all branch IDs:", error.message);
    return [];
  }
  return data.map(b => b.id);
};

app.post("/clear-dispatch-data", async (req, res) => {
  const { user } = req.body;
  if (!user || user.role !== 'Admin') {
    return res.status(403).json({ error: "Unauthorized" });
  }
  try {
    console.log("🧹 Clearing orders_table and tracking table...");
    await supabase.from('orders_table').delete().neq('id', 0);
    await supabase.from('completed_branches').delete().neq('id', 0);
    res.json({ success: true, message: "Tables cleared successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/run-dispatch-load", async (req, res) => {
  const { user, branchIds } = req.body;
  if (!user || user.role !== 'Admin') {
    return res.status(403).json({ success: false, error: "Unauthorized" });
  }

  let logs = [];
  const log = (message) => {
    console.log(message);
    logs.push(message);
  };

  try {
    const targetBranches = branchIds || [3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21, 24, 26, 27, 30, 41, 57, 66, 67, 69, 70, 72, 73, 76, 77, 81, 82, 94, 101, 123, 124, 194, 205, 209, 210, 213, 239, 240, 241, 242, 244, 245, 246, 248, 249, 250, 251, 252, 253, 254, 257, 258, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 280, 281, 282, 283, 285, 286, 287, 288, 289, 290, 291, 292, 293, 296, 297, 298, 299, 300, 301, 305, 338, 353, 354, 355, 356, 357, 358, 359, 360, 361, 362, 363, 364, 365, 366, 367, 369, 370, 371, 423, 425, 426, 427, 428, 429, 430, 432, 433, 434, 435, 436, 437, 438, 442, 443, 444, 445, 446, 447, 449, 450, 451];
    log(`🚀 Processing ${targetBranches.length} branches...`);

    const accessToken = await getAccessToken();
    const { data: branchMapping } = await supabase.from('branches').select('name, zone');
    const branchToZoneMapInternal = {};
    (branchMapping || []).forEach(b => { branchToZoneMapInternal[String(b.name || "").trim().toLowerCase()] = b.zone; });

    const aggregatedMap = new Map();
    const failedBranches = [];
    const branchQueue = [...targetBranches];
    const concurrencyLimit = 10;
    let totalRawProcessed = 0;

    const worker = async () => {
      while (branchQueue.length > 0) {
        const branchId = branchQueue.shift();
        let success = false;
        const MAX_RETRIES = 3;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          log(`⏳ Branch ${branchId}: Fetching attempt ${attempt}/${MAX_RETRIES}...`);
          const result = await processBranch(branchId, accessToken, branchToZoneMapInternal);
          if (result && result.aggregated) {
            totalRawProcessed += result.count;
            for (const [key, value] of result.aggregated) {
              if (aggregatedMap.has(key)) aggregatedMap.get(key).quantity += value.quantity;
              else aggregatedMap.set(key, value);
            }
            log(`✅ Branch ${branchId} done: ${result.count} raw rows.`);
            await supabase.from('completed_branches').upsert({ branch_id: branchId, status: 'Completed', rows_fetched: result.count, error_message: null, processed_at: new Date().toISOString() }, { onConflict: 'branch_id' });
            success = true;
            break;
          } else {
            const errorInfo = String((result && result.error) ? result.error : "Network error");
            log(`⚠️ Branch ${branchId} attempt ${attempt} failed: ${errorInfo}`);
            if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 1000 * attempt));
            else await supabase.from('completed_branches').upsert({ branch_id: branchId, status: 'Failed', rows_fetched: 0, error_message: errorInfo, processed_at: new Date().toISOString() }, { onConflict: 'branch_id' });
          }
        }
        if (!success) failedBranches.push(branchId);
      }
    };

    await Promise.all(Array.from({ length: concurrencyLimit }, worker));

    const aggRows = Array.from(aggregatedMap.values());
    if (aggRows.length > 0) {
      log(`Batch inserting ${aggRows.length} records...`);
      const batchSize = 1000;
      for (let i = 0; i < aggRows.length; i += batchSize) {
        const batch = aggRows.slice(i, i + batchSize);
        const { error: insertError } = await supabase.from('orders_table').insert(batch);
        if (insertError) throw insertError;
      }
    }
    res.json({ success: true, message: `Completed ${targetBranches.length} branches.`, logs, failedBranches });
  } catch (err) {
    const errorMsg = String(err?.message || JSON.stringify(err));
    res.status(500).json({ success: false, error: errorMsg, logs });
  }
});

/* ============================
   📊 GET ORDER TABLE
============================ */
app.get("/order-table", async (req, res) => {
  try {
    const branchNameFilter = String(req.query.branch_name || "").trim();
    const gradeNameFilter = String(req.query.grade_name || "").trim();
    const itemSkuFilter = String(req.query.item_sku || "").trim();
    const itemNameFilter = String(req.query.item_name || "").trim();
    const zoneFilter = String(req.query.zone || "").trim();

    let query = supabase.from('orders_table').select('*');

    if (branchNameFilter) query = query.ilike('branch_name', `%${branchNameFilter}%`);
    if (gradeNameFilter) query = query.ilike('grade_name', `%${gradeNameFilter}%`);
    if (itemSkuFilter) query = query.ilike('item_sku', `%${itemSkuFilter}%`);
    if (itemNameFilter) query = query.ilike('item_name', `%${itemNameFilter}%`);
    if (zoneFilter) query = query.eq('zone', zoneFilter);

    query = query.order('branch_name', { ascending: true });

    const { data, error } = await query;

    if (error) throw error; // Propagate Supabase errors
    res.json(data);
  } catch (err) {
    console.error("GET ORDER TABLE ERROR:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ============================
   🚀 START SERVER
============================ */
if (process.env.NODE_ENV !== 'production') {
  app.listen(5000, () =>
    console.log("✅ Backend running at http://localhost:5000")
  );
}

module.exports = app;