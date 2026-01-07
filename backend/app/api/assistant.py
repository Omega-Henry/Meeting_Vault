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

class QueryRequest(BaseModel):
    query: str

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
    
    # Prepare state
    initial_state = {
        "messages": [HumanMessage(content=request.query)],
        "user_id": user.id,
        "intent": "",
        "tool_calls": [],
        "tool_outputs": [],
        "final_response": {}
    }
    
    # Run graph with config injecting the client
    config = {"configurable": {"supabase_client": client}}
    
    try:
        result = await app_graph.ainvoke(initial_state, config=config)
        return result["final_response"]
    except Exception as e:
        # Log error
        print(f"Agent error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

