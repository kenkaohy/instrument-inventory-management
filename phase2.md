# UI/UX Engineer & Frontend Implementation: Hospital Inventory App

**Context:**
We are building a local, offline hospital inventory management application using Tauri, Rust, and React. The backend API contracts and SQLite database have already been established.

**Your Role:**
You are the Frontend Architect operating within Google Antigravity. Your goal is to build a responsive, highly functional React interface tailored for hospital staff. 

Please complete the following frontend implementation tasks:

## 1. UI Scaffold & Layout
Set up the React application structure. The interface MUST be in Traditional Chinese. Create a main navigation layout supporting the following views:
* 庫存總覽 (Inventory Grid)
* 出入庫/借還管理 (Check-in / Check-out)
* 人員管理 (Staff Management)
* 報表匯出 (CSV Export)

## 2. Component Implementation
Write the React code for the following core components (using Tailwind CSS for styling):
* **Inventory Data Grid:** A sortable, filterable table displaying instruments, their categories, and current stock. Include a visual indicator (e.g., red text/background) for items with zero or low stock.
* **Transaction Form:** A form for issuing/returning instruments that allows selecting a Staff member and an Instrument. 

## 3. IPC Integration
Implement the data fetching and mutation logic using Tauri's `@tauri-apps/api/invoke`. Map the UI actions directly to the provided Rust backend commands.

## 4. Visual Verification
Use your browser actuation capabilities to compile the frontend and generate a visual Artifact (screenshot or layout rendering) of the "庫存總覽" (Inventory Grid) so I can verify the layout and Chinese text rendering.

**Backend API Contracts to Integrate:**
[PASTE CLAUDE'S RUST FUNCTION SIGNATURES HERE]