const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first'); // Fixes ENOTFOUND on Node.js v17+

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

// Initialize Supabase Client (Uses Port 443 - rarely blocked)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Test Supabase SDK Connection immediately on startup
async function testConnection() {
  try {
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
      .maybeSingle(); // returns null if not found instead of erroring

    if (userError) {
      console.error('❌ Error checking admin user:', userError.message);
    } else if (!user) {
      await supabase.from('book_list_users').insert([{
        username: 'Raghavendra',
        password: '8142037547',
        role: 'Admin',
        rights: JSON.stringify(['View', 'Edit/Delete'])
      }]);
      console.log('👤 Default admin user seeded in database.');
    } else {
      console.log('👤 Admin user already exists.');
    }
  } catch (err) {
    console.error('❌ Startup Error:', err.message);
  }
}
testConnection();

/* ============================
   FILE UPLOAD CONFIG
============================ */
const upload = multer({ dest: "uploads/" });

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
    console.error("GET BOOKS ERROR:", err);
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
    res.json(data);
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
    console.error("GET KITS ERROR:", err);
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
    console.log("❌ KIT FETCH ERROR:", err);
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
    const total = Number(d.total_amount) || qty * rate;
    const mrp = Number(d.mrp) || 0;
    const costPrice = Number(d.cost_price) || 0;
    const compositeCode = String(d.composite_code || "").trim();
    const compositeName = String(d.composite_name || "").trim();

    const { data: checkData } = await supabase
      .from('individual_books')
      .select('id')
      .ilike('zone', zone)
      .ilike('grade', grade)
      .eq('material_code', sku);

    if (checkData && checkData.length > 0) {
      return res.json({
        success: false,
        message: "Duplicate entry (Zone + Grade + SKU)",
      });
    }

    const { data, error } = await supabase
      .from('individual_books')
      .insert([{
        zone, grade, subject, material_name: materialName, material_code: sku,
        tax_rate: taxRate, mandatory_optional: mandatoryOptional, category, volume, year,
        author, publisher, quantity: qty, per_unit_rate: rate, total_amount: total,
        mrp, cost_price: costPrice, composite_code: compositeCode, composite_name: compositeName, kit_id: d.kit_id
      }])
      .select()
      .single();

    if (error) throw error;

    console.log("✅ INSERT:", sku);
    res.json({ success: true, book: data });

  } catch (err) {
    console.log("❌ INSERT ERROR:", err);
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

    const { data, error } = await supabase
      .from('grade_wise_kits')
      .insert([{ name, zone, branch, grade, status, created_by: createdBy, created_at: createdAt, status_info: statusInfo }])
      .select()
      .single();

    if (error) throw error;

    console.log("✅ KIT INSERT:", name);
    res.json({ success: true, kit: data });

  } catch (err) {
    console.log("❌ KIT INSERT ERROR:", err);
    res.status(500).send(err.message);
  }
});

app.get("/branches", async (req, res) => {
  try {
    const zone = req.query.zone || null;
    let query = supabase.from('branches').select('name, zone').order('name', { ascending: true });
    
    if (zone) {
      query = query.eq('zone', zone);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.log("❌ BRANCHES FETCH ERROR:", err);
    res.status(500).send(err.message);
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
    console.log("❌ ZONES FETCH ERROR:", err);
    res.status(500).send(err.message);
  }
});

app.get("/grades", async (req, res) => {
  try {
    const { data, error } = await supabase.from('grades').select('name').order('name');
    if (error) throw error;

    res.json(data ? data.map(row => row.name) : []);
  } catch (err) {
    console.log("❌ GRADES FETCH ERROR:", err);
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
    const total = Number(d.total_amount) || qty * rate;
    const mrp = Number(d.mrp) || 0;
    const costPrice = Number(d.cost_price) || 0;
    const compositeCode = String(d.composite_code || "").trim();
    const compositeName = String(d.composite_name || "").trim();

    const { data, error } = await supabase
      .from('individual_books')
      .update({
        zone, grade, subject, material_name: materialName, material_code: materialCode,
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
    console.log("❌ UPDATE ERROR:", err);
    res.status(500).send(err.message);
  }
});

/* ============================
   ❌ DELETE
============================ */
app.delete("/books/:id", async (req, res) => {
  await supabase.from('individual_books').delete().eq('id', req.params.id);
  console.log("🗑️ DELETED:", req.params.id);
  res.json({ success: true });
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
          zone: String(d["Zone"] || "").trim(),
          grade: String(d["Grade"] || "").trim(),
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

    // Optimized Bulk Upsert:
    // Requires a unique constraint on (zone, grade, material_code) in your database
    const { data: insertedData, error } = await supabase
      .from('individual_books')
      .upsert(rowsToInsert, { onConflict: 'zone,grade,material_code', ignoreDuplicates: true });

    if (error) throw error;

    fs.unlinkSync(req.file.path);

    res.json({ success: true, count: rowsToInsert.length });

  } catch (err) {
    console.log("❌ UPLOAD ERROR:", err);
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
    console.log("❌ USER INSERT ERROR:", err);
    res.status(500).send(err.message);
  }
});

app.get("/users", async (req, res) => {
  try {
    const { data, error } = await supabase.from('book_list_users').select('*').order('id', { ascending: false });
    if (error) throw error;

    res.json((data || []).map(row => ({
      ...row,
      rights: row.rights ? JSON.parse(row.rights) : []
    })));
  } catch (err) {
    console.log("❌ USERS FETCH ERROR:", err);
    res.status(500).send(err.message);
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
    console.log("❌ USER UPDATE ERROR:", err);
    res.status(500).send(err.message);
  }
});

app.delete("/users/:id", async (req, res) => {
  try {
    const { error } = await supabase
      .from('book_list_users')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.log("❌ USER DELETE ERROR:", err);
    res.status(500).send(err.message);
  }
});

/* ============================
   📥 DOWNLOAD
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