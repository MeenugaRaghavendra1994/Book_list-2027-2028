# School Book ERP System (2027-2028)

A full-stack application for managing book kits and individual book inventories, integrated with Supabase for cloud data storage.

## Features
- **User Management:** Admin and User roles with granular rights.
- **Kit Management:** Create, edit, and view kits with bulk upload support.
- **Inventory:** Manage individual books within kits.
- **Bulk Operations:** Import and export data via CSV/Excel.
- **Supabase Integration:** Uses Supabase SDK for reliable data fetching via Port 443.

## Project Structure
- `nbackend/`: Node.js Express server.
- `newfrontend/`: React-based dashboard.

## Installation

### 1. Backend
```bash
cd nbackend
npm install
node server.js
```

### 2. Frontend
```bash
cd newfrontend
npm install
npm start
```