from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client
from app.dependencies import get_supabase_client, get_current_user
from app.services.langgraph_agent import app_graph
from langchain_core.messages import HumanMessage
import re

router = APIRouter()

# Prompt injection patterns to block
INJECTION_PATTERNS = [
    r"ignore\s+(previous|all|your)\s+instructions",
    r"disregard\s+(system|your)\s+prompt",
    r"pretend\s+(you\s+are|to\s+be)",
    r"act\s+as\s+(if|a|an)",
    r"you\s+are\s+now",
    r"jailbreak",
    r"DAN\s+mode",
    r"developer\s+mode",
    r"bypass\s+(your|the)\s+rules",
    r"reveal\s+(your|system)\s+prompt",
]

def is_injection_attempt(query: str) -> bool:
    """Check if query contains prompt injection patterns."""
    query_lower = query.lower()
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, query_lower):
            return True
    return False

from typing import List, Dict, Any

class QueryRequest(BaseModel):
    query: str
    messages: List[Dict[str, str]] = []

@router.post("/assistant/query")
async def query_assistant(
    request: QueryRequest,
    client: Client = Depends(get_supabase_client),
    user: dict = Depends(get_current_user)
):
    # Pre-LLM Security Check
    if is_injection_attempt(request.query):
        return {
            "text": "I can only help with MeetingVault database queries.",
            "cards": [],
            "tool_outputs": []
        }
    
    # Run CrewAI Agent
    try:
        from app.services.crew_agent import run_crew_search
        
        # We need to run this in a threadpool because CrewAI is synchronous by default (or the tools might be)
        # Fastapi async routes shouldn't block.
        # But for now we can just await it if we wrap it or just use it directly if it's fast enough.
        # Actually, let's just call it.
        
        response = run_crew_search(request.query, request.messages, client)
        
        # Map to legacy frontend format for now, or new format if we updated frontend
        # The frontend expects { assistant_text: string, ui: { intent: string, data: any, count: number } }
        
        return {
            "assistant_text": response.text,
            "ui": {
                "intent": "search_contacts" if response.ui_cards else "chat",
                "data": response.ui_cards, # Frontend handles list of generic objects?
                "count": len(response.ui_cards),
                "suggestions": response.suggestions 
            }
        }
        
    except Exception as e:
        # Log error
        import traceback
        traceback.print_exc()
        print(f"Agent error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

