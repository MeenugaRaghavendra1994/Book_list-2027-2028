import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import './App.css';

const BranchMultiSelect = ({ value = [], options = [], onChange, disabled = false, placeholder = "Search branch..." }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) setSearchTerm("");
  }, [isOpen]);

  const normalizedValue = Array.isArray(value) ? value.map(item => String(item || "").trim()).filter(Boolean) : [];
  const filteredOptions = options
    .filter(option => Boolean(option) && String(option).toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => String(a).localeCompare(String(b)));

  const toggleOption = (option) => {
    const normalized = String(option || "").trim();
    if (!normalized) return;
    if (normalizedValue.includes(normalized)) {
      onChange(normalizedValue.filter(item => item !== normalized));
    } else {
      onChange([...normalizedValue, normalized]);
    }
  };

  const removeOption = (option) => {
    const normalized = String(option || "").trim();
    onChange(normalizedValue.filter(item => item !== normalized));
  };

  return (
    <div className="position-relative" ref={containerRef}>
      <div
        className={`form-control d-flex flex-wrap align-items-center gap-1 ${disabled ? 'bg-light' : 'cursor-pointer'}`}
        onClick={() => { if (!disabled) setIsOpen(prev => !prev); }}
        style={{ minHeight: 'calc(1.5em + 1rem)', cursor: disabled ? 'not-allowed' : 'pointer' }}
      >
        {normalizedValue.length === 0 && <span className="text-muted">{placeholder}</span>}
        {normalizedValue.map((selected) => (
          <span key={selected} className="badge bg-secondary d-flex align-items-center gap-1">
            {selected}
            <button type="button" className="btn-close btn-close-white btn-sm" aria-label="Remove" onClick={(e) => { e.stopPropagation(); removeOption(selected); }} />
          </span>
        ))}
        <input
          type="text"
          className="border-0 flex-grow-1"
          placeholder={normalizedValue.length === 0 ? placeholder : "Search branches..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          disabled={disabled}
          onFocus={() => setIsOpen(true)}
          style={{ minWidth: 100, outline: 'none', boxShadow: 'none' }}
        />
      </div>

      {isOpen && !disabled && (
        <div className="position-absolute w-100 bg-white border rounded shadow-sm" style={{ maxHeight: 260, overflowY: 'auto', zIndex: 1050 }}>
          {filteredOptions.length > 0 ? filteredOptions.map((option) => {
            const normalized = String(option || "").trim();
            const checked = normalizedValue.includes(normalized);
            return (
              <button
                key={normalized}
                type="button"
                className="dropdown-item d-flex align-items-center justify-content-between"
                onClick={() => toggleOption(normalized)}
              >
                <span>{normalized}</span>
                <span>{checked ? '✓' : ''}</span>
              </button>
            );
          }) : (
            <div className="p-3 text-muted">No branches found.</div>
          )}
        </div>
      )}
    </div>
  );
};

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
  const [editForm, setEditForm] = useState({ name: "", zone: "", branch: [], grade: "", status: "Pending" });
  const [createForm, setCreateForm] = useState({ name: "", zone: "", branch: [], grade: "", status: "Pending" });
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

  // Missing state declarations for Table Explorer & Sidebar
  const [viewMode, setViewMode] = useState("kits");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showReportsSection, setShowReportsSection] = useState(false);
  const [tableFilters, setTableFilters] = useState({});
  const [showEditTableModal, setShowEditTableModal] = useState(false);
  const [editingTableRow, setEditingTableRow] = useState(null);
  const [showAddBranchModal, setShowAddBranchModal] = useState(false);
  const [newBranchForm, setNewBranchForm] = useState({ name: "", zone: "" });
  const [showAddProjectionModal, setShowAddProjectionModal] = useState(false);
  const [newProjectionForm, setNewProjectionForm] = useState({ grade: "", branch: "", zone: "", new_admissions: "", existing_admissions: "", total_projection: "" });

  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [users, setUsers] = useState([
    { id: 1, username: "Raghavendra", password: "8142037547", role: "Admin", rights: ["View", "Edit/Delete"] }
  ]);
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const storedUser = window.localStorage.getItem("school_book_erp_currentUser");
      return storedUser ? JSON.parse(storedUser) : null;
    } catch (err) {
      return null;
    }
  });
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(window.localStorage.getItem("school_book_erp_currentUser")));
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showManageUsers, setShowManageUsers] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "Admin", rights: [] });
  const [editingUser, setEditingUser] = useState(null);
  const [manageUserForm, setManageUserForm] = useState({ id: null, username: "", password: "", role: "Admin", rights: [] });
  const [branchList, setBranchList] = useState([]);
  const [zonesList, setZonesList] = useState([]);
  const [gradeList, setGradeList] = useState([]);
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [dashboardData, setDashboardData] = useState([]);
  const [orderTableData, setOrderTableData] = useState([]);
  const [showDashboardSection, setShowDashboardSection] = useState(false);
  const [dashboardFilters, setDashboardFilters] = useState({ zone: "", branch: "", grade: "" });
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

    axios.get(`${API_BASE_URL}/tables`)
      .then(res => setTables(res.data || []))
      .catch(() => setTables([]));
  }, []);

  useEffect(() => {
    if (selectedTable && viewMode === "explorer") { // Add tableFilters to dependencies
      axios.get(`${API_BASE_URL}/data/${selectedTable}`, { params: tableFilters })
        .then(res => setTableData(res.data || []))
        .catch(() => setTableData([]));
    }
  }, [selectedTable, viewMode, tableFilters]);

  useEffect(() => {
    if (viewMode === "dashboard") {
      axios.get(`${API_BASE_URL}/dashboard/item-wise-summary`, {
        params: {
          zone: dashboardFilters.zone,
          branch: dashboardFilters.branch,
          grade: dashboardFilters.grade
        }
      })
        .then(res => setDashboardData(res.data || []))
        .catch(() => setDashboardData([]));
    }
  }, [viewMode, dashboardFilters]);

  useEffect(() => {
    if (viewMode === "order-table") {
      axios.get(`${API_BASE_URL}/order-table`)
        .then(res => setOrderTableData(res.data || []))
        .catch(() => setOrderTableData([]));
    }
  }, [viewMode]);

  const zones = useMemo(() => ["", ...zonesList.filter(Boolean)], [zonesList]);
  const branchOptions = useMemo(() => {
    const filtered = filters.zone ? branchList.filter(branch => branch.zone === filters.zone) : branchList;
    return ["", ...Array.from(new Set(filtered.map(branch => branch.name)))];
  }, [branchList, filters.zone]);
  const dashboardBranchOptions = useMemo(() => {
    const filtered = dashboardFilters.zone ? branchList.filter(b => b.zone === dashboardFilters.zone) : branchList;
    return ["", ...Array.from(new Set(filtered.map(b => b.name)))];
  }, [branchList, dashboardFilters.zone]);
  const tableExplorerBranchOptions = useMemo(() => {
    const filtered = tableFilters.zone ? branchList.filter(b => b.zone === tableFilters.zone) : branchList;
    return ["", ...Array.from(new Set(filtered.map(b => b.name)))];
  }, [branchList, tableFilters.zone]);
  const projectionBranchOptions = useMemo(() => ["", ...Array.from(new Set(branchList.map(branch => branch.name)))], [branchList]);
  const bookBranchOptions = useMemo(() => {
    const currentZone = newBookItem.zone || activeBook?.zone;
    const filtered = currentZone ? branchList.filter(b => b.zone === currentZone) : branchList;
    return ["", ...Array.from(new Set(filtered.map(b => b.name)))];
  }, [branchList, newBookItem.zone, activeBook]);
  const createBranchOptions = useMemo(() => {
    const filtered = createForm.zone ? branchList.filter(branch => branch.zone === createForm.zone) : branchList;
    return Array.from(new Set(filtered.map(branch => branch.name))).filter(Boolean).sort();
  }, [branchList, createForm.zone]);
  const editBranchOptions = useMemo(() => {
    const filtered = editForm.zone ? branchList.filter(branch => branch.zone === editForm.zone) : branchList;
    return Array.from(new Set(filtered.map(branch => branch.name))).filter(Boolean).sort();
  }, [branchList, editForm.zone]);
  const grades = useMemo(() => ["", ...gradeList.filter(Boolean)], [gradeList]);
  const statusOptions = ["", "Pending", "Approved", "Completed"];
  const mandatoryOptions = ["", "Mandatory", "Optional"];
  const volumeOptions = ["", "Volume 1", "Volume 2", "Volume 3", "Volume 4","Term 1","Term 2"];
  const yearOptions = ["", "2023-2024", "2024-2025", "2025-2026", "2026-2027", "2027-2028"];

  const normalizeBranchArray = (branchData) => {
    if (Array.isArray(branchData)) {
      return branchData.map(item => String(item || "").trim()).filter(Boolean);
    }
    if (!branchData) return [];
    return String(branchData).split(',').map(item => item.trim()).filter(Boolean);
  };

  const renderBranchBadges = (branchData) => {
    const branches = normalizeBranchArray(branchData);
    if (!branches.length) return <span className="text-muted">None</span>;
    return branches.map((branchName, index) => (
      <span key={`${branchName}-${index}`} className="badge bg-secondary me-1 mb-1">{branchName}</span>
    ));
  };

  const BranchPreviewDropdown = ({ branchData }) => {
    const [openPreview, setOpenPreview] = useState(false);
    const [popupStyle, setPopupStyle] = useState({});
    const previewRef = useRef(null);
    const branches = normalizeBranchArray(branchData);
    const visibleBranches = branches.slice(0, 3);
    const hiddenCount = branches.length - visibleBranches.length;

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (previewRef.current && !previewRef.current.contains(event.target)) {
          setOpenPreview(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const calculatePopupStyle = () => {
      if (!previewRef.current) return {};
      const rect = previewRef.current.getBoundingClientRect();
      const popupWidth = Math.min(280, window.innerWidth - 40);
      const left = Math.max(20, Math.min(rect.left + window.scrollX, window.innerWidth - popupWidth - 20));
      const top = rect.bottom + window.scrollY + 8;
      return {
        position: 'fixed',
        left,
        top,
        width: popupWidth,
        maxHeight: 260,
        overflowY: 'auto',
        zIndex: 9999,
        boxSizing: 'border-box',
        wordBreak: 'break-word'
      };
    };

    const togglePreview = (e) => {
      e.stopPropagation();
      if (openPreview) {
        setOpenPreview(false);
        return;
      }
      setPopupStyle(calculatePopupStyle());
      setOpenPreview(true);
    };

    if (!branches.length) {
      return <span className="text-muted">None</span>;
    }

    return (
      <div ref={previewRef} className="d-inline-block" style={{ minWidth: 150, maxWidth: 260 }}>
        <div className="d-flex flex-wrap gap-1 align-items-center">
          {visibleBranches.map((branchName, index) => (
            <span key={`${branchName}-${index}`} className="badge bg-secondary">{branchName}</span>
          ))}
          {hiddenCount > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary px-2 py-1"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={togglePreview}
            >
              +{hiddenCount} more
            </button>
          )}
        </div>

        {openPreview && (
          <div className="bg-white border rounded shadow-sm mt-2" style={popupStyle}>
            {branches.map((branchName, index) => (
              <div key={`${branchName}-${index}`} className="px-3 py-2 border-bottom" style={{ whiteSpace: 'normal', overflowWrap: 'break-word' }}>
                {branchName}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    const next = books.filter(book => {
      const branchItems = normalizeBranchArray(book.branch).map(item => item.toLowerCase());
      return (
        (!filters.zone || 
          String(book.zone || "").trim().toLowerCase() === String(filters.zone).trim().toLowerCase()) &&
        (!filters.branch || 
          branchItems.includes(String(filters.branch).trim().toLowerCase())) &&
        (!filters.grade || 
          String(book.grade || "").trim().toLowerCase() === String(filters.grade).trim().toLowerCase()) &&
        (!filters.status || 
          String(book.status || "").trim().toLowerCase() === String(filters.status).trim().toLowerCase())
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

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    localStorage.removeItem("school_book_erp_currentUser");
  };

  const handleRunDispatchLoad = async () => {
    // eslint-disable-next-line no-restricted-globals
    if (!confirm("Are you sure you want to run the dispatch data load? This may take some time.")) return;
    try {
      await axios.post(`${API_BASE_URL}/run-dispatch-load`, { user: currentUser });
      alert("Dispatch data loaded successfully!");
      // Optionally refresh order table if viewing it
      if (viewMode === 'order-table') {
        axios.get(`${API_BASE_URL}/order-table`)
          .then(res => setOrderTableData(res.data || []))
          .catch(() => setOrderTableData([]));
      }
    } catch (error) {
      alert("Error running dispatch load: " + (error.response?.data?.error || error.message));
    }
  };

  const handleApplyTableFilters = () => {
    // The useEffect already depends on tableFilters, so the table will reload automatically.
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
      localStorage.setItem("school_book_erp_currentUser", JSON.stringify(foundUser));
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
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
      alert("Failed to delete user from database.");
    }
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
    const branchArray = Array.isArray(book.branch)
      ? book.branch.map(item => String(item || "").trim()).filter(Boolean)
      : String(book.branch || "").split(',').map(item => item.trim()).filter(Boolean);
    setActiveBook(book);
    setEditForm({ name: book.name, zone: book.zone, branch: branchArray, grade: book.grade, status: book.status });
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
    setCreateForm({ name: "", zone: "", branch: [], grade: "", status: "Pending" });
  };

  const handleCreateSave = async () => {
    if (!createForm.name.trim() || !createForm.zone.trim() || !createForm.grade.trim()) {
      alert("Please enter Book List Name, Zone and Grade.");
      return;
    }

    const payload = {
      ...createForm,
      createdBy: "Meenga Raghavendra - 20240001178_OIS",
      createdAt: new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }).replace(/,/g, ''),
      statusInfo: createForm.status || "Pending"
    };

    try {
      const res = await axios.post(`${API_BASE_URL}/kits`, payload);
      const createdKits = Array.isArray(res.data.kits) ? res.data.kits : (res.data.kit ? [res.data.kit] : []);
      if (createdKits.length) {
        setBooks(prev => [...prev, ...createdKits]);
        setFilteredBooks(prev => [...prev, ...createdKits]);
      }
    } catch (err) {
      console.error("Failed to create kit:", err);
      alert("Could not create book list. Please check the name, zone, and existing records.");
      return;
    }

    setShowCreate(false);
    setCreateForm({ name: "", zone: "", branch: [], grade: "", status: "Pending" });
  };

  const handleDeleteKit = async (id) => {
    if (!userHasRight("Edit/Delete")) {
      alert("You do not have permission to delete kits.");
      return;
    }
    if (!window.confirm("Are you sure you want to delete this kit and all its books?")) return;

    try {
      await axios.delete(`${API_BASE_URL}/kits/${id}`);
      setBooks(prev => prev.filter(kit => kit.id !== id));
      setFilteredBooks(prev => prev.filter(kit => kit.id !== id));
    } catch (err) {
      alert("Failed to delete kit: " + (err.response?.data || err.message));
    }
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
        branch: (row.branch || row['Branch'] || row['Branch Name'] || row['branch_name'] || activeBook.branch || "").trim()
      };

      try {
        const response = await axios.post(`${API_BASE_URL}/books`, { ...bookItem, kit_id: activeBook.id });
        if (response.data?.book) {
          addedBooks.push(response.data.book);
        } else {
          // Fallback if backend didn't return the object with ID
          addedBooks.push({ ...bookItem, id: Date.now() + Math.random() });
        }
      } catch (error) {
        console.error("Failed to save row to DB:", bookItem.material_code, error?.response?.data || error?.message);
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

  const handleEditTableRow = (row) => {
    if (!userHasRight("Edit/Delete")) {
      alert("You do not have permission to edit table rows.");
      return;
    }
    setEditingTableRow(row);
    setShowEditTableModal(true);
  };

  const handleDeleteTableRow = async (table, id) => {
    if (!userHasRight("Edit/Delete")) {
      alert("You do not have permission to delete table rows.");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete this record (ID: ${id}) from table "${table}"?`)) return;

    try {
      const response = await axios.delete(`${API_BASE_URL}/${table}/${id}`);
      if (response.data.success) {
        alert(`Record (ID: ${id}) deleted successfully from ${table}.`);
        // Refresh table data after deletion
        axios.get(`${API_BASE_URL}/data/${table}`, { params: tableFilters })
          .then(res => setTableData(res.data || []))
          .catch(() => setTableData([]));
      } else {
        alert("Failed to delete record: " + (response.data.error || "Unknown error"));
      }
    } catch (err) {
      console.error(`Delete failed for ${table} (ID: ${id}):`, err.response?.data || err.message);
      alert(`Could not delete record from ${table}: ` + (err.response?.data?.error || err.message || "Unknown error"));
    }
  };

  const handleSaveTableRow = async () => {
    if (!editingTableRow || !selectedTable) return;
    if (!userHasRight("Edit/Delete")) {
      alert("You do not have permission to save changes.");
      return;
    }

    try {
      const payload = { ...editingTableRow };
      // Remove id from payload as it's in the URL
      delete payload.id;

      const response = await axios.put(`${API_BASE_URL}/${selectedTable}/${editingTableRow.id}`, payload);
      if (response.data.success) {
        alert(`Record (ID: ${editingTableRow.id}) updated successfully in ${selectedTable}.`);
        setShowEditTableModal(false);
        setEditingTableRow(null);
        // Refresh table data after update
        axios.get(`${API_BASE_URL}/data/${selectedTable}`, { params: tableFilters })
          .then(res => setTableData(res.data || []))
          .catch(() => setTableData([]));
      } else {
        alert("Failed to update record: " + (response.data.error || "Unknown error"));
      }
    } catch (err) {
      console.error(`Update failed for ${selectedTable} (ID: ${editingTableRow.id}):`, err.response?.data || err.message);
      alert(`Could not update record in ${selectedTable}: ` + (err.response?.data?.error || err.message || "Unknown error"));
    }
  };

  const handleAddBranch = () => {
    setNewBranchForm({ name: "", zone: "" });
    setShowAddBranchModal(true);
  };

  const handleSaveNewBranch = async () => {
    if (!newBranchForm.name.trim() || !newBranchForm.zone.trim()) {
      alert("Please enter both Branch Name and Zone.");
      return;
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/branches`, {
        name: newBranchForm.name.trim(),
        zone: newBranchForm.zone.trim(),
        created_at: new Date().toISOString()
      });

      if (response.data.success) {
        alert("New branch created successfully.");
        setShowAddBranchModal(false);
        setNewBranchForm({ name: "", zone: "" });
        axios.get(`${API_BASE_URL}/data/branches`, { params: tableFilters })
          .then(res => setTableData(res.data || []))
          .catch(() => setTableData([]));
      } else {
        alert("Failed to create branch: " + (response.data.error || "Unknown error"));
      }
    } catch (err) {
      console.error("Create branch failed:", err.response?.data || err.message);
      alert("Could not create branch: " + (err.response?.data?.error || err.message || "Unknown error"));
    }
  };

  const handleSaveNewProjection = async () => {
    if (!newProjectionForm.grade.trim() || !newProjectionForm.branch.trim() || !newProjectionForm.zone.trim()) {
      alert("Grade, Branch, and Zone are required.");
      return;
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/student_projections`, {
        grade: newProjectionForm.grade.trim(),
        branch: newProjectionForm.branch.trim(),
        zone: newProjectionForm.zone.trim(),
        new_admissions: Number(newProjectionForm.new_admissions) || 0,
        existing_admissions: Number(newProjectionForm.existing_admissions) || 0,
        total_projection: Number(newProjectionForm.total_projection) || 0
      });

      if (response.data.success) {
        alert("New projection created successfully.");
        setShowAddProjectionModal(false);
        setNewProjectionForm({ grade: "", branch: "", zone: "", new_admissions: "", existing_admissions: "", total_projection: "" });
        axios.get(`${API_BASE_URL}/data/student_projections`, { params: tableFilters })
          .then(res => setTableData(res.data || []))
          .catch(() => setTableData([]));
      } else {
        alert("Failed to create projection: " + (response.data.error || "Unknown error"));
      }
    } catch (err) {
      console.error("Create projection failed:", err.response?.data || err.message);
      alert("Could not create projection: " + (err.response?.data?.error || err.message || "Unknown error"));
    }
  };

  const handleExportTableData = async () => {
    if (!selectedTable || tableData.length === 0) {
      alert("No table selected or no data to export.");
      return;
    }
    try {
      const response = await axios.get(`${API_BASE_URL}/export-table/${selectedTable}`, {
        responseType: 'blob', // Important for downloading files
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${selectedTable}-export.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      alert("Failed to export table data.");
      console.error("Export table data error:", error);
    }
  };

  const handleDeleteBook = async (item) => {
    if (!userHasRight("Edit/Delete")) {
      alert("You do not have permission to delete book items.");
      return;
    }

    // Check if the ID looks like a database integer or a temporary float/string
    const isRealId = item.id && !String(item.id).includes('.');

    if (item.id && isRealId) {
      if (!window.confirm(`Delete book item (ID: ${item.id}) from the database?`)) return;
      try {
        const response = await axios.delete(`${API_BASE_URL}/books/${item.id}`);
        if (!response.data.success) {
          throw new Error(response.data.error || "Failed to delete from database.");
        }

        // Use String conversion to handle potential string/number ID mismatches safely with strict inequality
        setSelectedBooks(prev => prev.filter(b => String(b.id) !== String(item.id)));
        setBooks(prev => prev.map(book => book.id === activeBook.id ? { ...book, books: (book.books || []).filter(b => String(b.id) !== String(item.id)) } : book));
        setFilteredBooks(prev => prev.map(book => book.id === activeBook.id ? { ...book, books: (book.books || []).filter(b => String(b.id) !== String(item.id)) } : book));
        setActiveBook(prev => ({ ...prev, books: (prev.books || []).filter(b => String(b.id) !== String(item.id)) }));

      } catch (err) {
        console.error("Delete failed:", err.response?.data || err.message);
        if (err.response && err.response.status === 404) {
          alert("Book not found in the database. It might have been deleted already or the ID is incorrect.");
        } else {
          alert("Could not delete book: " + (err.response?.data?.error || err.message || "Unknown error"));
        }
      }
    } else {
      const reason = !item.id ? "ID is missing/null" : "ID is a temporary local ID";
      if (!window.confirm(`Cannot delete from database because ${reason}. Remove from local list?`)) return;
      // Remove from all state sources to keep UI consistent
      setSelectedBooks(prev => prev.filter(b => b !== item));
      setBooks(prev => prev.map(book => book.id === activeBook.id ? { ...book, books: (book.books || []).filter(b => b !== item) } : book));
      setFilteredBooks(prev => prev.map(book => book.id === activeBook.id ? { ...book, books: (book.books || []).filter(b => b !== item) } : book));
      setActiveBook(prev => ({ ...prev, books: (prev.books || []).filter(b => b !== item) }));
    }
  };

  const handleSave = async () => {
    if (!activeBook) return;
    if (!editForm.name.trim() || !editForm.zone.trim() || !editForm.grade.trim()) {
      alert("Please enter Book List Name, Zone and Grade.");
      return;
    }

    const payload = {
      name: editForm.name.trim(),
      zone: editForm.zone.trim(),
      grade: editForm.grade.trim(),
      status: editForm.status,
      createdBy: activeBook.created_by || activeBook.createdBy || "",
      createdAt: activeBook.created_at || activeBook.createdAt || "",
      statusInfo: activeBook.status_info || activeBook.statusInfo || "",
      branch: Array.isArray(editForm.branch) ? editForm.branch : String(editForm.branch || "").split(',').map(item => item.trim()).filter(Boolean)
    };

    try {
      const response = await axios.put(`${API_BASE_URL}/kits/${activeBook.id}`, payload);
      const updatedKit = response.data.kit || { ...activeBook, ...payload, branch: Array.isArray(payload.branch) ? payload.branch.join(', ') : String(payload.branch) };
      setBooks(prev => prev.map(book => book.id === activeBook.id ? updatedKit : book));
      setFilteredBooks(prev => prev.map(book => book.id === activeBook.id ? updatedKit : book));
      setActiveBook(null);
      setShowEdit(false);
    } catch (err) {
      console.error("Failed to update kit:", err);
      alert("Could not save kit changes. Please try again.");
    }
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
    } catch (err) {
      console.error("Book save failed:", err?.response?.data || err.message);
      alert("Database Error: Could not save the book. " + (err.response?.data || "Check console for details."));
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

  const handleExport = async () => {
    if (!filteredBooks.length) return;
    try {
      // Fetch complete kit data with books for all filtered kits
      const kitsWithBooks = await Promise.all(
        filteredBooks.map(kit =>
          axios.get(`${API_BASE_URL}/kits/${kit.id}`)
            .then(res => res.data)
            .catch(() => kit) // Fallback to original kit if fetch fails
        )
      );
      const { headers, rows } = buildExportRows(kitsWithBooks);
      downloadCsv(headers, rows, "book-list-export.csv");
    } catch (error) {
      console.error("Export error:", error);
      alert("Failed to export. Please try again.");
    }
  };

  const handleExportKit = async (kit) => {
    if (!kit) return;
    try {
      // Fetch complete kit data with books
      const kitWithBooks = await axios.get(`${API_BASE_URL}/kits/${kit.id}`)
        .then(res => res.data)
        .catch(() => kit); // Fallback to original kit if fetch fails
      const { headers, rows } = buildExportRows([kitWithBooks]);
      downloadCsv(headers, rows, `${kit.name || 'kit'}-export.csv`);
    } catch (error) {
      console.error("Export error:", error);
      alert("Failed to export. Please try again.");
    }
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
    <div className="d-flex" style={{ minHeight: '100vh' }}>
      {/* SIDEBAR */}
      <div className={`sidebar shadow-sm bg-white d-flex flex-column border-end ${isSidebarCollapsed ? 'collapsed' : ''}`}
           style={{ width: isSidebarCollapsed ? '70px' : '250px', position: 'sticky', top: 0, height: '100vh', transition: 'width 0.3s ease, min-width 0.3s ease', minWidth: isSidebarCollapsed ? '70px' : '250px' }}>
        <div className="p-3 border-bottom d-flex align-items-center justify-content-between" style={{ minHeight: '60px' }}>
          {!isSidebarCollapsed && (
            <div>
              <h5 className="fw-bold text-primary mb-0">Book ERP</h5>
              <small className="text-muted">Console</small>
            </div>
          )}
          <button className="btn btn-sm btn-light border p-0"
                  onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                  style={{ width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}>
            {isSidebarCollapsed ? <i className="bi bi-arrow-right"></i> : <i className="bi bi-arrow-left"></i>}
          </button>
        </div>
        
        <div className="px-3 mb-4">
          {!isSidebarCollapsed && <div className="small text-uppercase text-muted fw-bold mb-2 px-2 mt-3" style={{ fontSize: '0.7rem' }}>MAIN</div>}
          <div 
            className={`table-item px-3 py-2 ${viewMode === 'kits' ? 'active' : ''}`}
            onClick={() => { setViewMode('kits'); setSelectedTable(null); }}
          >
            {isSidebarCollapsed ? "📚" : "View/Create Book List"}
          </div>
        </div>

        <div className="px-3 flex-grow-1 overflow-auto">
          {!isSidebarCollapsed && (
            <div
              className="d-flex align-items-center justify-content-between table-item px-2 py-2"
              style={{ cursor: 'pointer' }}
              onClick={() => setShowReportsSection(prev => !prev)}
            >
              <div className="small text-uppercase text-muted fw-bold" style={{ fontSize: '0.7rem' }}>
                Reports & Masters
              </div>
              <div className="text-muted">
                {showReportsSection ? <i className="bi bi-chevron-up"></i> : <i className="bi bi-chevron-down"></i>}
              </div>
            </div>
          )}
          {showReportsSection && tables.map((t, index) => (
            // Only show book_list_users table to Admin
            (t.table_name !== 'book_list_users' || currentUser?.role === 'Admin') && (
              <div
                key={index}
                className={`table-item px-3 py-2 ${selectedTable === t.table_name ? 'active' : ''}`}
                onClick={() => {
                  setSelectedTable(t.table_name);
                  setViewMode('explorer');
                  setTableFilters({}); // Clear filters when changing table
                }}
              >
                {isSidebarCollapsed ? "⚙️" : t.table_name}
              </div>
            )
          ))}
          {showReportsSection && (
            <div
              className={`table-item px-3 py-2 ${viewMode === 'order-table' ? 'active' : ''}`}
              onClick={() => { setViewMode('order-table'); setSelectedTable(null); }}
            >
              {isSidebarCollapsed ? "📦" : "Order Table"}
            </div>
          )}

          {!isSidebarCollapsed && (
            <div
              className="d-flex align-items-center justify-content-between table-item px-2 py-2 mt-3"
              style={{ cursor: 'pointer' }}
              onClick={() => setShowDashboardSection(prev => !prev)}
            >
              <div className="small text-uppercase text-muted fw-bold" style={{ fontSize: '0.7rem' }}>
                Dashboard
              </div>
              <div className="text-muted">
                {showDashboardSection ? <i className="bi bi-chevron-up"></i> : <i className="bi bi-chevron-down"></i>}
              </div>
            </div>
          )}
          {showDashboardSection && (
            <div
              className={`table-item px-3 py-2 ${viewMode === 'dashboard' ? 'active' : ''}`}
              onClick={() => { setViewMode('dashboard'); setSelectedTable(null); }}
            >
              {isSidebarCollapsed ? "📊" : "Item Wise Summary"}
            </div>
          )}
          {currentUser?.role === 'Admin' && (
            <div
              className="table-item px-3 py-2 mt-3"
              onClick={handleRunDispatchLoad}
              style={{ cursor: 'pointer', backgroundColor: '#fff3cd', border: '1px solid #ffeaa7' }}
            >
              {isSidebarCollapsed ? "🚀" : "Run Dispatch Load"}
            </div>
          )}
        </div>
        
        <div className="p-3 border-top mt-auto bg-light">
          {isSidebarCollapsed ? <span title={currentUser?.username}>👤</span> : <div className="small text-muted mb-1 px-2">User: <strong>{currentUser?.username}</strong></div>}
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-grow-1 overflow-auto">
        {viewMode === 'kits' ? (
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
          {currentUser?.role === "Admin" && (
            <button className="btn btn-outline-primary btn-sm px-4" onClick={() => setShowCreateUser(prev => !prev)}>
              {showCreateUser ? "Cancel User" : "Create User"}
            </button>
          )}
          {currentUser?.role === "Admin" && (
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
          <div className="row gx-3 gy-3">
            <div className="col-12 col-md-6">
              <label className="form-label">Book List Name</label>
              <input type="text" className="form-control" value={createForm.name} onChange={e => setCreateForm(prev => ({ ...prev, name: e.target.value }))} />
            </div>
            <div className="col-12 col-md-6">
              <label className="form-label">Branches (optional)</label>
              <BranchMultiSelect
                options={createBranchOptions}
                value={createForm.branch}
                onChange={(selected) => setCreateForm(prev => ({ ...prev, branch: selected }))}
                placeholder="Search and select branches"
              />
              <div className="form-text">Leave empty to assign the book list to all branches in the selected zone automatically.</div>
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

      {showCreateUser && currentUser?.role === "Admin" && (
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

      {showManageUsers && currentUser?.role === "Admin" && (
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
                <td><BranchPreviewDropdown branchData={book.branch} /></td>
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
                    {userHasRight("Edit/Delete") && (
                      <button className="btn btn-outline-danger btn-sm" onClick={() => handleDeleteKit(book.id)}>Delete</button>
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
                        <th>ID</th>
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
                          <td className="text-muted small">{item.id || <span className="text-danger">NULL</span>}</td>
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
                          <td>{renderBranchBadges(item.branch_name || item.branch || activeBook.branch)}</td>
                          <td>
                            <div className="d-flex gap-2">
                              {userHasRight("Edit/Delete") && (
                                <>
                                  <button className="btn btn-outline-warning btn-sm" onClick={() => handleEditBook(item, idx)}>Edit</button>
                                  <button className="btn btn-outline-danger btn-sm" onClick={() => handleDeleteBook(item)}>Delete</button>
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
              <label className="form-label">Branches</label>
              <BranchMultiSelect
                options={editBranchOptions}
                value={editForm.branch || []}
                onChange={(selected) => setEditForm(prev => ({ ...prev, branch: selected }))}
                placeholder="Search and select branches"
              />
              <div className="form-text">Select one or more branches for this book list.</div>
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label">Zone</label>
              <select className="form-select" value={editForm.zone} onChange={e => {
                const zoneValue = e.target.value;
                setEditForm(prev => ({
                  ...prev,
                  zone: zoneValue,
                  branch: Array.isArray(prev.branch)
                    ? prev.branch.filter(branchName => branchList.some(branch => branch.name === branchName && branch.zone === zoneValue))
                    : []
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
        ) : viewMode === 'dashboard' ? (
          <div className="page-wrapper py-4 px-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h2 className="page-title">📊 Item Wise Summary Dashboard</h2>
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setViewMode('kits')}>Back to App</button>
            </div>

            {/* Dashboard Filters */}
            <div className="card card-soft p-4 shadow-sm border-0 mb-4">
              <div className="mb-3">
                <h5 className="mb-3">Filter Dashboard</h5>
              </div>
              <div className="row gx-3 gy-3">
                <div className="col-12 col-md-3">
                  <label className="form-label">Zone</label>
                  <select 
                    className="form-select" 
                    value={dashboardFilters.zone} 
                    onChange={(e) => setDashboardFilters(prev => ({ ...prev, zone: e.target.value, branch: "" }))}
                  >
                    <option value="">All Zones</option>
                    {zones.map(zone => zone && <option key={zone} value={zone}>{zone}</option>)}
                  </select>
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label">Branch</label>
                  <select 
                    className="form-select" 
                    value={dashboardFilters.branch} 
                    onChange={(e) => setDashboardFilters(prev => ({ ...prev, branch: e.target.value }))}
                  >
                    <option value="">All Branches</option>
                    {dashboardBranchOptions.map(branch => branch && <option key={branch} value={branch}>{branch}</option>)}
                  </select>
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label">Grade</label>
                  <select 
                    className="form-select" 
                    value={dashboardFilters.grade} 
                    onChange={(e) => setDashboardFilters(prev => ({ ...prev, grade: e.target.value }))}
                  >
                    <option value="">All Grades</option>
                    {grades.map(grade => grade && <option key={grade} value={grade}>{grade}</option>)}
                  </select>
                </div>
                <div className="col-12 col-md-3 d-flex align-items-end">
                  <button 
                    className="btn btn-outline-secondary btn-sm w-100" 
                    onClick={() => setDashboardFilters({ zone: "", branch: "", grade: "" })}
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            </div>

            {/* Dashboard Table */}
            <div className="card card-soft p-4 shadow-sm border-0">
              <div className="table-responsive rounded-3 border">
                <table className="table table-sm table-hover align-middle mb-0">
                  <thead className="table-light text-nowrap">
                    <tr>
                      <th className="py-3 px-3">Grade</th>
                      <th className="py-3 px-3">Material Code</th>
                      <th className="py-3 px-3">Material Name</th>
                      <th className="py-3 px-3">Book List Quantity</th>
                      <th className="py-3 px-3">Projection</th>
                      <th className="py-3 px-3">Order Quantity</th>
                    </tr>
                  </thead>
                  <tbody className="text-nowrap">
                    {dashboardData.length > 0 ? dashboardData.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-3">{item.grade || "N/A"}</td>
                        <td className="px-3">{item.material_code || "N/A"}</td>
                        <td className="px-3">{item.material_name || "N/A"}</td>
                        <td className="px-3 text-center">{item.book_list_quantity || 0}</td>
                        <td className="px-3 text-center">{item.projection || 0}</td>
                        <td className="px-3 text-center">{item.order_quantity || 0}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan="6" className="text-center py-5 text-muted">No data found. Adjust filters or check your database.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 d-flex justify-content-between align-items-center">
                <small className="text-muted">Total Items: <strong>{dashboardData.length}</strong></small>
                <button className="btn btn-success btn-sm" onClick={() => {
                  const csvContent = [
                    ['Grade', 'Material Code', 'Material Name', 'Book List Quantity', 'Projection', 'Order Quantity'],
                    ...dashboardData.map(item => [
                      item.grade, item.material_code, item.material_name, item.book_list_quantity, item.projection, item.order_quantity
                    ])
                  ].map(row => row.map(cell => `"${cell || ""}"`).join(',')).join('\n');
                  
                  const blob = new Blob([csvContent], { type: 'text/csv' });
                  const url = window.URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.setAttribute('download', 'item-wise-summary.csv');
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                }}>Export to CSV</button>
              </div>
            </div>
          </div>
        ) : viewMode === 'order-table' ? (
          <div className="page-wrapper py-4 px-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h2 className="page-title">📦 Order Table</h2>
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setViewMode('kits')}>Back to App</button>
            </div>

            {/* Order Table */}
            <div className="card card-soft p-4 shadow-sm border-0">
              <div className="table-responsive rounded-3 border">
                <table className="table table-sm table-hover align-middle mb-0">
                  <thead className="table-light text-nowrap">
                    <tr>
                      <th className="py-3 px-3">Branch Name</th>
                      <th className="py-3 px-3">Grade Name</th>
                      <th className="py-3 px-3">Item SKU</th>
                      <th className="py-3 px-3">Item Name</th>
                      <th className="py-3 px-3">Quantity</th>
                    </tr>
                  </thead>
                  <tbody className="text-nowrap">
                    {orderTableData.length > 0 ? orderTableData.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-3">{item.branch_name || "N/A"}</td>
                        <td className="px-3">{item.grade_name || "N/A"}</td>
                        <td className="px-3">{item.item_sku || "N/A"}</td>
                        <td className="px-3">{item.item_name || "N/A"}</td>
                        <td className="px-3 text-center">{item.quantity || 0}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan="5" className="text-center py-5 text-muted">No data found. Run dispatch load to populate data.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 d-flex justify-content-between align-items-center">
                <small className="text-muted">Total Items: <strong>{orderTableData.length}</strong></small>
                <button className="btn btn-success btn-sm" onClick={() => {
                  const csvContent = [
                    ['Branch Name', 'Grade Name', 'Item SKU', 'Item Name', 'Quantity'],
                    ...orderTableData.map(item => [
                      item.branch_name, item.grade_name, item.item_sku, item.item_name, item.quantity
                    ])
                  ].map(row => row.map(cell => `"${cell || ""}"`).join(',')).join('\n');
                  
                  const blob = new Blob([csvContent], { type: 'text/csv' });
                  const url = window.URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.setAttribute('download', 'order-table.csv');
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                }}>Export to CSV</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="page-wrapper py-4 px-4">
            <>
              {/* Filter Inputs for specific tables */}
              {(selectedTable === 'pricing' || selectedTable === 'branches' || selectedTable === 'grades' || selectedTable === 'student_projections') && (
                <div className="card card-soft p-4 shadow-sm border-0 mb-4">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h5 className="mb-0">Filter Table: {selectedTable}</h5>
                    <button className="btn btn-primary btn-sm px-4" onClick={handleApplyTableFilters}>Go / Search</button>
                  </div>
                  <div className="row g-3 align-items-end">
                    {selectedTable === 'pricing' && (
                      <div className="col-md-6">
                        <label className="form-label">Material Code</label>
                        <input
                          type="text"
                          className="form-control"
                          value={tableFilters.material_code || ''}
                          onChange={(e) => setTableFilters(prev => ({ ...prev, material_code: e.target.value }))}
                          placeholder="Filter by material code"
                        />
                      </div>
                    )}
                    {selectedTable === 'branches' && (
                      <>
                        <div className="col-md-6">
                          <label className="form-label">Branch Name</label>
                          <input
                            type="text"
                            className="form-control"
                            value={tableFilters.name || ''}
                            onChange={(e) => setTableFilters(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Filter by branch name"
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label">Zone</label>
                          <input
                            type="text"
                            className="form-control"
                            value={tableFilters.zone || ''}
                            onChange={(e) => setTableFilters(prev => ({ ...prev, zone: e.target.value }))}
                            placeholder="Filter by zone"
                          />
                        </div>
                      </>
                    )}
                    {selectedTable === 'grades' && (
                      <div className="col-md-6">
                        <label className="form-label">Grade Name</label>
                        <input type="text" className="form-control" value={tableFilters.name || ''} onChange={(e) => setTableFilters(prev => ({ ...prev, name: e.target.value }))} placeholder="Filter by grade name" />
                      </div>
                    )}
                    {selectedTable === 'student_projections' && (
                      <>
                        <div className="col-md-4">
                          <label className="form-label">Grade</label>
                          <select className="form-select" value={tableFilters.grade || ''} onChange={(e) => setTableFilters(prev => ({ ...prev, grade: e.target.value }))}>
                            <option value="">All Grades</option>
                            {grades.map(grade => <option key={grade} value={grade}>{grade}</option>)}
                          </select>
                        </div>
                        <div className="col-md-4">
                          <label className="form-label">Branch</label>
                          <select className="form-select" value={tableFilters.branch || ''} onChange={(e) => setTableFilters(prev => ({ ...prev, branch: e.target.value }))}>
                            <option value="">All Branches</option>
                            {tableExplorerBranchOptions.map(branch => <option key={branch} value={branch}>{branch}</option>)}
                          </select>
                        </div>
                        <div className="col-md-4">
                          <label className="form-label">Zone</label>
                          <select className="form-select" value={tableFilters.zone || ''} onChange={(e) => setTableFilters(prev => ({ ...prev, zone: e.target.value }))}>
                            <option value="">All Zones</option>
                            {zones.map(zone => <option key={zone} value={zone}>{zone || 'All Zones'}</option>)}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="card card-soft p-4 shadow-sm border-0">
                <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
                  <div>
                    <h4 className="mb-0">Table: <span className="text-danger fw-bold">{selectedTable}</span></h4>
                  </div>
                  <div className="d-flex gap-2 flex-wrap align-items-center">
                    <div className="badge bg-secondary">{tableData.length} records shown</div>
                    {selectedTable === 'branches' && userHasRight("Edit/Delete") && (
                      <button className="btn btn-danger btn-sm" onClick={handleAddBranch}>
                        + Add New Branch
                      </button>
                    )}
                    {selectedTable === 'student_projections' && userHasRight("Edit/Delete") && (
                      <button className="btn btn-danger btn-sm" onClick={() => setShowAddProjectionModal(true)}>
                        + Add New Projection
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="table-responsive rounded-3 border">
                  <table className="table table-sm table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        {tableData.length > 0 && Object.keys(tableData[0]).map(key => <th key={key} className="py-3 px-3">{key}</th>)}
                        {(userHasRight("Edit/Delete") && (selectedTable === 'pricing' || selectedTable === 'grades' || selectedTable === 'branches' || selectedTable === 'student_projections' || (selectedTable === 'book_list_users' && currentUser?.role === 'Admin'))) && <th>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.length > 0 ? tableData.map((row, i) => (
                        <tr key={i}>
                          {Object.values(row).map((val, j) => (
                            <td key={j} className="px-3 text-truncate" style={{ maxWidth: '200px' }}>
                              {val === null ? <span className="text-muted fst-italic">null</span> : typeof val === 'object' ? JSON.stringify(val) : String(val)}
                            </td>
                          ))}
                          {(userHasRight("Edit/Delete") && (selectedTable === 'pricing' || selectedTable === 'grades' || selectedTable === 'branches' || selectedTable === 'student_projections' || (selectedTable === 'book_list_users' && currentUser?.role === 'Admin'))) && (
                            <td>
                              <div className="d-flex gap-2">
                                <button className="btn btn-outline-warning btn-sm" onClick={() => handleEditTableRow(row)}>Edit</button>
                                <button className="btn btn-outline-danger btn-sm" onClick={() => handleDeleteTableRow(selectedTable, row.id)}>Delete</button>
                              </div>
                            </td>
                          )}
                        </tr>
                      )) : (
                        <tr><td colSpan="10" className="text-center py-5 text-muted">No data found in this table.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 d-flex justify-content-end">
                  <button className="btn btn-success btn-sm" onClick={handleExportTableData}>Export Table</button>
                </div>
              </div>
            {showEditTableModal && editingTableRow && (
              <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
                <div className="modal-dialog modal-lg">
                  <div className="modal-content shadow-lg border-0">
                    <div className="modal-header bg-primary text-white">
                      <h5 className="modal-title">Edit Record in {selectedTable} (ID: {editingTableRow.id})</h5>
                      <button type="button" className="btn-close btn-close-white" onClick={() => setShowEditTableModal(false)} aria-label="Close"></button>
                    </div>
                    <div className="modal-body p-4 bg-light">
                      <div className="row g-3">
                        {Object.keys(editingTableRow).map(key => (
                          <div className="col-12 col-md-6" key={key}>
                            <label className="form-label text-capitalize">{key.replace(/_/g, ' ')}</label>
                            {key === 'id' || key === 'created_at' || key === 'updated_at' ? (
                              <input type="text" className="form-control" value={editingTableRow[key]} disabled />
                            ) : (
                              <input
                                type={typeof editingTableRow[key] === 'number' ? 'number' : 'text'}
                                className="form-control"
                                value={editingTableRow[key] || ''}
                                onChange={(e) => setEditingTableRow(prev => ({ ...prev, [key]: e.target.value }))}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="modal-footer bg-light">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleSaveTableRow}
                      >
                        Save Changes
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setShowEditTableModal(false);
                          setEditingTableRow(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showAddBranchModal && (
              <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
                <div className="modal-dialog modal-md">
                  <div className="modal-content shadow-lg border-0">
                    <div className="modal-header bg-danger text-white">
                      <h5 className="modal-title">Add New Branch</h5>
                      <button type="button" className="btn-close btn-close-white" onClick={() => setShowAddBranchModal(false)} aria-label="Close"></button>
                    </div>
                    <div className="modal-body p-4 bg-light">
                      <div className="row g-3">
                        <div className="col-12">
                          <label className="form-label">Branch Name</label>
                          <input
                            type="text"
                            className="form-control"
                            value={newBranchForm.name}
                            onChange={(e) => setNewBranchForm(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Enter branch name"
                          />
                        </div>
                        <div className="col-12">
                          <label className="form-label">Zone</label>
                          <input
                            type="text"
                            className="form-control"
                            value={newBranchForm.zone}
                            onChange={(e) => setNewBranchForm(prev => ({ ...prev, zone: e.target.value }))}
                            placeholder="Enter zone"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="modal-footer bg-light">
                      <button type="button" className="btn btn-danger" onClick={handleSaveNewBranch}>Save Branch</button>
                      <button type="button" className="btn btn-secondary" onClick={() => setShowAddBranchModal(false)}>Cancel</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {showAddProjectionModal && (
              <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
                <div className="modal-dialog modal-md">
                  <div className="modal-content shadow-lg border-0">
                    <div className="modal-header bg-danger text-white">
                      <h5 className="modal-title">Add New Projection</h5>
                      <button type="button" className="btn-close btn-close-white" onClick={() => setShowAddProjectionModal(false)} aria-label="Close"></button>
                    </div>
                    <div className="modal-body p-4 bg-light">
                      <div className="row g-3">
                        <div className="col-12 col-md-4">
                          <label className="form-label">Grade</label>
                          <select className="form-select" value={newProjectionForm.grade} onChange={(e) => setNewProjectionForm(prev => ({ ...prev, grade: e.target.value }))}>
                            <option value="">Select Grade</option>
                            {grades.map(grade => <option key={grade} value={grade}>{grade}</option>)}
                          </select>
                        </div>
                        <div className="col-12 col-md-4">
                          <label className="form-label">Branch</label>
                          <select className="form-select" value={newProjectionForm.branch} onChange={(e) => setNewProjectionForm(prev => ({ ...prev, branch: e.target.value }))}>
                            <option value="">Select Branch</option>
                            {projectionBranchOptions.map(branch => <option key={branch} value={branch}>{branch}</option>)}
                          </select>
                        </div>
                        <div className="col-12 col-md-4">
                          <label className="form-label">Zone</label>
                          <select className="form-select" value={newProjectionForm.zone} onChange={(e) => setNewProjectionForm(prev => ({ ...prev, zone: e.target.value }))}>
                            <option value="">Select Zone</option>
                            {zones.map(zone => <option key={zone} value={zone}>{zone || 'All Zones'}</option>)}
                          </select>
                        </div>
                        <div className="col-12 col-md-4">
                          <label className="form-label">New Admissions</label>
                          <input type="number" className="form-control" value={newProjectionForm.new_admissions} onChange={(e) => setNewProjectionForm(prev => ({ ...prev, new_admissions: e.target.value }))} placeholder="Enter new admissions" />
                        </div>
                        <div className="col-12 col-md-4">
                          <label className="form-label">Existing Admissions</label>
                          <input type="number" className="form-control" value={newProjectionForm.existing_admissions} onChange={(e) => setNewProjectionForm(prev => ({ ...prev, existing_admissions: e.target.value }))} placeholder="Enter existing admissions" />
                        </div>
                        <div className="col-12 col-md-4">
                          <label className="form-label">Total Projection</label>
                          <input type="number" className="form-control" value={newProjectionForm.total_projection} onChange={(e) => setNewProjectionForm(prev => ({ ...prev, total_projection: e.target.value }))} placeholder="Enter total projection" />
                        </div>
                      </div>
                    </div>
                    <div className="modal-footer bg-light">
                      <button type="button" className="btn btn-danger" onClick={handleSaveNewProjection}>Save Projection</button>
                      <button type="button" className="btn btn-secondary" onClick={() => setShowAddProjectionModal(false)}>Cancel</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            </>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
