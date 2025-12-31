# MeetingVault

MeetingVault is a production-ready web app for storing and analyzing meeting chats. It features secure multi-tenancy, deterministic data extraction, and an AI assistant powered by LangGraph.

## Architecture

- **Frontend**: React + Vite + TypeScript + Tailwind (served via Nginx)
- **Backend**: Python FastAPI
- **Database**: Supabase (Postgres)
- **AI Orchestration**: LangGraph + LangChain
- **Hosting**: Google Cloud Run (2 services)

### Multi-Tenancy & Security (RLS)

We use a single Supabase database with Row Level Security (RLS) to ensure strict data isolation.
- Every table has a `user_id` column referencing `auth.users(id)`.
- RLS policies enforce `auth.uid() = user_id` for all operations.
- This provides the security of separate databases without the operational overhead.

### Ingestion Flow

1. **Upload**: User uploads a `.txt` or `.md` transcript.
2. **Cleaning**: Text is cleaned and hashed (SHA256) to prevent duplicates.
3. **Extraction**:
    - **Contacts**: Emails and phones are extracted via regex.
    - **Services**: "Offers" and "Requests" are identified using keyword heuristics.
    - **Links**: URLs are normalized and stored.
4. **Storage**: Data is inserted into `meeting_chats`, `contacts`, `services`, and `contact_links`.

### AI Assistant (LangGraph)

The AI assistant is **Read-Only**. It uses LangGraph to plan and execute database queries to answer user questions.
- **Tools**: `list_chats`, `get_chat`, `search_contacts`, `list_services`, `search_everything`.
- **Flow**: Intent Router -> Planner (LLM) -> Executor -> Formatter.

## Local Development

### Prerequisites
- Docker & Docker Compose (optional)
- Supabase Project
- OpenAI API Key

### Setup

1. **Database**: Run the `schema.sql` in your Supabase SQL Editor.
2. **Environment Variables**:
   Copy `.env.example` to `.env` in `backend/` and `frontend/` (or set them in your environment).

   **Backend (.env)**:
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   # OpenRouter Configuration
   OPENROUTER_API_KEY=your_openrouter_key
   # Optional: Override model (default: openai/gpt-4o-mini)
   # LLM_MODEL=anthropic/claude-3-haiku
   ```

   **Frontend (.env)**:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_API_BASE_URL=http://localhost:8080
   ```

3. **Run Backend**:
   ```bash
   ./run_backend.sh
   ```

4. **Run Frontend**:
   ```bash
   ./run_frontend.sh
   ```
   
   *Note: I have set up a local Node.js environment in `frontend/node_bin` so you don't need to install it system-wide.*

## Deployment (Vercel via GitHub)

Since this is a monorepo (Frontend + Backend in one repo), you will create **two separate projects** in Vercel, both connected to the same GitHub repository.

### 1. Push to GitHub
Push this entire repository to a new GitHub repository.

### 2. Deploy Backend
1.  Go to Vercel Dashboard -> **Add New Project**.
2.  Import your GitHub Repository.
3.  **Configure Project**:
    *   **Project Name**: `meetingvault-backend` (or similar)
    *   **Root Directory**: Click `Edit` and select `backend`.
    *   **Framework Preset**: Vercel should auto-detect Python (or select Other).
    *   **Environment Variables**: Add:
        *   `SUPABASE_URL`
        *   `SUPABASE_ANON_KEY`
        *   `OPENROUTER_API_KEY`
4.  Click **Deploy**.

### 3. Deploy Frontend
1.  Go to Vercel Dashboard -> **Add New Project**.
2.  Import the **same** GitHub Repository.
3.  **Configure Project**:
    *   **Project Name**: `meetingvault-frontend` (or similar)
    *   **Root Directory**: Click `Edit` and select `frontend`.
    *   **Framework Preset**: Vite
    *   **Environment Variables**: Add:
        *   `VITE_SUPABASE_URL`
        *   `VITE_SUPABASE_ANON_KEY`
        *   `VITE_API_BASE_URL` -> Set this to the URL of your deployed backend (e.g., `https://meetingvault-backend.vercel.app`).
4.  Click **Deploy**.

### 4. Final Verification
Visit your Frontend URL. It should load and be able to communicate with the Backend.

## Deliverables

- [x] Full Repo (Frontend + Backend)
- [x] SQL Migrations (`schema.sql`)
- [x] Dockerfiles
- [x] LangGraph Agent
