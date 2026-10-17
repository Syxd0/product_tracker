# Product Tracker 📦

A full-stack, multi-tenant inventory and product tracking application built with **React**, **FastAPI**, **PostgreSQL**, and **SQLAlchemy**.

---

## ✨ Features

- **Warm, Modern UI**: Designed with a warm ivory cream palette, earthy terracotta accents, rounded cards, and responsive layout.
- **Real-Time Authentication**: Secure registration, login, logout, and token expiration using **Argon2** password hashing (via `pwdlib`) and signed **JWT** tokens.
- **User-Isolated Product CRUD**: Multi-tenant database architecture where every product strictly belongs to its authenticated owner. Cross-user data access is blocked at the database level.
- **Inventory Analytics Dashboard**: Real-time stats calculating total products, in-stock units, total inventory valuation ($), and low-stock alerts.
- **Live Search & Filtering**: Instant client-side search across ID, name, and description, with quick status filters (All, In Stock, Low Stock, Out of Stock) and column sorting.
- **Product Modals**: Add product, edit product, view detailed specifications, and delete with safety confirmation.
- **Safe Migrations**: Non-destructive schema updates preserving existing records.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, Axios, Custom Vanilla CSS Design System (Warm Ivory & Terracotta).
- **Backend**: FastAPI, Pydantic v2, Uvicorn, Python-dotenv.
- **Database & ORM**: PostgreSQL, SQLAlchemy 2.0.
- **Security**: `pwdlib[argon2]` password hashing, `pyjwt` signed tokens, HttpOnly cookies & Bearer headers, CORS protection.
- **Testing**: `pytest`, `httpx`, `TestClient`.
- **Deployment**: Vercel (Frontend), FastAPI-compatible ASGI host (Render, Railway, Fly.io, etc.).

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Description | Default / Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection URL | `postgresql+psycopg2://user:pass@host/db?sslmode=require` |
| `SECRET_KEY` | JWT signing secret | Secure random string (32+ chars) |
| `ALGORITHM` | JWT algorithm | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token expiration duration | `1440` (24 hours) |
| `ENVIRONMENT` | Environment mode | `development` or `production` |
| `ALLOWED_ORIGINS` | Permitted frontend CORS origins | `http://localhost:3000,https://your-app.vercel.app` |
| `ALLOW_ORIGIN_REGEX` | Permitted origins regex | `https://.*\.vercel\.app` |
| `REACT_APP_API_URL` / `VITE_API_BASE_URL` | Frontend API Base URL | `http://localhost:8000` |

---

## 🚀 Getting Started

### 1. Backend Setup

```bash
# Activate your python virtual environment
# Windows:
.\myenv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run safe database migration
python migrate_db.py

# Start the FastAPI backend
uvicorn main:app --reload --port 8000
```

Backend will be accessible at: `http://localhost:8000` (API docs at `http://localhost:8000/docs`).

### 2. Frontend Setup

```bash
# Install Node dependencies
npm install

# Start the development server
npm start
```

Frontend will run at: `http://localhost:3000`.

---

## 🧪 Testing

Run automated tests covering authentication, authorization, user-isolated product CRUD, and cross-user security isolation:

```bash
pytest -v test_backend.py
```

Run frontend production build verification:

```bash
npm run build
```

---

## 🚢 Deployment

### Frontend (Vercel)
1. Connect the GitHub repository to Vercel.
2. In Vercel Project Settings:
   - Framework Preset: **Create React App**
   - Output Directory: `build`
   - Add Environment Variable: `REACT_APP_API_URL` pointing to your deployed backend URL.

### Backend (Render / Railway / AWS / VPS)
1. Deploy `main.py` using command:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
2. Set `DATABASE_URL`, `SECRET_KEY`, `ENVIRONMENT=production`, and `ALLOWED_ORIGINS` in your hosting dashboard.