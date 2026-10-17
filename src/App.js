import React, { useEffect, useState, useMemo, useCallback } from "react";
import axios from "axios";
import "./App.css";
import TaglineSection from "./TaglineSection";

// Configure API client with support for Vite, CRA, and production environments
const resolveApiBaseUrl = () => {
  // Vite env variable
  try {
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) {
      return import.meta.env.VITE_API_BASE_URL;
    }
  } catch (e) {
    // import.meta may not be available in non-ESM bundler
  }
  // Process env variables
  if (typeof process !== "undefined" && process.env) {
    if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
    if (process.env.VITE_API_BASE_URL) return process.env.VITE_API_BASE_URL;
  }
  return "http://localhost:8000";
};

const API_BASE_URL = resolveApiBaseUrl();

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Attach Authorization header if access token exists in storage
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("product_tracker_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function App() {
  // Authentication states
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authMode, setAuthMode] = useState("login"); // 'login' | 'register'
  const [authForm, setAuthForm] = useState({ email: "", password: "", confirmPassword: "" });
  const [authLoading, setAuthLoading] = useState(false);

  // Product states
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("all"); // 'all' | 'instock' | 'low' | 'out'
  const [sortField, setSortField] = useState("id");
  const [sortDirection, setSortDirection] = useState("asc");

  // Modals
  const [modalMode, setModalMode] = useState(null); // 'add' | 'edit' | 'view' | 'delete' | null
  const [activeProduct, setActiveProduct] = useState(null);
  const [productForm, setProductForm] = useState({
    id: "",
    name: "",
    description: "",
    price: "",
    quantity: "",
  });

  // Notifications
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  // Check current user session on load
  useEffect(() => {
    const verifyAuth = async () => {
      try {
        const res = await api.get("/auth/me");
        setUser(res.data);
      } catch (err) {
        sessionStorage.removeItem("product_tracker_token");
        setUser(null);
      } finally {
        setAuthChecking(false);
      }
    };
    verifyAuth();
  }, []);

  // Fetch user's products
  const fetchProducts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await api.get("/products");
      setProducts(res.data);
    } catch (err) {
      if (err.response?.status === 401) {
        setUser(null);
        sessionStorage.removeItem("product_tracker_token");
        addToast("Session expired. Please log in again.", "error");
      } else {
        addToast(err.response?.data?.detail || "Failed to load products", "error");
      }
    } finally {
      setLoading(false);
    }
  }, [user, addToast]);

  useEffect(() => {
    if (user) {
      fetchProducts();
    }
  }, [user, fetchProducts]);

  // Auth Handlers
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthLoading(true);

    if (authMode === "register") {
      if (authForm.password.length < 6) {
        addToast("Password must be at least 6 characters long", "error");
        setAuthLoading(false);
        return;
      }
      if (authForm.password !== authForm.confirmPassword) {
        addToast("Passwords do not match", "error");
        setAuthLoading(false);
        return;
      }
    }

    try {
      if (authMode === "login") {
        const res = await api.post("/auth/login", {
          email: authForm.email,
          password: authForm.password,
        });
        sessionStorage.setItem("product_tracker_token", res.data.access_token);
        setUser(res.data.user);
        addToast(`Welcome back, ${res.data.user.email}!`, "success");
      } else {
        const res = await api.post("/auth/register", {
          email: authForm.email,
          password: authForm.password,
        });
        sessionStorage.setItem("product_tracker_token", res.data.access_token);
        setUser(res.data.user);
        addToast("Account created successfully! Welcome to Product Tracker.", "success");
      }
      setAuthForm({ email: "", password: "", confirmPassword: "" });
    } catch (err) {
      const msg = err.response?.data?.detail || "Authentication failed. Please check your credentials.";
      addToast(msg, "error");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      // Ignore network errors on logout
    }
    sessionStorage.removeItem("product_tracker_token");
    setUser(null);
    setProducts([]);
    addToast("Logged out successfully.", "success");
  };

  // Sorting
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Filtered & Sorted Products
  const filteredProducts = useMemo(() => {
    let result = [...products];

    // Search query
    const q = filter.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (p) =>
          String(p.id).includes(q) ||
          p.name?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
      );
    }

    // Stock Filter
    if (stockFilter === "instock") {
      result = result.filter((p) => p.quantity > 5);
    } else if (stockFilter === "low") {
      result = result.filter((p) => p.quantity > 0 && p.quantity <= 5);
    } else if (stockFilter === "out") {
      result = result.filter((p) => p.quantity === 0);
    }

    // Sorting
    return result.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (sortField === "id" || sortField === "price" || sortField === "quantity") {
        aVal = Number(aVal || 0);
        bVal = Number(bVal || 0);
      } else {
        aVal = String(aVal || "").toLowerCase();
        bVal = String(bVal || "").toLowerCase();
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [products, filter, stockFilter, sortField, sortDirection]);

  // Statistics
  const stats = useMemo(() => {
    const totalCount = products.length;
    const totalUnits = products.reduce((acc, p) => acc + (Number(p.quantity) || 0), 0);
    const totalValuation = products.reduce(
      (acc, p) => acc + (Number(p.price) || 0) * (Number(p.quantity) || 0),
      0
    );
    const lowStockCount = products.filter((p) => (Number(p.quantity) || 0) <= 5).length;

    return { totalCount, totalUnits, totalValuation, lowStockCount };
  }, [products]);

  // Modal Handlers
  const openAddModal = () => {
    setProductForm({ id: "", name: "", description: "", price: "", quantity: "" });
    setModalMode("add");
  };

  const openEditModal = (p) => {
    setActiveProduct(p);
    setProductForm({
      id: p.id,
      name: p.name,
      description: p.description || "",
      price: p.price,
      quantity: p.quantity,
    });
    setModalMode("edit");
  };

  const openViewModal = (p) => {
    setActiveProduct(p);
    setModalMode("view");
  };

  const openDeleteModal = (p) => {
    setActiveProduct(p);
    setModalMode("delete");
  };

  const closeModal = () => {
    setModalMode(null);
    setActiveProduct(null);
  };

  // Product CRUD
  const handleProductSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      name: productForm.name.trim(),
      description: productForm.description.trim(),
      price: parseFloat(productForm.price),
      quantity: parseInt(productForm.quantity, 10),
    };

    if (isNaN(payload.price) || payload.price < 0) {
      addToast("Please enter a valid non-negative price", "error");
      setLoading(false);
      return;
    }
    if (isNaN(payload.quantity) || payload.quantity < 0) {
      addToast("Please enter a valid non-negative quantity", "error");
      setLoading(false);
      return;
    }

    try {
      if (modalMode === "add") {
        if (productForm.id && Number(productForm.id) > 0) {
          payload.id = Number(productForm.id);
        }
        await api.post("/products", payload);
        addToast("Product added successfully!");
      } else if (modalMode === "edit" && activeProduct) {
        await api.put(`/products/${activeProduct.id}`, payload);
        addToast("Product updated successfully!");
      }
      closeModal();
      fetchProducts();
    } catch (err) {
      addToast(err.response?.data?.detail || "Operation failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!activeProduct) return;
    setLoading(true);
    try {
      await api.delete(`/products/${activeProduct.id}`);
      addToast(`Product #${activeProduct.id} deleted successfully!`);
      closeModal();
      fetchProducts();
    } catch (err) {
      addToast(err.response?.data?.detail || "Failed to delete product", "error");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
  };

  // ---------------- Render Loading Screen ----------------
  if (authChecking) {
    return (
      <div className="loader-container" style={{ minHeight: "100vh" }}>
        <div className="spinner"></div>
        <p>Loading Product Tracker...</p>
      </div>
    );
  }

  // ---------------- Render Unauthenticated Auth Screen ----------------
  if (!user) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="brand-icon">📦</div>
            <h1>Product Tracker</h1>
            <p>Secure, user-isolated inventory management</p>
          </div>

          <div className="auth-tabs" role="tablist">
            <button
              className={`auth-tab ${authMode === "login" ? "active" : ""}`}
              onClick={() => setAuthMode("login")}
              type="button"
            >
              Sign In
            </button>
            <button
              className={`auth-tab ${authMode === "register" ? "active" : ""}`}
              onClick={() => setAuthMode("register")}
              type="button"
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleAuthSubmit}>
            <div className="form-group">
              <label htmlFor="auth-email">Email Address</label>
              <input
                id="auth-email"
                type="email"
                placeholder="name@example.com"
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                type="password"
                placeholder={authMode === "register" ? "At least 6 characters" : "Enter your password"}
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                required
                autoComplete={authMode === "register" ? "new-password" : "current-password"}
              />
            </div>

            {authMode === "register" && (
              <div className="form-group">
                <label htmlFor="auth-confirm">Confirm Password</label>
                <input
                  id="auth-confirm"
                  type="password"
                  placeholder="Repeat your password"
                  value={authForm.confirmPassword}
                  onChange={(e) => setAuthForm({ ...authForm, confirmPassword: e.target.value })}
                  required
                  autoComplete="new-password"
                />
              </div>
            )}

            <button
              className="btn btn-primary"
              style={{ width: "100%", marginTop: "12px", padding: "12px" }}
              type="submit"
              disabled={authLoading}
            >
              {authLoading ? "Processing..." : authMode === "login" ? "Sign In" : "Register Account"}
            </button>
          </form>
        </div>

        {/* Toast Alerts */}
        <div className="toast-container">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.type}`}>
              <span>{t.type === "success" ? "✓" : "⚠"}</span>
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------------- Render Main Dashboard ----------------
  return (
    <div className="app-container">
      {/* Header / Top Navigation */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">📦</div>
          <h1>Product Tracker</h1>
          <span className="brand-badge">PRO</span>
        </div>

        <div className="top-actions">
          <div className="user-pill" title={user.email}>
            <div className="user-avatar">{user.email.charAt(0).toUpperCase()}</div>
            <span className="user-email">{user.email}</span>
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={fetchProducts}
            disabled={loading}
            title="Refresh product list"
          >
            ↻ Refresh
          </button>

          <button
            className="btn btn-outline btn-sm"
            onClick={handleLogout}
            title="Log out from Product Tracker"
          >
            Log Out
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="main-content">
        {/* Welcome Section */}
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Welcome back, {user.email.split("@")[0]}!</h2>
            <p>Manage, track, and optimize your product inventory with user-isolated security.</p>
          </div>
          <button className="btn btn-primary" onClick={openAddModal}>
            + Add Product
          </button>
        </div>

        {/* Statistics Grid */}
        <section className="stats-grid" aria-label="Inventory Overview">
          <div className="stat-card">
            <div className="stat-icon terracotta">📊</div>
            <div className="stat-details">
              <span className="stat-label">Total Products</span>
              <span className="stat-value">{stats.totalCount}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon blue">📦</div>
            <div className="stat-details">
              <span className="stat-label">Stock Units</span>
              <span className="stat-value">{stats.totalUnits.toLocaleString()}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon green">💰</div>
            <div className="stat-details">
              <span className="stat-label">Total Valuation</span>
              <span className="stat-value">{formatCurrency(stats.totalValuation)}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon amber">⚠</div>
            <div className="stat-details">
              <span className="stat-label">Low Stock (≤5)</span>
              <span className="stat-value">{stats.lowStockCount}</span>
            </div>
          </div>
        </section>

        {/* Tagline Feature Section */}
        <div style={{ marginBottom: "24px" }}>
          <TaglineSection />
        </div>

        {/* Product Table Card */}
        <div className="card">
          <div className="card-header">
            <h2>Inventory Items</h2>
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Showing {filteredProducts.length} of {products.length} items
            </span>
          </div>

          {/* Search & Stock Filter Toolbar */}
          <div className="controls-bar">
            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search by ID, product name, or description..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="Search products"
              />
            </div>

            <div className="filter-pills" role="group" aria-label="Filter products by stock status">
              <button
                className={`pill-btn ${stockFilter === "all" ? "active" : ""}`}
                onClick={() => setStockFilter("all")}
              >
                All ({products.length})
              </button>
              <button
                className={`pill-btn ${stockFilter === "instock" ? "active" : ""}`}
                onClick={() => setStockFilter("instock")}
              >
                In Stock (&gt;5)
              </button>
              <button
                className={`pill-btn ${stockFilter === "low" ? "active" : ""}`}
                onClick={() => setStockFilter("low")}
              >
                Low Stock (1-5)
              </button>
              <button
                className={`pill-btn ${stockFilter === "out" ? "active" : ""}`}
                onClick={() => setStockFilter("out")}
              >
                Out of Stock (0)
              </button>
            </div>
          </div>

          {/* Table or Empty State */}
          {loading && products.length === 0 ? (
            <div className="loader-container">
              <div className="spinner"></div>
              <p>Fetching your inventory...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <h3>No products found</h3>
              <p>
                {products.length === 0
                  ? "You have no products tracked yet. Add your first product to begin!"
                  : "No products matched your search or filter criteria."}
              </p>
              {products.length === 0 && (
                <button className="btn btn-primary" onClick={openAddModal}>
                  + Add Your First Product
                </button>
              )}
            </div>
          ) : (
            <div className="table-container">
              <table className="product-table" aria-label="Product list">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => handleSort("id")}>
                      ID {sortField === "id" && <span className="sort-arrow">{sortDirection === "asc" ? "▲" : "▼"}</span>}
                    </th>
                    <th className="sortable" onClick={() => handleSort("name")}>
                      Name {sortField === "name" && <span className="sort-arrow">{sortDirection === "asc" ? "▲" : "▼"}</span>}
                    </th>
                    <th>Description</th>
                    <th className="sortable" onClick={() => handleSort("price")}>
                      Price {sortField === "price" && <span className="sort-arrow">{sortDirection === "asc" ? "▲" : "▼"}</span>}
                    </th>
                    <th className="sortable" onClick={() => handleSort("quantity")}>
                      Quantity {sortField === "quantity" && <span className="sort-arrow">{sortDirection === "asc" ? "▲" : "▼"}</span>}
                    </th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => {
                    const isLow = p.quantity > 0 && p.quantity <= 5;
                    const isOut = p.quantity === 0;
                    return (
                      <tr key={p.id}>
                        <td>#{p.id}</td>
                        <td className="name-cell">{p.name}</td>
                        <td className="desc-cell" title={p.description}>
                          {p.description || "—"}
                        </td>
                        <td className="price-cell">{formatCurrency(p.price)}</td>
                        <td>{p.quantity}</td>
                        <td>
                          {isOut ? (
                            <span className="badge-stock badge-out-of-stock">Out of Stock</span>
                          ) : isLow ? (
                            <span className="badge-stock badge-low-stock">Low Stock</span>
                          ) : (
                            <span className="badge-stock badge-in-stock">In Stock</span>
                          )}
                        </td>
                        <td>
                          <div className="actions-cell">
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => openViewModal(p)}
                              title="View product details"
                            >
                              Details
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => openEditModal(p)}
                              title="Edit product"
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => openDeleteModal(p)}
                              title="Delete product"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ================= MODALS ================= */}

      {/* Add / Edit Product Modal */}
      {(modalMode === "add" || modalMode === "edit") && (
        <div className="modal-overlay" onClick={closeModal} role="dialog" aria-modal="true">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modalMode === "add" ? "Add New Product" : `Edit Product #${activeProduct?.id}`}</h3>
              <button className="btn-close" onClick={closeModal} aria-label="Close dialog">
                ✕
              </button>
            </div>

            <form onSubmit={handleProductSubmit}>
              {modalMode === "add" && (
                <div className="form-group">
                  <label htmlFor="prod-id">Product ID (Optional custom integer ID)</label>
                  <input
                    id="prod-id"
                    type="number"
                    placeholder="Auto-generated if left blank"
                    value={productForm.id}
                    onChange={(e) => setProductForm({ ...productForm, id: e.target.value })}
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="prod-name">Product Name *</label>
                <input
                  id="prod-name"
                  type="text"
                  placeholder="e.g. Ergonomic Office Chair"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="prod-desc">Description</label>
                <textarea
                  id="prod-desc"
                  rows={3}
                  placeholder="Product specifications, notes, or details..."
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div className="form-group">
                  <label htmlFor="prod-price">Price ($) *</label>
                  <input
                    id="prod-price"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={productForm.price}
                    onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="prod-qty">Quantity in Stock *</label>
                  <input
                    id="prod-qty"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={productForm.quantity}
                    onChange={(e) => setProductForm({ ...productForm, quantity: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button className="btn btn-secondary" type="button" onClick={closeModal} disabled={loading}>
                  Cancel
                </button>
                <button className="btn btn-primary" type="submit" disabled={loading}>
                  {loading ? "Saving..." : modalMode === "add" ? "Create Product" : "Update Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Product Details Modal */}
      {modalMode === "view" && activeProduct && (
        <div className="modal-overlay" onClick={closeModal} role="dialog" aria-modal="true">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Product Details</h3>
              <button className="btn-close" onClick={closeModal} aria-label="Close dialog">
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Product ID
                </span>
                <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>#{activeProduct.id}</div>
              </div>

              <div>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Product Name
                </span>
                <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--terracotta-primary)" }}>
                  {activeProduct.name}
                </div>
              </div>

              <div>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Description
                </span>
                <div style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {activeProduct.description || "No description provided."}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "var(--bg-subtle)", padding: "14px", borderRadius: "var(--radius-md)" }}>
                <div>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Unit Price</span>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{formatCurrency(activeProduct.price)}</div>
                </div>
                <div>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Quantity Available</span>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{activeProduct.quantity} units</div>
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Total Stock Value</span>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--success-color)" }}>
                    {formatCurrency(activeProduct.price * activeProduct.quantity)}
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => openEditModal(activeProduct)}
              >
                Edit Product
              </button>
              <button className="btn btn-primary" onClick={closeModal}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {modalMode === "delete" && activeProduct && (
        <div className="modal-overlay" onClick={closeModal} role="dialog" aria-modal="true">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ color: "var(--danger-color)" }}>Confirm Product Deletion</h3>
              <button className="btn-close" onClick={closeModal} aria-label="Close dialog">
                ✕
              </button>
            </div>

            <p style={{ color: "var(--text-secondary)", lineHeight: 1.5, margin: "0 0 20px 0" }}>
              Are you sure you want to permanently delete product <strong>"{activeProduct.name}"</strong> (ID: #{activeProduct.id})? This action cannot be undone.
            </p>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={closeModal} disabled={loading}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDelete} disabled={loading}>
                {loading ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Alert Feedback */}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span>{t.type === "success" ? "✓" : "⚠"}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
