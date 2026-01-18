import asyncio
import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

# Manually load if not expecting .env in CWD
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

if not url or not key:
    print("Missing SUPABASE_URL or Key")
    # Try to import from app settings
    try:
        from app.core.config import settings
        url = settings.SUPABASE_URL
        key = settings.SUPABASE_SERVICE_KEY or settings.SUPABASE_ANON_KEY
        print("Loaded from app settings")
    except ImportError:
        print("Could not load settings")
        exit(1)

print(f"Connecting to {url}")
client = create_client(url, key)

def check_stuck_chats():
    print("Checking for STUCK chats...")
    # Fetch all chats (limit 50)
    res = client.table("meeting_chats").select("*").order("created_at", desc=True).limit(50).execute()
    
    stuck_count = 0
    if res.data:
        for chat in res.data:
            summary = chat.get('digest_bullets', {}).get('summary')
            if summary == 'Processing...':
                print(f"[STUCK] ID: {chat['id']} | Name: {chat['meeting_name']} | Created: {chat['created_at']}")
                stuck_count += 1
            else:
                 pass # print(f"[DONE] {chat['meeting_name']}: {summary[:20]}...")

    print(f"Total Stuck Chats: {stuck_count}")

if __name__ == "__main__":
    check_stuck_chats()
