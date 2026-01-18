"""
Contact Name Cleanup Script

One-time script to clean existing contact names in the database.
Removes phone numbers and role tags from contact names to reduce duplicates.
"""
import sys
import os
import re
from typing import List, Dict

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from app.dependencies import get_service_role_client
from app.services.hybrid_extraction import clean_sender_name

def clean_existing_contacts(dry_run: bool = True) -> Dict[str, int]:
    """
    Clean names of existing contacts in the database.
    
    Args:
        dry_run: If True, only show what would be changed without modifying data
    
    Returns:
        Dictionary with statistics
    """
    client = get_service_role_client()
    
    # Fetch all contacts
    print("Fetching all contacts...")
    result = client.table("contacts").select("id, name").execute()
    contacts = result.data or []
    
    print(f"Found {len(contacts)} contacts")
    
    stats = {
        "total": len(contacts),
        "cleaned": 0,
        "unchanged": 0,
        "errors": 0
    }
    
    changes: List[Dict] = []
    
    for contact in contacts:
        contact_id = contact["id"]
        original_name = contact["name"]
        cleaned_name = clean_sender_name(original_name)
        
        if cleaned_name != original_name:
            stats["cleaned"] += 1
            changes.append({
                "id": contact_id,
                "original": original_name,
                "cleaned": cleaned_name
            })
            
            if dry_run:
                print(f"  WOULD CHANGE: '{original_name}' → '{cleaned_name}'")
            else:
                try:
                    client.table("contacts").update({"name": cleaned_name}).eq("id", contact_id).execute()
                    print(f"  ✓ CHANGED: '{original_name}' → '{cleaned_name}'")
                except Exception as e:
                    print(f"  ✗ ERROR updating {contact_id}: {e}")
                    stats["errors"] += 1
        else:
            stats["unchanged"] += 1
    
    print(f"\n{'=' * 60}")
    print(f"Summary ({'DRY RUN' if dry_run else 'LIVE RUN'})")
    print(f"{'=' * 60}")
    print(f"Total contacts: {stats['total']}")
    print(f"Names cleaned: {stats['cleaned']}")
    print(f"Unchanged: {stats['unchanged']}")
    print(f"Errors: {stats['errors']}")
    
    if dry_run and stats['cleaned'] > 0:
        print(f"\nRun with --apply to make changes")
    
    return stats

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Clean contact names in database")
    parser.add_argument("--apply", action="store_true", help="Actually apply changes (default is dry-run)")
    args = parser.parse_args()
    
    dry_run = not args.apply
    
    if not dry_run:
        confirm = input("⚠️  This will modify contact names in the database. Continue? (yes/no): ")
        if confirm.lower() != "yes":
            print("Aborted.")
            sys.exit(0)
    
    clean_existing_contacts(dry_run=dry_run)
