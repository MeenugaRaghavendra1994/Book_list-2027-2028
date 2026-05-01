const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first'); 

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

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
   FILE UPLOAD CONFIG
============================ */
// Vercel functions only have write access to /tmp
const upload = multer({ dest: "/tmp" });

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
   📦 GET KITS
============================ */
app.get("/kits", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('grade_wise_kits')
      .select('*')
      .order('id', { ascending: false });

    if (error) throw error;
    res.json(data);
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
    const { data: kit, error: kitError } = await supabase
      .from('grade_wise_kits')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (!kit) {
      return res.status(404).json({ success: false, message: "Kit not found" });
    }

    const { data: books, error: booksError } = await supabase
      .from('individual_books')
      .select('*')
      .eq('kit_id', req.params.id)
      .order('id', { ascending: false });

    kit.books = books || [];
    res.json(kit);
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
    const branchName = String(d.branch || "").trim();
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

    const { data, error } = await supabase
      .from('individual_books')
      .insert([{
        zone, grade, branch_name: branchName, subject, material_name: materialName, material_code: sku,
        tax_rate: taxRate, mandatory_optional: mandatoryOptional, category, volume, year,
        author, publisher, quantity: qty, per_unit_rate: rate, total_amount: total,
        mrp, cost_price: costPrice, composite_code: compositeCode, composite_name: compositeName, kit_id: d.kit_id
      }])
      .select()
      .single();

    if (error) throw error;

    console.log("✅ INSERT SUCCESS. ID generated:", data?.id, "for SKU:", sku);
    res.json({ success: true, book: data });

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
    const branch = String(d.branch || "").trim();
    const grade = String(d.grade || "").trim();
    const status = String(d.status || "Pending").trim();
    const createdBy = String(d.createdBy || "").trim();
    const createdAt = String(d.createdAt || "").trim();
    const statusInfo = String(d.statusInfo || "").trim();

    if (!name || !branch || !grade) {
      return res.status(400).json({ success: false, error: "Missing required fields: name, branch, and grade are mandatory." });
    }

    const { data, error } = await supabase
      .from('grade_wise_kits')
      .insert([{ name, zone, branch, grade, status, created_by: createdBy, created_at: createdAt, status_info: statusInfo }])
      .select()
      .single();

    if (error) {
       console.error("❌ SUPABASE KIT INSERT ERROR:", error.message);
       throw error;
    }

    console.log("✅ KIT INSERT:", name);
    res.json({ success: true, kit: data });

  } catch (err) {
    console.error("❌ KIT INSERT ERROR:", err.message, err.details, err.hint);
    res.status(500).send(err.message);
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

  try {
    const zone = String(d.zone || "").trim();
    const grade = String(d.grade || "").trim();
    const branchName = String(d.branch || "").trim();
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

    // Pricing Lookup from master pricing table
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

    const { data, error } = await supabase
      .from('individual_books')
      .update({
        zone, grade, branch_name: branchName, subject, material_name: materialName, material_code: materialCode,
        tax_rate: taxRate, mandatory_optional: mandatoryOptional, category, volume, year,
        author, publisher, quantity: qty, per_unit_rate: rate, total_amount: total,
        mrp, cost_price: costPrice, composite_code: compositeCode, composite_name: compositeName, kit_id: d.kit_id
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    console.log("✏ UPDATED:", req.params.id);
    res.json({ success: true, book: data });

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
    if (!bookId || bookId === 'undefined' || bookId === 'null') {
      return res.status(400).json({ success: false, error: "A valid Book ID is required for deletion." });
    }

    const { error, count } = await supabase
      .from('individual_books')
      .delete({ count: 'exact' })
      .eq('id', bookId);
      
    if (error) throw error;
    
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
   �📂 BULK UPLOAD (FINAL FIX)
============================ */
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    console.log("📂 Upload Started");

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    console.log(`📊 Processing ${data.length} rows...`);

    // Prepare all rows for bulk insertion
    const rowsToInsert = data.map(d => {
      const qty = parseFloat(d["Quantity"]) || 0;
      const rate = parseFloat(d["Per Unit Rate"]) || 0;
      const total = Number(d["Total Amount"] || d["total_amount"] || qty * rate) || qty * rate;
      
      return {
          zone: String(d["Zone"] || d["Zone Name"] || d["zone_name"] || "").trim(),
          grade: String(d["Grade"] || "").trim(),
          branch_name: String(d["Branch"] || d["Branch Name"] || d["branch_name"] || d["Branch_Name"] || "").trim(),
          material_code: String(d["Material Code"] || "").trim(),
          subject: String(d["Subject"] || ""),
          material_name: String(d["Material Name"] || ""),
          tax_rate: parseFloat(d["Tax Rate"]) || 0,
          mandatory_optional: String(d["Mandatory/Optional"] || d["mandatory_optional"] || ""),
          category: String(d["Category"] || ""),
          volume: String(d["Volume"] || ""),
          year: String(d["Year"] || ""),
          author: String(d["Author"] || ""),
          publisher: String(d["Publisher"] || ""),
          quantity: qty,
          per_unit_rate: rate,
          total_amount: total,
          mrp: parseFloat(d["MRP"] || 0),
          cost_price: parseFloat(d["Cost Price"] || 0),
          composite_code: String(d["Composite Code"] || ""),
          composite_name: String(d["Composite Name"] || "")
      };
    });

    // Bulk Pricing Lookup
    const codes = rowsToInsert.map(r => r.material_code);
    const { data: pricingList } = await supabase
      .from('pricing')
      .select('material_code, mrp, cost_price')
      .in('material_code', codes);

    if (pricingList && pricingList.length > 0) {
      const priceMap = new Map(pricingList.map(p => [p.material_code, p]));
      rowsToInsert.forEach(row => {
        const p = priceMap.get(row.material_code);
        if (p) {
          row.mrp = p.mrp || row.mrp;
          row.cost_price = p.cost_price || row.cost_price;
        }
      });
    }

    const { data: insertedData, error } = await supabase
      .from('individual_books')
      .insert(rowsToInsert);

    if (error) throw error;

    fs.unlinkSync(req.file.path);

    res.json({ success: true, count: rowsToInsert.length });

  } catch (err) {
    console.error("❌ UPLOAD ERROR:", err.message, err.details, err.hint);
    res.status(500).send(err.message);
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
    { table_name: "book_list_users" }
  ];
  res.json(tables);
});

// GET /data/:table - Get data for a specific table with optional filters
app.get("/data/:table", async (req, res) => {
  const { table } = req.params;
  const allowedTables = ["individual_books", "grade_wise_kits", "pricing", "branches", "grades", "student_projections", "book_list_users"];
  
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
  }

  try {
    const { data, error } = await query.limit(100); // Limit to 100 for explorer view

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
  const allowedTables = ["individual_books", "grade_wise_kits", "pricing", "branches", "grades", "student_projections", "book_list_users"];

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
   � DASHBOARD ENDPOINTS
============================ */

// GET /dashboard/item-wise-summary - Get merged data from multiple tables
app.get("/dashboard/item-wise-summary", async (req, res) => {
  try {
    // Fetch all individual books
    const { data: booksData, error: booksError } = await supabase
      .from('individual_books')
      .select('*')
      .limit(500);

    if (booksError) throw booksError;
    if (!booksData || booksData.length === 0) {
      return res.json([]);
    }

    // Fetch all pricing data
    const { data: pricingData, error: pricingError } = await supabase
      .from('pricing')
      .select('*');
    if (pricingError) console.warn("❌ Pricing fetch warning:", pricingError.message);
    const pricingMap = {};
    (pricingData || []).forEach(p => {
      pricingMap[p.material_code] = p;
    });

    // Fetch all student projections
    const { data: projectionsData, error: projectionsError } = await supabase
      .from('student_projections')
      .select('*');
    if (projectionsError) console.warn("❌ Projections fetch warning:", projectionsError.message);
    const projectionsMap = {};
    (projectionsData || []).forEach(p => {
      const key = `${p.grade}_${p.branch}_${p.zone}`;
      projectionsMap[key] = p;
    });

    // Fetch all grade_wise_kits
    const { data: kitsData, error: kitsError } = await supabase
      .from('grade_wise_kits')
      .select('*');
    if (kitsError) console.warn("❌ Grade kits fetch warning:", kitsError.message);
    const kitsMap = {};
    (kitsData || []).forEach(k => {
      kitsMap[`${k.grade}_${k.branch}_${k.zone}`] = k;
    });

    // Merge the data
    const mergedData = booksData.map(book => {
      const pricing = pricingMap[book.material_code] || {};
      const projKey = `${String(book.grade || "").trim()}_${String(book.branch_name || "").trim()}_${String(book.zone || "").trim()}`;
      const projection = projectionsMap[projKey] || {};
      const kit = kitsMap[projKey] || {};

      return {
        // All individual_books columns
        id: book.id,
        category: book.category,
        subject: book.subject,
        material_name: book.material_name,
        material_code: book.material_code,
        tax_rate: book.tax_rate,
        mandatory_optional: book.mandatory_optional,
        volume: book.volume,
        year: book.year,
        author: book.author,
        publisher: book.publisher,
        per_unit_rate: book.per_unit_rate,
        total_amount: book.total_amount,
        composite_code: book.composite_code,
        composite_name: book.composite_name,
        quantity: book.quantity,
        zone: book.zone,
        grade: book.grade,
        branch: book.branch_name,
        created_at: book.created_at,
        updated_at: book.updated_at,
        
        // From pricing table
        mrp: pricing.mrp || book.mrp,
        cost_price: pricing.cost_price || book.cost_price,
        
        // From student_projections table
        new_admissions: projection.new_admissions || 0,
        existing_admissions: projection.existing_admissions || 0,
        
        // From grade_wise_kits table
        kit_name: kit.name || "N/A",
        kit_id: kit.id || book.kit_id || "N/A",
        total_books: (Number(projection.new_admissions || 0) + Number(projection.existing_admissions || 0)) * (Number(book.quantity) || 0)
      };
    });

    res.json(mergedData);
  } catch (err) {
    console.error("❌ DASHBOARD FETCH ERROR:", err.message);
    res.status(500).json({ success: false, error: err.message });
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
   🚀 START SERVER
============================ */
if (process.env.NODE_ENV !== 'production') {
  app.listen(5000, () =>
    console.log("✅ Backend running at http://localhost:5000")
  );
}

module.exports = app;