# Utility Scripts

This directory contains utility scripts for maintenance and testing.

## Available Scripts

### `cleanup_contact_names.py`
**Purpose**: One-time script to clean existing contact names in the database.

**What it does**:
- Removes phone numbers from contact names
- Removes role tags (TC, TTTC, etc.)
- Removes emojis and state codes
- Fixes names like "Micah Wylie TC 3852082523" → "Micah Wylie"

**Usage**:
```bash
# Dry run (shows what would change)
python scripts/cleanup_contact_names.py

# Actually apply changes
python scripts/cleanup_contact_names.py --apply
```

**When to run**: After deploying the contact name cleaning feature, run this once to clean existing data.

---

### `test_enrich.py`
**Purpose**: Test script for profile enrichment from services.

**Usage**:
```bash
python scripts/test_enrich.py
```

**When to use**: For testing the LLM profile enrichment logic locally.

---

### `check_orphans.py`
**Purpose**: Find orphaned records in the database (e.g., services without contacts).

**Usage**:
```bash
python scripts/check_orphans.py
```

---

### `cleanup_orphans.py`
**Purpose**: Remove orphaned records from the database.

**Usage**:
```bash
python scripts/cleanup_orphans.py
```

**⚠️ WARNING**: This deletes data. Use with caution!

---

### `reprocess_cli.py`
**Purpose**: CLI tool for reprocessing meeting chats to re-extract contacts/services.

**Usage**:
```bash
python scripts/reprocess_cli.py [chat_id]
```

**When to use**: When extraction logic changes and you need to re-extract data from existing chats.

---

## Notes

- All scripts require the backend virtual environment to be activated
- Scripts use service role credentials (environment variables must be set)
- Always test with dry-run options first when available
