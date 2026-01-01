#!/bin/bash

# Navigate to the frontend directory
cd "$(dirname "$0")/frontend"

# Add local node_bin to PATH
export PATH="$(pwd)/node_bin/bin:$PATH"

# Run the development server
echo "Starting Frontend Server..."
npm run dev
