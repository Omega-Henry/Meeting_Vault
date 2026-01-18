
import asyncio
import os
import sys

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.api.upload import run_core_extraction_logic
from supabase import create_client
from app.core.config import settings

async def main():
    # Setup Client
    url = settings.SUPABASE_URL
    key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_ANON_KEY
    client = create_client(url, key)
    
    # 1. Find a chat with Heather inside (to test)
    print("Searching for chats...")
    # This resembles a search for "Heather" in the clean text or digest
    res = client.table("meeting_chats").select("*").ilike("cleaned_text", "%Heather Klix%").limit(1).execute()
    
    if not res.data:
        print("No chat found for Heather Klix. Trying generic reprocess of top 1.")
        res = client.table("meeting_chats").select("*").limit(1).execute()
        
    if not res.data:
        print("No chats at all.")
        return

    chat = res.data[0]
    print(f"Reprocessing Chat: {chat['id']} - {chat['meeting_name']}")
    
    try:
        await run_core_extraction_logic(client, chat['id'], chat['user_id'], chat['org_id'], chat['cleaned_text'])
        print("Success!")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
