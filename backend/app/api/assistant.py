from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client
from app.dependencies import get_supabase_client, get_current_user
from app.services.langgraph_agent import app_graph
from langchain_core.messages import HumanMessage

router = APIRouter()

class QueryRequest(BaseModel):
    query: str

@router.post("/assistant/query")
async def query_assistant(
    request: QueryRequest,
    client: Client = Depends(get_supabase_client),
    user: dict = Depends(get_current_user)
):
    # Prepare state
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
