#!/bin/bash

# Navigate to the backend directory
cd "$(dirname "$0")/backend"

# Check if venv exists
if [ -d "venv" ]; then
    echo "Activating virtual environment..."
    source venv/bin/activate
else
    echo "Error: Virtual environment not found at backend/venv"
    echo "Please create it with: python3 -m venv venv"
    exit 1
fi

# Ensure dependencies are installed (optional but good for "rapid modifications")
echo "Installing/Updating dependencies..."
pip install -r requirements.txt

# Run the FastAPI server with auto-reload
echo "Starting Backend Server..."
# Using --host 0.0.0.0 to allow access from local network if needed, or defaults to 127.0.0.1
uvicorn app.main:app --reload --port 8000
