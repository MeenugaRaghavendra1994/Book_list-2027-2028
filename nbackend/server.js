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

    const branchString = branchValues.join(', ');

    const { data, error } = await supabase
      .from('grade_wise_kits')
      .insert([{ name, zone, branch: branchString, grade, status, created_by: createdBy, created_at: createdAt, status_info: statusInfo }])
      .select()
      .single();

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

    const branchString = branchValues.length ? branchValues.join(', ') : "";

    const { data, error } = await supabase
      .from('grade_wise_kits')
      .update({ name, zone, branch: branchString, grade, status, created_by: createdBy, created_at: createdAt, status_info: statusInfo })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: "Kit record not found." });

    // Synchronize individual books: remove branches no longer in the kit
    const { data: books, error: fetchBooksError } = await supabase
      .from('individual_books')
      .select('id, branch_name')
      .eq('kit_id', id);

    if (!fetchBooksError && books) {
      for (const book of books) {
        if (book.branch_name) {
          const bookBranches = book.branch_name.split(',').map(b => b.trim()).filter(Boolean);
          // Only keep branches that are still present in the updated kit
          const updatedBookBranches = bookBranches.filter(b => branchValues.includes(b));
          const updatedBranchString = updatedBookBranches.join(', ');

          if (updatedBranchString !== book.branch_name) {
            await supabase
              .from('individual_books')
              .update({ branch_name: updatedBranchString })
              .eq('id', book.id);
          }
        }
      }
    }

    res.json({ success: true, kit: data });
  } catch (err) {
    console.error("❌ KIT UPDATE ERROR:", err.message, err.details, err.hint);
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

// GET /dashboard/item-wise-summary - Get aggregated item summary with grade-wise projection
app.get("/dashboard/item-wise-summary", async (req, res) => {
  try {
    const zoneFilter = String(req.query.zone || "").trim();
    const branchFilter = String(req.query.branch || "").trim();
    const gradeFilter = String(req.query.grade || "").trim();

    // Fetch branches for filtering
    const { data: branchList, error: branchError } = await supabase.from('branches').select('*');
    if (branchError) console.warn("❌ Branches fetch warning:", branchError.message);

    let booksQuery = supabase.from('individual_books').select('*');
    if (zoneFilter) booksQuery = booksQuery.eq('zone', zoneFilter);
    if (branchFilter) booksQuery = booksQuery.eq('branch_name', branchFilter);
    if (gradeFilter) booksQuery = booksQuery.eq('grade', gradeFilter);

    const { data: booksData, error: booksError } = await booksQuery;
    if (booksError) throw booksError;
    if (!booksData || booksData.length === 0) {
      return res.json([]);
    }

    // Fetch kits to identify valid branch-grade combinations for projections
    let kitsQuery = supabase.from('grade_wise_kits').select('grade, branch');
    if (zoneFilter) kitsQuery = kitsQuery.eq('zone', zoneFilter);
    if (gradeFilter) kitsQuery = kitsQuery.eq('grade', gradeFilter);
    const { data: kitsData } = await kitsQuery;

    const validGradeBranches = {};
    (kitsData || []).forEach(kit => {
      const g = String(kit.grade || "").trim();
      const bs = String(kit.branch || "").split(',').map(s => s.trim()).filter(Boolean);
      if (!validGradeBranches[g]) validGradeBranches[g] = new Set();
      bs.forEach(b => validGradeBranches[g].add(b));
    });

    let projectionsQuery = supabase.from('student_projections').select('*');
    if (zoneFilter) projectionsQuery = projectionsQuery.eq('zone', zoneFilter);
    if (branchFilter) projectionsQuery = projectionsQuery.eq('branch', branchFilter);
    if (gradeFilter) projectionsQuery = projectionsQuery.eq('grade', gradeFilter);

    const { data: projectionsData, error: projectionsError } = await projectionsQuery;
    if (projectionsError) console.warn("❌ Projections fetch warning:", projectionsError.message);

    // Fetch order table data
    let orderQuery = supabase.from('orders_table').select('*');
    if (zoneFilter) {
      // Since orders_table has branch_name, we need to filter by branches in that zone
      const zoneBranches = (branchList || []).filter(b => b.zone === zoneFilter).map(b => b.name);
      if (zoneBranches.length > 0) {
        orderQuery = orderQuery.in('branch_name', zoneBranches);
      }
    }
    if (branchFilter) orderQuery = orderQuery.eq('branch_name', branchFilter);
    if (gradeFilter) orderQuery = orderQuery.eq('grade_name', gradeFilter);

    const { data: orderData, error: orderError } = await orderQuery;
    if (orderError) console.warn("❌ Order data fetch warning:", orderError.message);

    const orderByGradeItem = {};
    (orderData || []).forEach(order => {
      const grade = String(order.grade_name || "").trim();
      const itemSku = String(order.item_sku || "").trim();
      const key = `${grade}||${itemSku}`;
      orderByGradeItem[key] = (orderByGradeItem[key] || 0) + Number(order.quantity || 0);
    });

    const projectionByGrade = {};
    (projectionsData || []).forEach(p => {
      const g = String(p.grade || "").trim();
      const b = String(p.branch || "").trim();
      // Only count projections for branches that are part of a kit for this specific grade
      if (validGradeBranches[g] && validGradeBranches[g].has(b)) {
        projectionByGrade[g] = (projectionByGrade[g] || 0) + Number(p.total_projection || 0);
      }
    });

    const summary = {};
    (booksData || []).forEach(book => {
      const grade = String(book.grade || "").trim();
      const materialCode = String(book.material_code || "").trim();
      const materialName = String(book.material_name || "").trim();
      if (!grade || !materialCode) return;
      const key = `${grade}||${materialCode}`;

      if (!summary[key]) {
        summary[key] = {
          grade,
          material_code: materialCode,
          material_name: materialName,
          book_list_quantity: 0,
          zones: new Set(),
          branches: new Set()
        };
      }

      summary[key].book_list_quantity += Number(book.quantity || 0);
      summary[key].zones.add(String(book.zone || "").trim());
      summary[key].branches.add(String(book.branch_name || "").trim());
    });

    const result = Object.values(summary)
      .map(item => ({
        grade: item.grade,
        material_code: item.material_code,
        material_name: item.material_name,
        book_list_quantity: item.book_list_quantity,
        projection: projectionByGrade[item.grade] || 0,
        paid_quantity: orderByGradeItem[`${item.grade}||${item.material_code}`] || 0,
        zones: Array.from(item.zones).filter(Boolean),
        branches: Array.from(item.branches).filter(Boolean)
      }))
      .sort((a, b) => {
        if (a.grade === b.grade) {
          return a.material_code.localeCompare(b.material_code);
        }
        return a.grade.localeCompare(b.grade);
      });

    res.json(result);
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
   🚀 RUN DISPATCH DATA LOAD
============================ */

// Helper functions
const clean = (value) => {
  if (value == null || value === '') return null;
  const v = String(value).trim();
  if (v === '' || v.toLowerCase() === 'none' || v.toLowerCase() === 'null' || v.toLowerCase() === 'nan') return null;
  if (v.endsWith('.0')) {
    try {
      return String(Math.floor(parseFloat(v)));
    } catch {
      return v;
    }
  }
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

const processBranch = async (branch, accessToken) => {
  console.log(`🚀 Fetching branch ${branch}`);

  const url = `https://orchids.finance.letseduvate.com/qbox/ekart/branch-wise-dispatch-report/?finance_session_year=47&branch=${branch}&is_branch_wise_report=true`;

  try {
    const response = await axios.get(url, {
      headers: { "Authorization": `Bearer ${accessToken}` },
      responseType: 'arraybuffer',
      timeout: 60000
    });

    const workbook = XLSX.read(response.data, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });

    const rows = [];
    for (const row of jsonData) {
      try {
        rows.push({
          zone_id: clean(row['Zone ID']),
          zone_name: clean(row['Zone Name']),
          branch_id: clean(row['Branch ID']),
          branch_name: clean(row['Branch Name']),
          grade_name: clean(row['Grade Name']),
          branch_pin_code: clean(row['Branch Pin Code']),
          city: clean(row['City']),
          student_name: clean(row['Student Name']),
          erp_id: clean(row['ERP ID']),
          ekart_order_no: clean(row['Ekart Order No']),
          ekart_tracking_no: clean(row['Ekart Tracking No']),
          ekart_order_created_at: clean(row['Ekart Order Created At']),
          transaction_no: clean(row['Transaction No']),
          payment_date: clean(row['Payment Date']),
          payment_month: clean(row['Payment Month']),
          item_sku: clean(row['Item SKU']),
          item_name: clean(row['Item Name']),
          quantity: toInt(row['Quantity']),
          docket_id: clean(row['Docket ID']),
          invoice_id: clean(row['Invoice ID']),
          sub_category_name: clean(row['Sub Category Name']),
          volume: clean(row['Volume']),
          order_type: clean(row['Order Type']),
          expected_delivery_date: clean(row['Expected Delivery Date']),
          shipped_datetime: cleanDatetime(row['Shipped Datetime']),
          delivery_datetime: cleanDatetime(row['Delivery Datetime']),
          current_status: clean(row['Current Status']),
          recieved_by_parent_datetime: cleanDatetime(row['Recieved By Parent Datetime']),
          sales_order: clean(row['Sales Order']),
          packed_datetime: cleanDatetime(row['Packed Datetime'])
        });
      } catch (e) {
        console.error(`Failed to process row for branch ${branch}:`, e.message);
      }
    }

    console.log(`✅ branch=${branch} done; rows=${rows.length}`);
    return { rows };
  } catch (e) {
    console.error(`Failed branch ${branch}:`, e.message);
    return { failed_branch: branch, error: e.message };
  }
};

app.post("/run-dispatch-load", async (req, res) => {
  // Simple auth check: expect user in body
  const { user } = req.body;
  if (!user || user.role !== 'Admin') {
    return res.status(403).json({ success: false, error: "Unauthorized: Admin access required" });
  }

  try {
    const accessToken = await getAccessToken();
    
    // BRANCHES to process (test with one first)
    const BRANCHES = [245];
    
    // Clear existing data in orders_table
    await supabase.from('orders_table').delete().neq('id', 0);
    
    let allRows = [];
    
    // Process branches sequentially to avoid rate limits
    for (const branch of BRANCHES) {
      const result = await processBranch(branch, accessToken);
      if (result.rows) {
        allRows.push(...result.rows);
      }
    }
    
    // Aggregate data by branch_name, grade_name, item_sku, item_name and sum quantities
    console.log("📊 Aggregating data into orders_table");
    const aggregated = {};
    allRows.forEach(row => {
      if (!row.quantity || !row.branch_name || !row.grade_name || !row.item_sku || !row.item_name) return;
      const key = `${row.branch_name}||${row.grade_name}||${row.item_sku}||${row.item_name}`;
      aggregated[key] = {
        branch_name: row.branch_name,
        grade_name: row.grade_name,
        item_sku: row.item_sku,
        item_name: row.item_name,
        quantity: (aggregated[key]?.quantity || 0) + (row.quantity || 0)
      };
    });
    
    const aggRows = Object.values(aggregated);
    if (aggRows.length > 0) {
      const { error: insertError } = await supabase.from('orders_table').insert(aggRows);
      if (insertError) throw insertError;
      console.log(`📥 inserted ${aggRows.length} aggregated rows into orders_table`);
    }
    
    res.json({ 
      success: true, 
      message: `Dispatch data loaded successfully. Processed ${allRows.length} raw rows, aggregated into ${aggRows.length} records.` 
    });
    
  } catch (err) {
    console.error("❌ DISPATCH LOAD ERROR:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ============================
   📊 GET ORDER TABLE
============================ */
app.get("/order-table", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('orders_table')
      .select('*')
      .order('branch_name', { ascending: true });

    if (error) throw error;
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