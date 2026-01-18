
import asyncio
import os
import sys

sys.path.append(os.path.join(os.getcwd(), 'backend'))

from supabase import create_client
from app.core.config import settings

async def main():
    url = settings.SUPABASE_URL
    key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_ANON_KEY
    client = create_client(url, key)
    
    print("Fetching contacts with service counts...")
    # Fetch contacts with services
    res = client.table("contacts").select("id, name, services(id)").execute()
    
    contacts_to_delete = []
    
    for c in res.data:
        s_count = len(c.get('services', []))
        if s_count == 0:
            contacts_to_delete.append(c['id'])
            
    count = len(contacts_to_delete)
    print(f"Found {count} orphan contacts (0 services).")
    
    if count > 0:
        print("Deleting...")
        # Delete in batches of 50 to avoid URL length limits if using GET (though DELETE usually fine, batching is safer)
        batch_size = 50
        for i in range(0, count, batch_size):
            batch = contacts_to_delete[i:i+batch_size]
            client.table("contacts").delete().in_("id", batch).execute()
            print(f"Deleted batch {i}-{i+len(batch)}")
            
        print("Cleanup complete.")
    else:
        print("Nothing to delete.")

if __name__ == "__main__":
    asyncio.run(main())
