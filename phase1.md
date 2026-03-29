# System Architect & Backend Implementation: Hospital Inventory App

**Context:**
I am building a local, offline hospital inventory management application using Tauri, Rust, and React. 

**Your Role:**
You are responsible strictly for the Data Layer and the Rust Backend. You must ensure absolute data integrity, particularly focusing on atomic transactions to prevent race conditions in a critical healthcare environment.

Please complete the following implementation tasks:

## 1. Data Migration Script
Analyze the attached `器械清單 .xlsm` file. Write a robust, one-time execution script (using Python and `pandas`, or Node.js) that reads the "庫存" (Inventory) and "資料庫" (Transaction) sheets, and maps them into an optimized SQLite database (`inventory.db`).

## 2. SQLite Schema Design
Provide the SQL `CREATE TABLE` statements for the SQLite database. The schema must include:
* `categories` 
* `staff` (must include an `is_active` boolean)
* `instruments` (must include current stock, category FK, and `is_active` boolean)
* `transactions` (immutable ledger of all movements)
* `loans` (tracking borrowed vs. returned status)

## 3. Tauri Rust Backend implementation
Write the Rust code using `rusqlite` for the Tauri backend. I need the following `#[tauri::command]` functions:
* **CRUD Operations:** Staff and Instrument management (using soft deletes/deactivation).
* **Atomic Transactions (CRITICAL):** Write the `issue_loan` and `return_loan` functions. You MUST use SQLite atomic transactions (`BEGIN TRANSACTION`) to ensure that if the app crashes mid-write, we do not end up with negative stock or corrupted logs.
* **Export:** A function to query the database and generate a CSV export to the local filesystem.

Please output the code with clear inline documentation so my frontend agent can easily read your API contracts.