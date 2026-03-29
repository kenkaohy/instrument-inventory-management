# System Design Request: Offline Hospital Inventory Management App

**Context:**
I have attached a hospital inventory management Excel file (`器械清單 .xlsm`). I am planning to build a lightweight, offline local desktop application for inventory management. 

Instead of using the Excel file as the active data store, I want to use a lightweight, embedded database like **SQLite**. The provided Excel file should be used to determine the data schema and to seed the initial database. Additionally, the application must be able to **export data to a CSV file**.

Please provide a comprehensive system design plan that includes the following sections:

## 1. Schema Design & Data Migration
* **Schema Extraction:** Analyze the attached `.xlsm` file to identify the main worksheets, column headers, and data types. 
* **Database Mapping:** Map this extracted data into an optimized SQLite relational database schema (including tables, primary/foreign keys, and column types).
* **Migration Strategy:** Outline a data ingestion strategy (e.g., a one-time Python or Node.js script using `pandas` or `SheetJS`) to parse the `.xlsm` file and populate the initial SQLite database.

## 2. Tech Stack Selection
* **Recommendations:** Recommend the most efficient tech stack for a lightweight offline desktop app paired with SQLite. 
* **Evaluation:** Evaluate and compare options such as:
  * Python-based frameworks (e.g., Pywebview + FastAPI + SQLAlchemy, PyQt, CustomTkinter)
  * Modern web wrappers (e.g., Tauri or Electron with `sqlite3` or `better-sqlite3`)

## 3. Architecture & Data Flow
* **CRUD Operations:** Detail how the application will execute Create, Read, Update, and Delete operations safely and efficiently on the local SQLite database.
* **CSV Export:** Design the data flow for the CSV Export feature, explaining how the application will query the database and generate the CSV file for the user to download or save locally.

## 4. UI/UX Layout
* **Interface Structure:** Propose a user interface structure specifically tailored for hospital inventory management. 
* **Key Features:** Include essential features such as:
  * Search and filtering capabilities
  * Low-stock alerts
  * Data entry forms for new items or updates
  * Data grid tables for viewing inventory
  * A clear, accessible "Export to CSV" mechanism

## 5. Implementation Roadmap
* Provide a step-by-step guide to developing the Minimum Viable Product (MVP). 
* Start from database initialization, move through backend/frontend development, and finish with compiling the standalone executable.