# MeetingVault - Application Architecture & Rebuild Guide

**Date**: 2026-01-07
**Version**: 1.0 (Alpha)

## 1. Project Overview
MeetingVault is a tool designed to ingest Zoom chat transcripts, extract valuable business intelligence (Contacts, Offers, Requests), and manage a shared directory. It features a multi-tenant architecture (Organizations) with distinct User and Admin portals.

---

## 2. Technology Stack

### Frontend
- **Framework**: React 18 (Vite)
- **Language**: TypeScript
- **Styling**: TailwindCSS (v3), clsx, tailwind-merge
- **Icons**: Lucide React
- **Routing**: React Router DOM v6
- **State/Auth**: Supabase JS Client + Custom Context (`UserContext`)

### Backend
- **Framework**: FastAPI (Python 3.10+)
- **Server**: Uvicorn
- **AI/LLM**: LangChain, LangGraph, OpenAI (via OpenRouter)
- **Database ORM**: Supabase Python Client (PostgREST wrapper)
- **Environment**: Pydantic Settings (`.env`)

### Database (Supabase / PostgreSQL)
- **Core**: PostgreSQL 15+
- **Auth**: Supabase Auth (GoTrue)
- **Storage**: Supabase Storage (for raw chat files)
- **Security**: Row Level Security (RLS) policies enforced layout-wide.

---

## 3. Database Schema

The database relies on a set of SQL migrations located in `backend/migrations/`.

### Core Tables
1.  **`organizations`**: Tenants.
    *   `id` (uuid), `name` (text).
    *   *Default*: 'Global Directory'.
2.  **`memberships`**: Links Users to Orgs.
    *   `user_id` (auth.users), `org_id`, `role` ('admin', 'user').
    *   **RLS**: Users can only see their own memberships.

### Data Tables
1.  **`contacts`**: Extracted people.
    *   `name`, `email`, `phone`, `org_id`, `is_archived` (soft delete).
2.  **`services`**: Extracted intents (Offers/Requests).
    *   `type` ('offer', 'request'), `description`, `contact_name`, `org_id`.
3.  **`meeting_chats`**: Raw upload records.
    *   `file_name`, `file_url`, `extracted_data` (JSONB cache), `upload_date`.
4.  **`contact_links`** (New): Stores URL links associated with contacts.
    *   `contact_id`, `url`, `label`.

### Admin & Audit (New)
1.  **`merge_audit_log`**: Tracks administrative merge actions.
    *   `primary_contact_id`, `merged_contact_ids` (Array), `performed_by`.
2.  **`change_requests`**: For users to suggest edits (Pending implementation).
3.  **`chat_permissions`**: Fine-grained access control for sensitive chats (New).

### Row Level Security (RLS)
*   **General Rule**: Users can SELECT data appearing in their `org_id`.
*   **Admins**: Can INSERT/UPDATE/DELETE data in their `org_id`.
*   **Enforcement**: Check `backend/migrations/001_shared_directory.sql`.

---

## 4. Backend Architecture

**Entry Point**: `app/main.py`
**Config**: `app/.env` (SUPABASE_URL, SERVICE_ROLE_KEY, OPENROUTER_API_KEY)

### Key API Routers (`app/api/`)
1.  **`upload.py`** (`/api/upload`):
    *   Accepts `.txt` files.
    *   Triggers background task `process_and_extract`.
2.  **`admin.py`** (`/api/admin`):
    *   `POST /scan-duplicates`: Detects duplicates by Email/Phone/Exact Name.
    *   `POST /merge-contacts`: Transactional merge (reassigns services, archives duplicates).
    *   `PATCH /contacts/{id}`: Manual edits.
3.  **`directory.py`** (`/api/directory`):
    *   Lists Contacts and Services for the User view.
4.  **`chats.py`**:
    *   Lists valid uploaded transcripts.

### AI Engine (`app/services/hybrid_extraction.py`)
A hybrid 3-pass system:
1.  **Regex Parsing**: Deterministically parses Zoom format `[Time] From X to Everyone: Msg`.
2.  **Hard Extraction**: Regex for Emails and Phone numbers (100% precision).
3.  **LLM Analysis** (Parallel):
    *   Chunks transcript (e.g., 200 msgs).
    *   Uses `ChatOpenAI` with structured Pydantic output (`IntentAnalysis`).
    *   Extracts "Offers" and "Requests" verbatim.
    *   Identifies "Noise" (Jokes, logistics).
4.  **Summary**: Generates a 3-5 sentence meeting summary.

---

## 5. Frontend Architecture

**Entry Point**: `src/App.tsx`
**Layouts**:
*   `AdminLayout`: Sidebar with Dashboard, Database, Chats, Links.
*   `UserLayout`: Sidebar with Offers, Requests, Contacts.

### Key Pages
1.  **`DatabaseEditor.tsx`** (`/admin/database`):
    *   **Scanner**: Calls `/scan-duplicates`. Visualizes confidence.
    *   **Manual Editor**: Search, Edit, and **Multi-select Merge**.
2.  **`ChatList.tsx`**:
    *   Uploads files.
    *   Shows processing status.
3.  **`ChatDetail.tsx`**:
    *   View transcript.
    *   View extracted Metadata (Contacts/Services).

### Components
*   **`Sidebar.tsx`**: Responsive navigation.
*   **`AssistantPanel.tsx`**: Right-side panel for future Chatbot integration.

---

## 6. Rebuild & Deployment Guide

To rebuild this app from source code:

### Prerequisites
1.  **Supabase Project**:
    *   Create a project.
    *   Run migrations in order `001` -> `005` in the SQL Editor.
    *   Get URL and ANON_KEY.
2.  **Python Environment**:
    *   `python -m venv venv`
    *   `pip install -r backend/requirements.txt`
3.  **Node Environment**:
    *   `npm install` (in frontend dir).

### Environment Variables
**Backend (`backend/.env`)**:
```bash
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" #(For admin overrides)
OPENROUTER_API_KEY="sk-..." #(For AI)
LLM_MODEL="openai/gpt-4o"
```

**Frontend (`frontend/.env`)**:
```bash
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"
VITE_API_BASE_URL="http://localhost:8000"
```

### Running the App
1.  **Backend**: `. venv/bin/activate && uvicorn app.main:app --reload`
2.  **Frontend**: `npm run dev`

---

## 7. Current Status
*   **Ingestion**: **Stable**. Handles multi-line Zoom messages.
*   **AI Extraction**: **Beta**. Good recall on Offers/Requests. Regex fallback for Phones/Emails is robust.
*   **Admin Tools**: **Stable**. Database Editor allows full manual control and heuristic-based simple merging.
*   **User UI**: **Stable**. Clean Tailwind design.

## 8. File Structure Snapshot
```
/backend
    /app
        /api (Routers)
        /services (Business Logic)
        /schemas.py (Pydantic Models)
        main.py
    /migrations (SQL)
    requirements.txt

/frontend
    /src
        /components (UI)
        /layouts (Admin/User)
        /pages (Views)
        /lib (Supabase client)
    package.json
```
