# Zoom Digester - Meeting Intelligence Platform

Production-ready FastAPI + React application for extracting, organizing, and discovering business intelligence from Zoom chat transcripts.

## Features

- 📊 **Smart Extraction**: AI-powered extraction of contacts, offers, and requests from Zoom chats
- 👥 **Contact Management**: Unified directory with profile enrichment and duplicate detection
- 🔍 **Intelligent Search**: Natural language AI assistant for querying your meeting data
- 🔐 **Multi-tenant**: Organization-based access with role-based permissions
- 📈 **Admin Tools**: Profile scanning, duplicate merging, bulk reprocessing

## Tech Stack

**Backend**:
- FastAPI + Python 3.12
- Supabase (PostgreSQL + Auth + Storage)
- LangGraph for AI workflows
- OpenAI GPT-4 for extraction & chat

**Frontend**:
- React + TypeScript
- TanStack Query for state management
- Tailwind CSS for styling

## Quick Start

### Backend Setup

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Set environment variables
cp .env.example .env
# Edit .env with your credentials

# Run server
python -m uvicorn app.main:app --reload
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Set environment variables
cp .env.example .env
# Edit .env with your API URL

# Run development server
npm run dev
```

## Database Setup

The database schema is defined in `schema.sql`. To set up:

1. Create a Supabase project
2. Run `schema.sql` in the SQL Editor
3. Apply migrations in `/backend/migrations/` (if any pending)

### Required Migrations

Run these in Supabase SQL Editor **in order**:

| Migration | Description |
|-----------|-------------|
| `007_ai_chat_history.sql` | AI conversation persistence |
| `008_performance_indexes.sql` | Database performance optimization |
| `009_fix_rls_policies.sql` | Org-based access control |
| `010_add_profile_columns.sql` | Rich profile columns (required for profile scan) |


## Key Improvements (Jan 2026)

Recent production-ready enhancements:

- ✅ **10x faster profile enrichment** (parallel processing with asyncio)
- ✅ **Contact name cleaning** (removes phone numbers/tags to prevent duplicates)
- ✅ **Fuzzy duplicate detection** (80%+ similarity matching with rapidfuzz)
- ✅ **Structured logging** (JSON output for production monitoring)
- ✅ **Health checks** (`/health`, `/readiness` endpoints)
- ✅ **Performance indexes** (GIN indexes for arrays, full-text search)
- ✅ **Org-based RLS policies** (members read all, role-based write)
- ✅ **AI chat history** (persistent conversation context)

## Scripts

Utility scripts in `/scripts/`:

- `cleanup_contact_names.py` - Clean existing contact names (one-time)
- `check_orphans.py` - Find orphaned database records
- `cleanup_orphans.py` - Remove orphaned records
- `reprocess_cli.py` - Re-extract data from chats

## API Documentation

Once running, visit:
- API docs: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

## Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## License

Proprietary - All rights reserved
