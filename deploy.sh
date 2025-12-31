#!/bin/bash

# Exit on error
set -e

# Configuration
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
BACKEND_SERVICE_NAME="meetingvault-backend"
FRONTEND_SERVICE_NAME="meetingvault-frontend"

if [ -z "$PROJECT_ID" ]; then
    echo "Error: No Google Cloud Project selected. Please run 'gcloud config set project <PROJECT_ID>'."
    exit 1
fi

echo "Deploying to Google Cloud Project: $PROJECT_ID"

# 1. Deploy Backend
echo "=========================================="
echo "Building and Deploying Backend..."
echo "=========================================="

gcloud builds submit --tag gcr.io/$PROJECT_ID/$BACKEND_SERVICE_NAME backend

gcloud run deploy $BACKEND_SERVICE_NAME \
    --image gcr.io/$PROJECT_ID/$BACKEND_SERVICE_NAME \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --set-env-vars SUPABASE_URL="$SUPABASE_URL",SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY",OPENROUTER_API_KEY="$OPENROUTER_API_KEY",LLM_MODEL="$LLM_MODEL"

# Get Backend URL
BACKEND_URL=$(gcloud run services describe $BACKEND_SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)')
echo "Backend deployed at: $BACKEND_URL"

# 2. Deploy Frontend
echo "=========================================="
echo "Building and Deploying Frontend..."
echo "=========================================="

# We need to pass the Backend URL as a build argument or env var to the frontend build
# For Vite, we can use --build-arg in Cloud Build if we modify the Dockerfile, 
# or we can create a temporary .env.production file.

echo "VITE_SUPABASE_URL=$SUPABASE_URL" > frontend/.env.production
echo "VITE_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY" >> frontend/.env.production
echo "VITE_API_BASE_URL=$BACKEND_URL" >> frontend/.env.production

gcloud builds submit --tag gcr.io/$PROJECT_ID/$FRONTEND_SERVICE_NAME frontend

gcloud run deploy $FRONTEND_SERVICE_NAME \
    --image gcr.io/$PROJECT_ID/$FRONTEND_SERVICE_NAME \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated

# Get Frontend URL
FRONTEND_URL=$(gcloud run services describe $FRONTEND_SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)')

echo "=========================================="
echo "Deployment Complete!"
echo "Frontend: $FRONTEND_URL"
echo "Backend: $BACKEND_URL"
echo "=========================================="
