import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import './App.css';

// Ensure it defaults to /api for Vercel deployments if no env var is provided
const API_BASE_URL = process.env.REACT_APP_API_URL || (window.location.hostname === "localhost" ? "http://localhost:5000" : "/api");

const initialFilters = {
  zone: "",
  branch: "",
  grade: "",
  status: ""
};

function App() {
  const [books, setBooks] = useState([]);
  const [filteredBooks, setFilteredBooks] = useState([]);
  const [selectedBooks, setSelectedBooks] = useState([]);
  const [activeBook, setActiveBook] = useState(null);
  const [showView, setShowView] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddBook, setShowAddBook] = useState(false);
  const [editingBookIndex, setEditingBookIndex] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [editForm, setEditForm] = useState({ name: "", zone: "", branch: "", grade: "", status: "Pending" });
  const [createForm, setCreateForm] = useState({ name: "", zone: "", branch: [], grade: "", status: "Pending" });
  const [bulkUploadRows, setBulkUploadRows] = useState([]);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [bulkBookRows, setBulkBookRows] = useState([]);
  const [bulkBookFileName, setBulkBookFileName] = useState("");
  const [bulkBookError, setBulkBookError] = useState("");
  const [newBookItem, setNewBookItem] = useState({
    category: "",
    subject: "",
    material_name: "",
    material_code: "",
    tax_rate: "",
    mandatory_optional: "",
    volume: "",
    year: "",
    author: "",
    publisher: "",
    per_unit_rate: "",
    total_amount: "",
    mrp: "",
    cost_price: "",
    composite_code: "",
    composite_name: "",
    quantity: 1,
    zone: "",
    grade: "",
    branch: ""
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [users, setUsers] = useState([
    { id: 1, username: "Raghavendra", password: "8142037547", role: "Admin", rights: ["View", "Edit/Delete"] }
  ]);
  const [currentUser, setCurrentUser] = useState(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showManageUsers, setShowManageUsers] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "Admin", rights: [] });
  const [editingUser, setEditingUser] = useState(null);
  const [manageUserForm, setManageUserForm] = useState({ id: null, username: "", password: "", role: "Admin", rights: [] });
  const [branchList, setBranchList] = useState([]);
  const [zonesList, setZonesList] = useState([]);
  const [gradeList, setGradeList] = useState([]);
  const roleOptions = ["Admin", "User"];
  const rightsOptions = ["View", "Edit/Delete"];

  const userHasRight = (right) => {
    return currentUser && currentUser.rights && currentUser.rights.includes(right);
  };

  useEffect(() => {
    axios.get(`${API_BASE_URL}/kits`)
      .then(res => {
        const normalized = res.data.map(kit => ({
          ...kit,
          createdBy: kit.created_by || kit.createdBy || "Meenuga Raghavendra - 20240001178_OIS",
          createdAt: kit.created_at || kit.createdAt || "25th Aug 26, 06:15 PM",
          statusInfo: kit.status_info || kit.statusInfo || "Pending",
          status: kit.status || "Pending",
          books: kit.books || []
        }));
        setBooks(normalized);
        setFilteredBooks(normalized);
      })
      .catch(() => {
        setBooks([]);
        setFilteredBooks([]);
      });

    axios.get(`${API_BASE_URL}/users`)
      .then(res => {
        // Only update if users are returned, otherwise keep the default admin
        if (res.data && res.data.length > 0) {
          setUsers(res.data);
        }
      })
      .catch(() => {
        setUsers([{
          id: 1,
          username: "Raghavendra",
          password: "8142037547",
          role: "Admin",
          rights: ["View", "Edit/Delete"]
        }]);
      });

    axios.get(`${API_BASE_URL}/branches`)
      .then(res => setBranchList(Array.isArray(res.data) ? res.data : []))
      .catch((err) => {
        console.error("Failed to fetch branches:", err);
        setBranchList([]);
      });

    axios.get(`${API_BASE_URL}/zones`)
      .then(res => setZonesList(res.data || []))
      .catch(() => setZonesList([]));

    axios.get(`${API_BASE_URL}/grades`)
      .then(res => setGradeList(res.data || []))
      .catch(() => setGradeList([]));
  }, []);

  const zones = useMemo(() => ["", ...zonesList.filter(Boolean)], [zonesList]);
  const branchOptions = useMemo(() => {
    const filtered = filters.zone ? branchList.filter(branch => branch.zone === filters.zone) : branchList;
    return ["", ...Array.from(new Set(filtered.map(branch => branch.name)))];
  }, [branchList, filters.zone]);
  const bookBranchOptions = useMemo(() => {
    const currentZone = newBookItem.zone || activeBook?.zone;
    const filtered = currentZone ? branchList.filter(b => b.zone === currentZone) : branchList;
    return ["", ...Array.from(new Set(filtered.map(b => b.name)))];
  }, [branchList, newBookItem.zone, activeBook]);
  const createBranchOptions = useMemo(() => {
    const filtered = createForm.zone ? branchList.filter(branch => branch.zone === createForm.zone) : branchList;
    return ["", ...Array.from(new Set(filtered.map(branch => branch.name)))];
  }, [branchList, createForm.zone]);
  const editBranchOptions = useMemo(() => {
    const filtered = editForm.zone ? branchList.filter(branch => branch.zone === editForm.zone) : branchList;
    return ["", ...Array.from(new Set(filtered.map(branch => branch.name)))];
  }, [branchList, editForm.zone]);
  const grades = useMemo(() => ["", ...gradeList.filter(Boolean)], [gradeList]);
  const statusOptions = ["", "Pending", "Approved", "Completed"];
  const mandatoryOptions = ["", "Mandatory", "Optional"];
  const volumeOptions = ["", "Volume 1", "Volume 2", "Volume 3", "Volume 4","Term 1","Term 2"];
  const yearOptions = ["", "2023-2024", "2024-2025", "2025-2026", "2026-2027", "2027-2028"];

  useEffect(() => {
    const next = books.filter(book => {
      return (
        (!filters.zone || book.zone === filters.zone) &&
        (!filters.branch || book.branch === filters.branch) &&
        (!filters.grade || book.grade === filters.grade) &&
        (!filters.status || book.status === filters.status)
      );
    });
    setFilteredBooks(next);
  }, [filters, books]);

  const handleFilterChange = (field, value) => {
    setFilters(prev => {
      const next = { ...prev, [field]: value };
      if (field === "zone" && value && prev.branch) {
        const branchItem = branchList.find(branch => branch.name === prev.branch);
        if (!branchItem || branchItem.zone !== value) {
          next.branch = "";
        }
      }
      if (field === "branch" && value && prev.zone) {
        const branchItem = branchList.find(branch => branch.name === value);
        if (branchItem && branchItem.zone !== prev.zone) {
          next.zone = branchItem.zone;
        }
      }
      return next;
    });
  };

  const handleClear = () => {
    setFilters(initialFilters);
  };

  const handleLogin = (event) => {
    event.preventDefault();
    const foundUser = users.find(user =>
      user.username.trim().toLowerCase() === loginForm.username.trim().toLowerCase() &&
      user.password.trim() === loginForm.password.trim()
    );
    if (foundUser) {
      setCurrentUser(foundUser);
      setIsAuthenticated(true);
      setLoginForm({ username: "", password: "" });
      return;
    }
    alert("Invalid credentials. Please use a registered username and password.");
  };

  const handleCreateUser = async () => {
    if (!newUser.username.trim() || !newUser.password.trim()) {
      alert("Username and password are required to create a user.");
      return;
    }
    if (!newUser.rights.length) {
      alert("Please select at least one right for the new admin user.");
      return;
    }
    const existing = users.some(user => user.username.toLowerCase() === newUser.username.trim().toLowerCase());
    if (existing) {
      alert("A user with that username already exists.");
      return;
    }
    const payload = {
      username: newUser.username.trim(),
      password: newUser.password,
      role: newUser.role,
      rights: newUser.rights
    };
    try {
      const res = await axios.post(`${API_BASE_URL}/users`, payload);
      const savedUser = {
        ...res.data.user,
        rights: res.data.user.rights ? JSON.parse(res.data.user.rights) : []
      };
      setUsers(prev => [...prev, savedUser]);
      alert(`User ${savedUser.username} created successfully and saved to database.`);
    } catch (error) {
      const fallback = { id: Date.now(), ...payload };
      setUsers(prev => [...prev, fallback]);
      alert(`User ${payload.username} created locally (database save failed).`);
    }
    setNewUser({ username: "", password: "", role: "Admin", rights: [] });
    setShowCreateUser(false);
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setManageUserForm({
      id: user.id,
      username: user.username,
      password: user.password,
      role: user.role || "Admin",
      rights: user.rights || []
    });
    setShowManageUsers(true);
    setShowCreateUser(false);
  };

  const handleManageUserChange = (field, value) => {
    setManageUserForm(prev => ({ ...prev, [field]: value }));
  };

  const handleUpdateUser = async () => {
    if (!manageUserForm.username.trim() || !manageUserForm.password.trim()) {
      alert("Username and password are required to update a user.");
      return;
    }
    const updatePayload = {
      username: manageUserForm.username.trim(),
      password: manageUserForm.password,
      role: manageUserForm.role,
      rights: manageUserForm.rights
    };
    try {
      const res = await axios.put(`${API_BASE_URL}/users/${manageUserForm.id}`, updatePayload);
      const updatedUser = {
        ...res.data.user,
        rights: res.data.user.rights ? JSON.parse(res.data.user.rights) : []
      };
      setUsers(prev => prev.map(user => user.id === updatedUser.id ? updatedUser : user));
      setEditingUser(null);
      setManageUserForm({ id: null, username: "", password: "", role: "Admin", rights: [] });
      alert(`User ${updatedUser.username} updated successfully.`);
    } catch (error) {
      alert("Failed to update user in database.");
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm("Delete this user permanently?")) return;
    try {
      await axios.delete(`${API_BASE_URL}/users/${id}`);
      setUsers(prev => prev.filter(user => user.id !== id));
      if (editingUser?.id === id) {
        setEditingUser(null);
        setManageUserForm({ id: null, username: "", password: "", role: "Admin", rights: [] });
      }
    } catch (error) {
      alert("Failed to delete user from database.");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setShowCreateUser(false);
  };

  const handleView = async (id) => {
    const kit = books.find(item => item.id === id);
    if (!kit) return;
    if (!kit.books || kit.books.length === 0) {
      const res = await axios.get(`${API_BASE_URL}/kits/${id}`);
      setSelectedBooks(res.data.books || []);
      setActiveBook(res.data);
    } else {
      setSelectedBooks(kit.books);
      setActiveBook(kit);
    }
    setShowView(true);
    setShowEdit(false);
  };

  const handleEdit = (id) => {
    if (!userHasRight("Edit/Delete")) {
      alert("You do not have permission to edit kits.");
      return;
    }
    const book = books.find(item => item.id === id);
    if (!book) return;
    setActiveBook(book);
    setEditForm({ name: book.name, zone: book.zone, branch: book.branch, grade: book.grade, status: book.status });
    setShowEdit(true);
    setShowView(false);
    setShowCreate(false);
  };

  const handleCreate = () => {
    if (!userHasRight("Edit/Delete")) {
      alert("You do not have permission to create a kit.");
      return;
    }
    setShowCreate(true);
    setShowView(false);
    setShowEdit(false);
    setActiveBook(null);
    setCreateForm({ name: "", zone: "", branch: "", grade: "", status: "Pending" });
  };

  const handleCreateSave = async () => {
    const branchValues = Array.isArray(createForm.branch) ? createForm.branch.filter(Boolean) : [createForm.branch].filter(Boolean);
    if (!branchValues.length) {
      alert("Please select at least one branch.");
      return;
    }

    const createdKits = [];
    try {
      for (const branch of branchValues) {
        const newBook = {
          ...createForm,
          branch,
          createdBy: "Meenga Raghavendra - 20240001178_OIS",
          createdAt: new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }).replace(/,/g, ''),
          statusInfo: createForm.status || "Pending",
          books: []
        };
        const res = await axios.post(`${API_BASE_URL}/kits`, newBook);
        createdKits.push(res.data.kit);
      }
      setBooks(prev => [...prev, ...createdKits]);
      setFilteredBooks(prev => [...prev, ...createdKits]);
    } catch (error) {
      const fallbackKits = branchValues.map(branch => ({
        id: books.length ? Math.max(...books.map(b => b.id)) + 1 : 1,
        ...createForm,
        branch,
        createdBy: "Meenga Raghavendra - 20240001178_OIS",
        createdAt: new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }).replace(/,/g, ''),
        statusInfo: createForm.status || "Pending",
        books: []
      }));
      setBooks(prev => [...prev, ...fallbackKits]);
      setFilteredBooks(prev => [...prev, ...fallbackKits]);
    }

    setShowCreate(false);
    setCreateForm({ name: "", zone: "", branch: [], grade: "", status: "Pending" });
  };

  const parseCsv = (text) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (!lines.length) return [];
    const headers = lines[0].split(',').map(header => header.trim());
    return lines.slice(1).map(line => {
      const values = line.split(',').map(value => value.trim());
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || "";
      });
      return row;
    });
  };

  const handleBulkFileChange = async (event) => {
    setBulkError("");
    const file = event.target.files[0];
    if (!file) return;
    setBulkFileName(file.name);

    try {
      const content = await file.text();
      const rows = parseCsv(content);
      if (!rows.length) {
        setBulkError("CSV file is empty or invalid.");
        setBulkUploadRows([]);
        return;
      }
      setBulkUploadRows(rows);
    } catch (error) {
      setBulkError("Unable to read CSV file.");
      setBulkUploadRows([]);
    }
  };

  const handleBulkUpload = async () => {
    if (!bulkUploadRows.length) {
      setBulkError("Please choose a valid CSV file first.");
      return;
    }

    const createdKits = [];
    for (const row of bulkUploadRows) {
      const newKit = {
        name: row.name || row['Book List Name'] || row.book_list_name || "",
        zone: row.zone || row['Zone'] || "",
        branch: row.branch || row['Branch'] || "",
        grade: row.grade || row['Grade'] || "",
        status: row.status || row['Status'] || "Pending",
        createdBy: row.createdBy || row.created_by || row['Created By'] || "Bulk Upload",
        createdAt: row.createdAt || row.created_at || row['Created At'] || new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }).replace(/,/g, ''),
        statusInfo: row.statusInfo || row.status_info || row['Status Info'] || row.status || row['Status'] || "Pending",
        books: []
      };

      try {
        const response = await axios.post(`${API_BASE_URL}/kits`, newKit);
        createdKits.push(response.data.kit);
      } catch (error) {
        const fallbackKit = { ...newKit, id: books.length + createdKits.length + 1 };
        createdKits.push(fallbackKit);
      }
    }

    setBooks(prev => [...prev, ...createdKits]);
    setFilteredBooks(prev => [...prev, ...createdKits]);
    setBulkUploadRows([]);
    setBulkFileName("");
    setBulkError("");
  };

  const handleBulkBookFileChange = async (event) => {
    setBulkBookError("");
    const file = event.target.files[0];
    if (!file) return;
    setBulkBookFileName(file.name);

    try {
      const content = await file.text();
      const rows = parseCsv(content);
      if (!rows.length) {
        setBulkBookError("CSV file is empty or invalid.");
        setBulkBookRows([]);
        return;
      }
      setBulkBookRows(rows);
    } catch (error) {
      setBulkBookError("Unable to read CSV file.");
      setBulkBookRows([]);
    }
  };

  const handleBulkBookUpload = async () => {
    if (!bulkBookRows.length || !activeBook) {
      setBulkBookError("Please select a valid CSV file first.");
      return;
    }

    const addedBooks = [];
    for (const row of bulkBookRows) {
      const bookItem = {
        category: row.category || row.Category || "",
        subject: row.subject || row.Subject || "",
        material_name: row.material_name || row['Material Name'] || "",
        material_code: row.material_code || row['Material Code'] || "",
        tax_rate: Number(row.tax_rate || row['Tax Rate'] || 0) || 0,
        mandatory_optional: row.mandatory_optional || row['Mandatory/Optional'] || row.Mandatory || row.Optional || "",
        volume: row.volume || row.Volume || "",
        year: row.year || row.Year || "",
        author: row.author || row.Author || "",
        publisher: row.publisher || row.Publisher || "",
        per_unit_rate: Number(row.per_unit_rate || row['Per Unit Rate'] || 0) || 0,
        quantity: Number(row.quantity || row.Quantity || 1) || 1,
        total_amount: Number(row.total_amount || row['Total Amount'] || 0) || ((Number(row.per_unit_rate || row['Per Unit Rate']) || 0) * (Number(row.quantity || row.Quantity) || 1)),
        mrp: Number(row.mrp || row.MRP || 0) || 0,
        cost_price: Number(row.cost_price || row['Cost Price'] || 0) || 0,
        composite_code: row.composite_code || row['Composite Code'] || "",
        composite_name: row.composite_name || row['Composite Name'] || "",
        zone: activeBook.zone,
        grade: activeBook.grade,
        branch: row.branch || row['Branch'] || activeBook.branch || ""
      };

      try {
        const response = await axios.post(`${API_BASE_URL}/books`, { ...bookItem, kit_id: activeBook.id });
        addedBooks.push(response.data.book || bookItem);
      } catch (error) {
        console.error("Failed to save row to DB:", bookItem.material_code, error.response?.data || error.message);
        // We do NOT push to addedBooks here, so the UI stays in sync with the DB
      }
    }

    setSelectedBooks(prev => [...prev, ...addedBooks]);
    setBooks(prev => prev.map(book => book.id === activeBook.id ? { ...book, books: [...(book.books || []), ...addedBooks] } : book));
    setFilteredBooks(prev => prev.map(book => book.id === activeBook.id ? { ...book, books: [...(book.books || []), ...addedBooks] } : book));
    setActiveBook(prev => ({ ...prev, books: [...(prev.books || []), ...addedBooks] }));
    setBulkBookRows([]);
    setBulkBookFileName("");
    setBulkBookError("");
  };

  const handleDeleteBook = async (item, index) => {
    if (!userHasRight("Edit/Delete")) {
      alert("You do not have permission to delete book items.");
      return;
    }

    if (item.id) {
      try {
        const response = await axios.delete(`${API_BASE_URL}/books/${item.id}`);
        if (!response.data.success) {
          throw new Error(response.data.error || "Failed to delete from database.");
        }

        // Update local state only on success
        setSelectedBooks(prev => prev.filter((_, idx) => idx !== index));
        setBooks(prev => prev.map(book => book.id === activeBook.id ? { ...book, books: (book.books || []).filter((_, idx) => idx !== index) } : book));
        setFilteredBooks(prev => prev.map(book => book.id === activeBook.id ? { ...book, books: (book.books || []).filter((_, idx) => idx !== index) } : book));
        setActiveBook(prev => ({ ...prev, books: (prev.books || []).filter((_, idx) => idx !== index) }));

      } catch (err) {
        console.error("Delete failed:", err?.response?.data || err.message);
        alert("Could not delete book: " + (err?.response?.data?.error || err.message));
      }
    } else {
      // If for some reason the item has no ID, just remove it locally
      setSelectedBooks(prev => prev.filter((_, idx) => idx !== index));
    }
  };

  const handleSave = () => {
    setBooks(prev => prev.map(book => book.id === activeBook.id ? { ...book, ...editForm } : book));
    setFilteredBooks(prev => prev.map(book => book.id === activeBook.id ? { ...book, ...editForm } : book));
    setShowEdit(false);
    setActiveBook(null);
  };

  const handleAddBook = () => {
    if (!userHasRight("Edit/Delete")) {
      alert("You do not have permission to add book items.");
      return;
    }
    setShowAddBook(true);
    setEditingBookIndex(null);
    setNewBookItem({
      category: "",
      subject: "",
      material_name: "",
      material_code: "",
      tax_rate: "",
      mandatory_optional: "",
      volume: "",
      year: "",
      author: "",
      publisher: "",
      per_unit_rate: "",
      total_amount: "",
      mrp: "",
      cost_price: "",
      composite_code: "",
      composite_name: "",
      quantity: 1,
      zone: activeBook?.zone || "",
      grade: activeBook?.grade || "",
      branch: activeBook?.branch || ""
    });
  };

  const handleEditBook = (item, index) => {
    setShowAddBook(true);
    setEditingBookIndex(index);
    setNewBookItem({
      ...item,
      subject: item.subject || "",
      tax_rate: item.tax_rate || "",
      volume: item.volume || "",
      per_unit_rate: item.per_unit_rate || "",
      total_amount: item.total_amount || "",
      mrp: item.mrp || "",
      cost_price: item.cost_price || "",
      quantity: item.quantity || 1,
      zone: item.zone || activeBook?.zone || "",
      grade: item.grade || activeBook?.grade || "",
      branch: item.branch || activeBook?.branch || ""
    });
  };

  const handleSaveNewBook = async () => {
    if (!activeBook) return;
    const bookItem = {
      ...newBookItem,
      tax_rate: Number(newBookItem.tax_rate) || 0,
      volume: newBookItem.volume || "",
      per_unit_rate: Number(newBookItem.per_unit_rate) || 0,
      total_amount: Number(newBookItem.total_amount) || (Number(newBookItem.quantity) || 0) * (Number(newBookItem.per_unit_rate) || 0),
      mrp: Number(newBookItem.mrp) || 0,
      cost_price: Number(newBookItem.cost_price) || 0,
      quantity: Number(newBookItem.quantity) || 1
    };

    let savedBookItem = bookItem;
    try {
      if (bookItem.id) {
        const response = await axios.put(`${API_BASE_URL}/books/${bookItem.id}`, bookItem);
        if (response.data?.book) savedBookItem = response.data.book;
      } else {
        const response = await axios.post(`${API_BASE_URL}/books`, { ...bookItem, kit_id: activeBook.id });
        if (response.data?.book) savedBookItem = response.data.book;
      }

      const updatedTime = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }).replace(/,/g, '');
      if (editingBookIndex !== null) {
        setSelectedBooks(prev => prev.map((item, idx) => idx === editingBookIndex ? savedBookItem : item));
        setBooks(prev => prev.map(book => book.id === activeBook.id ? { ...book, books: (book.books || []).map((item, idx) => idx === editingBookIndex ? savedBookItem : item) } : book));
        setFilteredBooks(prev => prev.map(book => book.id === activeBook.id ? { ...book, createdAt: updatedTime, created_at: updatedTime, books: (book.books || []).map((item, idx) => idx === editingBookIndex ? savedBookItem : item) } : book));
        setActiveBook(prev => ({ ...prev, createdAt: updatedTime, created_at: updatedTime, books: (prev.books || []).map((item, idx) => idx === editingBookIndex ? savedBookItem : item) }));
      } else {
        setSelectedBooks(prev => [...prev, savedBookItem]);
        setBooks(prev => prev.map(book => book.id === activeBook.id ? { ...book, books: [...(book.books || []), savedBookItem] } : book));
        setFilteredBooks(prev => prev.map(book => book.id === activeBook.id ? { ...book, createdAt: updatedTime, created_at: updatedTime, books: [...(book.books || []), savedBookItem] } : book));
        setActiveBook(prev => ({ ...prev, createdAt: updatedTime, created_at: updatedTime, books: [...(prev.books || []), savedBookItem] }));
      }
      setShowAddBook(false);
    } catch (error) {
      console.error("Book save failed:", error?.response?.data || error.message);
      alert("Database Error: Could not save the book. " + (error.response?.data || "Check console for details."));
      return; // Stop execution if DB save failed
    }
    setEditingBookIndex(null);
    setNewBookItem({
      category: "",
      subject: "",
      material_name: "",
      material_code: "",
      tax_rate: "",
      mandatory_optional: "",
      volume: "",
      year: "",
      author: "",
      publisher: "",
      per_unit_rate: "",
      total_amount: "",
      mrp: "",
      cost_price: "",
      composite_code: "",
      composite_name: "",
      quantity: 1,
      zone: activeBook?.zone || "",
      grade: activeBook?.grade || "",
      branch: activeBook?.branch || ""
    });
  };

  const buildExportRows = (kits) => {
    const headers = [
      "S.No", "Kit ID", "Book List Name", "Zone", "Branch", "Grade", "Created By", "Created At", "Status", "Status Info",
      "Component Index", "Category", "Subject", "Material Name", "Material Code", "Tax Rate", "Mandatory/Optional",
      "Volume", "Year", "Author", "Publisher", "Per Unit Rate", "Quantity", "Total Amount", "MRP", "Cost Price",
      "Composite Code", "Composite Name", "Component Zone", "Component Grade", "Component Branch"
    ];

    const rows = [];
    kits.forEach((kit, kitIndex) => {
      const kitBooks = Array.isArray(kit.books) && kit.books.length ? kit.books : [null];
      kitBooks.forEach((bookItem, bookIndex) => {
        rows.push([
          kitIndex + 1,
          kit.id ?? "",
          kit.name ?? "",
          kit.zone ?? "",
          kit.branch ?? "",
          kit.grade ?? "",
          kit.createdBy ?? "",
          kit.createdAt ?? "",
          kit.status ?? "",
          kit.statusInfo ?? "",
          bookItem ? bookIndex + 1 : "",
          bookItem?.category ?? "",
          bookItem?.subject ?? "",
          bookItem?.material_name ?? "",
          bookItem?.material_code ?? "",
          bookItem?.tax_rate ?? "",
          bookItem?.mandatory_optional ?? "",
          bookItem?.volume ?? "",
          bookItem?.year ?? "",
          bookItem?.author ?? "",
          bookItem?.publisher ?? "",
          bookItem?.per_unit_rate ?? "",
          bookItem?.quantity ?? "",
          bookItem?.total_amount ?? "",
          bookItem?.mrp ?? "",
          bookItem?.cost_price ?? "",
          bookItem?.composite_code ?? "",
          bookItem?.composite_name ?? "",
          bookItem?.zone ?? kit.zone ?? "",
          bookItem?.grade ?? kit.grade ?? "",
          bookItem?.branch_name ?? bookItem?.branch ?? kit.branch ?? ""
        ]);
      });
    });

    return { headers, rows };
  };

  const downloadCsv = (headers, rows, filename) => {
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  const handleExport = () => {
    if (!filteredBooks.length) return;
    const { headers, rows } = buildExportRows(filteredBooks);
    downloadCsv(headers, rows, "book-list-export.csv");
  };

  const handleExportKit = (kit) => {
    if (!kit) return;
    const { headers, rows } = buildExportRows([kit]);
    downloadCsv(headers, rows, `${kit.name || 'kit'}-export.csv`);
  };

  const activeCount = filteredBooks.length;

  if (!isAuthenticated) {
    return (
      <div className="page-wrapper py-4 px-4 d-flex justify-content-center align-items-center">
        <div className="card card-soft login-card p-4 shadow-sm">
          <h4 className="mb-3">Admin Login</h4>
          <div className="mb-3">
            <label className="form-label">Username</label>
            <input
              type="text"
              className="form-control"
              value={loginForm.username}
              onChange={e => setLoginForm(prev => ({ ...prev, username: e.target.value }))}
              placeholder="Enter admin username"
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-control"
              value={loginForm.password}
              onChange={e => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
              placeholder="Enter admin password"
            />
          </div>
          <button className="btn btn-danger w-100" onClick={handleLogin}>Login</button>
          <div className="mt-3 text-muted small">
            Use admin credentials: <strong>Raghavendra</strong> / <strong>********</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrapper py-4 px-4">
      <div className="d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between mb-4 gap-3">
        <div>
          <nav className="breadcrumb bg-transparent p-0 mb-2">
            <span className="breadcrumb-item">Home</span>
            <span className="breadcrumb-item">Store</span>
            <span className="breadcrumb-item active">Book List</span>
          </nav>
          <h2 className="page-title">Book List</h2>
        </div>
        <div className="d-flex gap-2 flex-wrap align-items-center">
          {currentUser && (
            <div className="text-muted small">
              Logged in as: <strong>{currentUser.username}</strong>
            </div>
          )}
          {userHasRight("Edit/Delete") && (
            <button className="btn btn-danger btn-sm px-4" onClick={handleCreate}>+ Create Kit</button>
          )}
          {userHasRight("Edit/Delete") && (
            <button className="btn btn-outline-primary btn-sm px-4" onClick={() => setShowCreateUser(prev => !prev)}>
              {showCreateUser ? "Cancel User" : "Create User"}
            </button>
          )}
          {userHasRight("Edit/Delete") && (
            <button className="btn btn-outline-secondary btn-sm px-4" onClick={() => setShowManageUsers(prev => !prev)}>
              {showManageUsers ? "Close Manage" : "Manage Users"}
            </button>
          )}
          <button className="btn btn-secondary btn-sm px-4" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {showCreate && (
        <div className="card card-soft mb-4 p-4 shadow-sm">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div>
              <h5 className="mb-1">Create New Kit</h5>
              <div className="text-muted">Enter the new book list details and save the kit.</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
          <div className="row gx-3 gy-3 mb-3">
            <div className="col-12">
              <label className="form-label">Bulk Upload Kits (CSV)</label>
              <input type="file" accept=".csv" className="form-control" onChange={handleBulkFileChange} />
              {bulkFileName && <div className="mt-2 text-sm text-muted">Selected file: {bulkFileName}</div>}
              {bulkError && <div className="mt-2 text-danger">{bulkError}</div>}
              {bulkUploadRows.length > 0 && (
                <div className="mt-2">
                  <div className="text-muted">Parsed {bulkUploadRows.length} rows from CSV.</div>
                  <button className="btn btn-outline-primary btn-sm mt-2" onClick={handleBulkUpload}>Upload Kits</button>
                </div>
              )}
              <div className="mt-2 text-muted">CSV columns should include: name, zone, branch, grade, status, createdBy, createdAt, statusInfo</div>
            </div>
          </div>
          <div className="row gx-3 gy-3">
            <div className="col-12 col-md-6">
              <label className="form-label">Book List Name</label>
              <input type="text" className="form-control" value={createForm.name} onChange={e => setCreateForm(prev => ({ ...prev, name: e.target.value }))} />
            </div>
            <div className="col-12 col-md-6">
              <label className="form-label">Branch</label>
              <select className="form-select" multiple size={6} value={createForm.branch} onChange={e => {
                const selected = Array.from(e.target.selectedOptions).map(option => option.value);
                setCreateForm(prev => ({ ...prev, branch: selected }));
              }}>
                <option value="">Select Branch</option>
                {createBranchOptions.map(branch => <option key={branch} value={branch}>{branch}</option>)}
              </select>
              <div className="form-text">Hold Ctrl/Cmd to select multiple branches.</div>
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label">Zone</label>
              <select className="form-select" value={createForm.zone} onChange={e => {
                const zoneValue = e.target.value;
                setCreateForm(prev => ({
                  ...prev,
                  zone: zoneValue,
                  branch: Array.isArray(prev.branch) ? prev.branch.filter(branchName => branchList.some(branch => branch.name === branchName && branch.zone === zoneValue)) : []
                }));
              }}>
                <option value="">Select Zone</option>
                {zones.map(zone => <option key={zone} value={zone}>{zone || "All Zones"}</option>)}
              </select>
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label">Grade</label>
              <select className="form-select" value={createForm.grade} onChange={e => setCreateForm(prev => ({ ...prev, grade: e.target.value }))}>
                <option value="">Select Grade</option>
                {grades.map(grade => <option key={grade} value={grade}>{grade}</option>)}
              </select>
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label">Status</label>
              <select className="form-select" value={createForm.status} onChange={e => setCreateForm(prev => ({ ...prev, status: e.target.value }))}>
                {statusOptions.filter(opt => opt).map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4 d-flex gap-2">
            <button className="btn btn-danger" onClick={handleCreateSave}>Save Kit</button>
            <button className="btn btn-outline-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </div>
      )}

      {showCreateUser && userHasRight("Edit/Delete") && (
        <div className="card card-soft mb-4 p-4 shadow-sm">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div>
              <h5 className="mb-1">Create Admin User</h5>
              <div className="text-muted">Only admin users can create new admin users with rights.</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowCreateUser(false)}>Cancel</button>
          </div>
          <div className="row gx-3 gy-3">
            <div className="col-12 col-md-4">
              <label className="form-label">Username</label>
              <input type="text" className="form-control" value={newUser.username} onChange={e => setNewUser(prev => ({ ...prev, username: e.target.value }))} />
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label">Password</label>
              <input type="password" className="form-control" value={newUser.password} onChange={e => setNewUser(prev => ({ ...prev, password: e.target.value }))} />
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label">Role</label>
              <select className="form-select" value={newUser.role} onChange={e => setNewUser(prev => ({ ...prev, role: e.target.value }))}>
                {roleOptions.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label">Rights</label>
              <select className="form-select" multiple value={newUser.rights} onChange={e => {
                const selected = Array.from(e.target.selectedOptions).map(option => option.value);
                setNewUser(prev => ({ ...prev, rights: selected }));
              }}>
                {rightsOptions.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
              <div className="form-text">Hold Ctrl/Cmd to select multiple rights.</div>
            </div>
          </div>
          <div className="mt-4 d-flex gap-2">
            <button className="btn btn-danger" onClick={handleCreateUser}>Add Admin User</button>
            <button className="btn btn-outline-secondary" onClick={() => setShowCreateUser(false)}>Cancel</button>
          </div>
        </div>
      )}

      {showManageUsers && userHasRight("Edit/Delete") && (
        <div className="card card-soft mb-4 p-4 shadow-sm">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div>
              <h5 className="mb-1">Manage Users</h5>
              <div className="text-muted">Edit roles, passwords, or delete users.</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowManageUsers(false)}>Close</button>
          </div>
          <div className="table-responsive mb-3">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Rights</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length ? users.map(user => (
                  <tr key={user.id}>
                    <td>{user.username}</td>
                    <td>{user.role}</td>
                    <td>{(user.rights || []).join(", ")}</td>
                    <td>
                      <div className="d-flex gap-2 flex-wrap">
                        <button className="btn btn-outline-primary btn-sm" onClick={() => handleEditUser(user)}>Edit</button>
                        <button className="btn btn-outline-danger btn-sm" onClick={() => handleDeleteUser(user.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="4" className="text-center py-4 text-muted">No users found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {editingUser && (
            <div className="card card-soft p-3 border border-info">
              <div className="mb-3">
                <strong>Edit User: {editingUser.username}</strong>
              </div>
              <div className="row gx-3 gy-3">
                <div className="col-12 col-md-3">
                  <label className="form-label">Username</label>
                  <input className="form-control" value={manageUserForm.username} onChange={e => handleManageUserChange("username", e.target.value)} />
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label">Password</label>
                  <input type="password" className="form-control" value={manageUserForm.password} onChange={e => handleManageUserChange("password", e.target.value)} />
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label">Role</label>
                  <select className="form-select" value={manageUserForm.role} onChange={e => handleManageUserChange("role", e.target.value)}>
                    {roleOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label">Rights</label>
                  <select className="form-select" multiple value={manageUserForm.rights} onChange={e => {
                    const selected = Array.from(e.target.selectedOptions).map(option => option.value);
                    handleManageUserChange("rights", selected);
                  }}>
                    {rightsOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                  <div className="form-text">Hold Ctrl/Cmd to select multiple rights.</div>
                </div>
              </div>
              <div className="mt-3 d-flex gap-2">
                <button className="btn btn-danger btn-sm" onClick={handleUpdateUser}>Save Changes</button>
                <button className="btn btn-outline-secondary btn-sm" onClick={() => {
                  setEditingUser(null);
                  setManageUserForm({ id: null, username: "", password: "", role: "Admin", rights: [] });
                }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card card-soft p-4 mb-4 shadow-sm">
        <div className="row gy-3 gx-3 align-items-end">
          <div className="col-12 col-md-3">
            <label className="form-label">Select Zone</label>
            <select className="form-select" value={filters.zone} onChange={e => handleFilterChange("zone", e.target.value)}>
              {zones.map(zone => <option key={zone} value={zone}>{zone || "All Zones"}</option>)}
            </select>
          </div>
          <div className="col-12 col-md-3">
            <label className="form-label">Select Branch</label>
            <select className="form-select" value={filters.branch} onChange={e => handleFilterChange("branch", e.target.value)}>
              {branchOptions.map(branch => <option key={branch} value={branch}>{branch || "All Branches"}</option>)}
            </select>
          </div>
          <div className="col-12 col-md-2">
            <label className="form-label">Select Grade</label>
            <select className="form-select" value={filters.grade} onChange={e => handleFilterChange("grade", e.target.value)}>
              {grades.map(grade => <option key={grade} value={grade}>{grade || "All Grades"}</option>)}
            </select>
          </div>
          <div className="col-12 col-md-2">
            <label className="form-label">Select Status</label>
            <select className="form-select" value={filters.status} onChange={e => handleFilterChange("status", e.target.value)}>
              {statusOptions.map(option => <option key={option} value={option}>{option || "All Status"}</option>)}
            </select>
          </div>
          <div className="col-12 col-md-2 d-flex gap-2">
            <button className="btn btn-outline-secondary w-100" onClick={handleClear}>Clear All</button>
            <button className="btn btn-danger w-100" onClick={() => setFilters({ ...filters })}>Filter</button>
          </div>
        </div>
      </div>

      {!showView && (
        <div className="d-flex align-items-center justify-content-between mb-3 gap-3">
          <div className="text-muted">Showing {activeCount} record{activeCount !== 1 ? "s" : ""}</div>
          <button className="btn btn-success btn-sm" onClick={handleExport}>Export Excel</button>
        </div>
      )}
      {showView && (
        <div className="d-flex justify-content-end mb-3">
          <button className="btn btn-success btn-sm" onClick={handleExport}>Export Excel</button>
        </div>
      )}

      <div className="table-responsive shadow-sm rounded">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>S.No</th>
              <th>Book List Name</th>
              <th>Zone</th>
              <th>Branch</th>
              <th>Grade</th>
              <th>Created By / At</th>
              <th>Status</th>
              <th>Status Info</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredBooks.length ? filteredBooks.map((book, index) => (
              <tr key={book.id}>
                <td>{index + 1}</td>
                <td>{book.name}</td>
                <td>{book.zone}</td>
                <td>{book.branch}</td>
                <td>{book.grade}</td>
                <td>{book.createdBy}<br /><span className="text-muted small">{book.createdAt}</span></td>
                <td><span className="badge bg-info text-dark">{book.status}</span></td>
                <td>{book.statusInfo}</td>
                <td>
                  <div className="d-flex gap-2 flex-wrap">
                    <button className="btn btn-outline-primary btn-sm" onClick={() => handleView(book.id)}>View</button>
                    {userHasRight("Edit/Delete") && (
                      <button className="btn btn-outline-warning btn-sm" onClick={() => handleEdit(book.id)}>Edit</button>
                    )}
                    <button className="btn btn-outline-secondary btn-sm" onClick={() => handleExportKit(book)}>Excel</button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="9" className="text-center py-4 text-muted">No records found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showView && activeBook && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-fullscreen">
            <div className="modal-content shadow-lg border-0">
              <div className="modal-header bg-danger text-white">
                <h5 className="modal-title">Kit Details: {activeBook.name}</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowView(false)} aria-label="Close"></button>
              </div>
              <div className="modal-body p-4 bg-light">
                <div className="d-flex align-items-center justify-content-between mb-3 gap-2 flex-column flex-md-row">
                  <div>
                    <h5 className="mb-1">Component Items</h5>
                    <div className="text-muted small">Managing individual book components for this kit.</div>
                  </div>
                  <div className="d-flex gap-2 flex-wrap">
                    {userHasRight("Edit/Delete") && (
                      <>
                        <button className="btn btn-outline-primary btn-sm" onClick={handleAddBook}>Add Book</button>
                        <button className="btn btn-outline-secondary btn-sm" onClick={() => document.getElementById('bulk-book-input')?.click()}>Bulk Add Books</button>
                      </>
                    )}
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowView(false)}>Close View</button>
                  </div>
                </div>
                
                <input id="bulk-book-input" type="file" accept=".csv" className="d-none" onChange={handleBulkBookFileChange} />
                
                {(bulkBookFileName || bulkBookError || bulkBookRows.length > 0) && (
                  <div className="card card-soft p-3 mb-3 border border-warning">
                    {bulkBookFileName && <div className="small text-muted mb-1"><strong>Selected file:</strong> {bulkBookFileName}</div>}
                    {bulkBookError && <div className="text-danger small">{bulkBookError}</div>}
                    {bulkBookRows.length > 0 && (
                      <div className="d-flex gap-2 flex-wrap mt-2">
                        <button className="btn btn-success btn-sm" onClick={handleBulkBookUpload}>Upload {bulkBookRows.length} Books</button>
                        <button className="btn btn-outline-secondary btn-sm" onClick={() => { setBulkBookRows([]); setBulkBookFileName(""); setBulkBookError(""); }}>Clear</button>
                      </div>
                    )}
                  </div>
                )}

                {showAddBook && userHasRight("Edit/Delete") && (
                  <div className="card card-soft mb-4 p-4 border border-info shadow-sm">
                    <div className="mb-3 d-flex justify-content-between align-items-center">
                      <h6 className="mb-0 text-primary"><strong>{editingBookIndex !== null ? "Edit Book Item" : "Add New Book Item"}</strong></h6>
                      <button className="btn-close btn-sm" onClick={() => { setShowAddBook(false); setEditingBookIndex(null); }}></button>
                    </div>
                    <div className="row gx-3 gy-3">
                      <div className="col-12 col-md-4">
                        <label className="form-label">Category</label>
                        <input className="form-control" value={newBookItem.category} onChange={e => setNewBookItem(prev => ({ ...prev, category: e.target.value }))} />
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="form-label">Subject</label>
                        <input className="form-control" value={newBookItem.subject} onChange={e => setNewBookItem(prev => ({ ...prev, subject: e.target.value }))} />
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="form-label">Material Name</label>
                        <input className="form-control" value={newBookItem.material_name} onChange={e => setNewBookItem(prev => ({ ...prev, material_name: e.target.value }))} />
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="form-label">Material Code</label>
                        <input className="form-control" value={newBookItem.material_code} onChange={e => setNewBookItem(prev => ({ ...prev, material_code: e.target.value }))} />
                      </div>
                      <div className="col-12 col-md-3">
                        <label className="form-label">Tax Rate</label>
                        <input type="number" className="form-control" value={newBookItem.tax_rate} onChange={e => setNewBookItem(prev => ({ ...prev, tax_rate: e.target.value }))} />
                      </div>
                      <div className="col-12 col-md-3">
                        <label className="form-label">Mandatory / Optional</label>
                        <select className="form-select" value={newBookItem.mandatory_optional} onChange={e => setNewBookItem(prev => ({ ...prev, mandatory_optional: e.target.value }))}>
                          {mandatoryOptions.map(option => <option key={option} value={option}>{option || "Select"}</option>)}
                        </select>
                      </div>
                      <div className="col-12 col-md-3">
                        <label className="form-label">Volume</label>
                        <select className="form-select" value={newBookItem.volume} onChange={e => setNewBookItem(prev => ({ ...prev, volume: e.target.value }))}>
                          {volumeOptions.map(option => <option key={option} value={option}>{option || "Select"}</option>)}
                        </select>
                      </div>
                      <div className="col-12 col-md-3">
                        <label className="form-label">Year</label>
                        <select className="form-select" value={newBookItem.year} onChange={e => setNewBookItem(prev => ({ ...prev, year: e.target.value }))}>
                          {yearOptions.map(option => <option key={option} value={option}>{option || "Select"}</option>)}
                        </select>
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="form-label">Author</label>
                        <input className="form-control" value={newBookItem.author} onChange={e => setNewBookItem(prev => ({ ...prev, author: e.target.value }))} />
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="form-label">Publisher</label>
                        <input className="form-control" value={newBookItem.publisher} onChange={e => setNewBookItem(prev => ({ ...prev, publisher: e.target.value }))} />
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="form-label">Per Unit Rate</label>
                        <input type="number" className="form-control" value={newBookItem.per_unit_rate} onChange={e => {
                          const value = e.target.value;
                          const qty = Number(newBookItem.quantity) || 0;
                          setNewBookItem(prev => ({ ...prev, per_unit_rate: value, total_amount: value ? (Number(value) * qty).toFixed(2) : "" }));
                        }} />
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="form-label">Total Amount</label>
                        <input type="number" className="form-control" value={newBookItem.total_amount} readOnly />
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="form-label">MRP</label>
                        <input type="number" className="form-control" value={newBookItem.mrp} onChange={e => setNewBookItem(prev => ({ ...prev, mrp: e.target.value }))} />
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="form-label">Cost Price</label>
                        <input type="number" className="form-control" value={newBookItem.cost_price} onChange={e => setNewBookItem(prev => ({ ...prev, cost_price: e.target.value }))} />
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="form-label">Composite Code</label>
                        <input className="form-control" value={newBookItem.composite_code} onChange={e => setNewBookItem(prev => ({ ...prev, composite_code: e.target.value }))} />
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="form-label">Composite Name</label>
                        <input className="form-control" value={newBookItem.composite_name} onChange={e => setNewBookItem(prev => ({ ...prev, composite_name: e.target.value }))} />
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="form-label">Zone</label>
                        <input className="form-control" value={newBookItem.zone} onChange={e => setNewBookItem(prev => ({ ...prev, zone: e.target.value }))} />
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="form-label">Grade</label>
                        <input className="form-control" value={newBookItem.grade} onChange={e => setNewBookItem(prev => ({ ...prev, grade: e.target.value }))} />
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="form-label">Branch</label>
                        <select className="form-select" value={newBookItem.branch} onChange={e => setNewBookItem(prev => ({ ...prev, branch: e.target.value }))}>
                          {bookBranchOptions.map(opt => <option key={opt} value={opt}>{opt || "Select Branch"}</option>)}
                        </select>
                      </div>
                      <div className="col-12 col-md-3">
                        <label className="form-label">Quantity</label>
                        <input type="number" className="form-control" min="1" value={newBookItem.quantity} onChange={e => {
                          const value = e.target.value;
                          const rate = Number(newBookItem.per_unit_rate) || 0;
                          setNewBookItem(prev => ({ ...prev, quantity: value, total_amount: value ? (Number(value) * rate).toFixed(2) : "" }));
                        }} />
                      </div>
                    </div>
                    <div className="mt-3 d-flex gap-2 flex-wrap">
                      <button className="btn btn-primary btn-sm px-4" onClick={handleSaveNewBook}>{editingBookIndex !== null ? "Update Book" : "Save Book"}</button>
                      <button className="btn btn-outline-secondary btn-sm px-4" onClick={() => { setShowAddBook(false); setEditingBookIndex(null); }}>Cancel</button>
                    </div>
                  </div>
                )}

                <div className="table-responsive shadow-sm rounded border bg-white view-table-wrapper">
                  <table className="table table-bordered table-hover mb-0">
                    <thead className="table-dark text-nowrap">
                      <tr>
                        <th>Category</th>
                        <th>Material Name</th>
                        <th>Material Code</th>
                        <th>Subject</th>
                        <th>Tax Rate</th>
                        <th>Mandatory / Optional</th>
                        <th>Volume</th>
                        <th>Year</th>
                        <th>Author</th>
                        <th>Publisher</th>
                        <th>Per Unit Rate</th>
                        <th>Total Amount</th>
                        <th>MRP</th>
                        <th>Cost Price</th>
                        <th>Composite Code</th>
                        <th>Composite Name</th>
                        <th>Quantity</th>
                        <th>Zone</th>
                        <th>Grade</th>
                        <th>Branch</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody className="text-nowrap">
                      {selectedBooks.length > 0 ? selectedBooks.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.category}</td>
                          <td>{item.material_name}</td>
                          <td>{item.material_code}</td>
                          <td>{item.subject}</td>
                          <td>{item.tax_rate}%</td>
                          <td>{item.mandatory_optional}</td>
                          <td>{item.volume}</td>
                          <td>{item.year}</td>
                          <td>{item.author}</td>
                          <td>{item.publisher}</td>
                          <td>₹{item.per_unit_rate}</td>
                          <td>₹{item.total_amount}</td>
                          <td>₹{item.mrp}</td>
                          <td>₹{item.cost_price}</td>
                          <td>{item.composite_code}</td>
                          <td>{item.composite_name}</td>
                          <td>{item.quantity}</td>
                          <td>{item.zone || activeBook.zone}</td>
                          <td>{item.grade || activeBook.grade}</td>
                          <td>{item.branch_name || item.branch || activeBook.branch}</td>
                          <td>
                            <div className="d-flex gap-2">
                              {userHasRight("Edit/Delete") && (
                                <>
                                  <button className="btn btn-outline-warning btn-sm" onClick={() => handleEditBook(item, idx)}>Edit</button>
                                  <button className="btn btn-outline-danger btn-sm" onClick={() => handleDeleteBook(item, idx)}>Delete</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan="20" className="text-center py-5 text-muted">No book items found for this kit</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="modal-footer bg-light">
                <button type="button" className="btn btn-secondary" onClick={() => setShowView(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEdit && activeBook && (
        <div className="card card-soft mt-4 p-4 shadow-sm">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div>
              <h5 className="mb-1">Edit Kit</h5>
              <div className="text-muted">Update basic details and save your changes.</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowEdit(false)}>Cancel</button>
          </div>
          <div className="row gx-3 gy-3">
            <div className="col-12 col-md-6">
              <label className="form-label">Book List Name</label>
              <input type="text" className="form-control" value={editForm.name} onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))} />
            </div>
            <div className="col-12 col-md-6">
              <label className="form-label">Branch</label>
              <select className="form-select" value={editForm.branch} onChange={e => setEditForm(prev => ({ ...prev, branch: e.target.value }))}>
                <option value="">Select Branch</option>
                {editBranchOptions.map(branch => <option key={branch} value={branch}>{branch}</option>)}
              </select>
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label">Zone</label>
              <select className="form-select" value={editForm.zone} onChange={e => {
                const zoneValue = e.target.value;
                setEditForm(prev => ({
                  ...prev,
                  zone: zoneValue,
                  branch: prev.branch && branchList.some(branch => branch.name === prev.branch && branch.zone === zoneValue) ? prev.branch : ""
                }));
              }}>
                <option value="">Select Zone</option>
                {zones.map(zone => <option key={zone} value={zone}>{zone || "All Zones"}</option>)}
              </select>
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label">Grade</label>
              <select className="form-select" value={editForm.grade} onChange={e => setEditForm(prev => ({ ...prev, grade: e.target.value }))}>
                <option value="">Select Grade</option>
                {grades.map(grade => <option key={grade} value={grade}>{grade}</option>)}
              </select>
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label">Status</label>
              <select className="form-select" value={editForm.status} onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value }))}>
                {statusOptions.filter(opt => opt).map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4 d-flex gap-2">
            <button className="btn btn-danger" onClick={handleSave}>Save Changes</button>
            <button className="btn btn-outline-secondary" onClick={() => setShowEdit(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
