"""
LangGraph Agent Module

This module implements the AI Assistant agent that helps users query the
MeetingVault database. It uses LangGraph for orchestration and provides
tool-based database access.

Features:
- Tool-based database queries (contacts, services, chats)
- Rate-limited LLM calls via llm_factory
- Retry logic for transient failures
- Structured response formatting for UI
"""
import json
import logging
from typing import TypedDict, List, Dict, Any

from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_core.messages import (
    BaseMessage, 
    HumanMessage, 
    AIMessage, 
    SystemMessage, 
    ToolMessage
)
from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig
from typing import Annotated

from app.services import tools as db_tools
from app.services.llm_factory import get_llm, invoke_with_retry
from app.core.config import settings

logger = logging.getLogger(__name__)


# =============================================================================
# STATE DEFINITION
# =============================================================================

class AgentState(TypedDict):
    """State maintained throughout agent execution."""
    messages: Annotated[List[BaseMessage], add_messages]
    user_id: str
    tool_outputs: List[Dict[str, Any]]
    final_response: Dict[str, Any]


# =============================================================================
# TOOL DEFINITIONS
# =============================================================================

@tool
def list_chats_tool(limit: int = 10, offset: int = 0, config: RunnableConfig = None) -> str:
    """List recent meeting chats. Returns JSON string."""
    client = config["configurable"]["supabase_client"]
    data = db_tools.list_meeting_chats(client, limit, offset)
    return json.dumps(data, default=str)


@tool
def get_chat_tool(meeting_id: str, config: RunnableConfig = None) -> str:
    """Get details of a meeting chat by ID. Returns JSON string."""
    client = config["configurable"]["supabase_client"]
    data = db_tools.get_meeting_chat(client, meeting_id)
    return json.dumps(data, default=str)


@tool
def search_contacts_tool(query: str, config: RunnableConfig = None) -> str:
    """Search contacts by name, email, or phone. Returns JSON string."""
    client = config["configurable"]["supabase_client"]
    data = db_tools.search_contacts(client, query)
    return json.dumps(data, default=str)


@tool
def list_services_tool(type_filter: str = None, config: RunnableConfig = None) -> str:
    """List services. type_filter can be 'offer' or 'request'. Returns JSON string."""
    client = config["configurable"]["supabase_client"]
    data = db_tools.list_services(client, type_filter)
    return json.dumps(data, default=str)


@tool
def search_everything_tool(query: str, config: RunnableConfig = None) -> str:
    """Search across chats, contacts, and services. Returns JSON string."""
    client = config["configurable"]["supabase_client"]
    data = db_tools.search_everything(client, query)
    return json.dumps(data, default=str)


@tool
def advanced_contact_search_tool(
    query: str = None,
    asset_classes: List[str] = None,
    markets: List[str] = None,
    min_price: float = None,
    max_price: float = None,
    role_tags: List[str] = None,
    service_type: str = None,
    config: RunnableConfig = None
) -> str:
    """
    Advanced search for real estate contacts with structured filters.
    
    Use this for complex queries like:
    - "Buyers of SFH in Missouri" -> asset_classes=["SFH"], markets=["MO"], role_tags=["buyer"]
    - "Lenders with capital over 500k" -> role_tags=["lender"], min_price=500000
    - "Wholesalers in Texas" -> markets=["TX"], role_tags=["wholesaler"]
    
    Args:
        query: Optional freetext search (name, email, description)
        asset_classes: Filter by asset type: SFH, Multifamily, Commercial, Land, etc.
        markets: Filter by geographic market: State codes like MO, TX, or "Nationwide"
        min_price: Minimum deal/investment size
        max_price: Maximum deal/investment size  
        role_tags: Filter by role: buyer, seller, lender, wholesaler, tc, gator, subto, investor
        service_type: Filter by 'offer' or 'request'
    
    Returns JSON with contacts and their profiles.
    """
    client = config["configurable"]["supabase_client"]
    data = db_tools.advanced_contact_search(
        client,
        query=query,
        asset_classes=asset_classes,
        markets=markets,
        min_price=min_price,
        max_price=max_price,
        role_tags=role_tags,
        service_type=service_type
    )
    return json.dumps(data, default=str)


# All available tools
ALL_TOOLS = [
    list_chats_tool, 
    get_chat_tool, 
    search_contacts_tool, 
    list_services_tool, 
    search_everything_tool, 
    advanced_contact_search_tool
]


# =============================================================================
# SYSTEM PROMPT
# =============================================================================

SYSTEM_PROMPT = """You are a DATABASE SEARCH ASSISTANT for MeetingVault. Your ONLY job is to search the database and return results.

=== CRITICAL BEHAVIOR RULES ===
1. You are NOT a general assistant. You CANNOT give advice, explanations, or information from your knowledge.
2. You MUST ALWAYS call a tool to search the database. NEVER answer without calling a tool first.
3. After getting tool results, ONLY summarize what was found. Do NOT add any information beyond the results.
4. If you don't find results, say "No matches found in the database." Do NOT suggest alternatives or give advice.

=== WHAT YOU CAN DO ===
- Search for contacts by name, email, phone
- Search for offers and requests (services)
- Filter by: asset class, market/state, price range, role tags
- Ask ONE clarifying question if the query is unclear

=== WHAT YOU CANNOT DO (STRICTLY FORBIDDEN) ===
- Give advice about loans, investments, real estate, or any topic
- Explain concepts or answer "how to" questions
- Provide information from your training data
- Make recommendations beyond database search suggestions

=== RESPONSE FORMAT ===
- After searching: "Found X [contacts/offers/requests] matching [query]." (1 sentence max)
- No results: "No matches found in the database for [query]."
- Need clarification: Ask ONE short question like "Which state?" or "Looking for buyers or sellers?"

=== REAL ESTATE TERMS (for parsing queries only) ===
- SFH = Single Family Home, Multifamily, Commercial, Land
- Subto = Subject-To, Gator = Gator Lender, TC = Transaction Coordinator
- Markets = State codes (MO, TX, FL) or "Nationwide"

=== EXAMPLE BEHAVIOR ===
User: "I need lenders"
YOU: Call advanced_contact_search_tool(role_tags=["lender"])
After results: "Found 3 lenders in the database."

User: "What's a good interest rate for hard money?"
YOU: "I can only search the MeetingVault database. Would you like me to find lenders or loan offers?"

User: "Find buyers in Texas for SFH"
YOU: Call advanced_contact_search_tool(markets=["TX"], asset_classes=["SFH"], role_tags=["buyer"])
"""


# =============================================================================
# GRAPH NODES
# =============================================================================

async def planner_node(state: AgentState) -> Dict[str, Any]:
    """
    Main LLM node that decides which tools to call.
    Uses centralized LLM factory with retry.
    """
    # Get LLM with rate limiting
    model = get_llm()
    
    # Build messages with system prompt
    system_msg = SystemMessage(content=SYSTEM_PROMPT)
    messages = [system_msg] + state["messages"]
    
    # Bind tools to model
    model_with_tools = model.bind_tools(ALL_TOOLS)
    
    try:
        # Use retry wrapper for robustness
        response = await invoke_with_retry(model_with_tools, messages)
        return {"messages": [response]}
    except Exception as e:
        logger.error(f"Planner node failed: {e}")
        # Return error message to user
        error_msg = AIMessage(content="I encountered an error processing your request. Please try again.")
        return {"messages": [error_msg]}


def executor_node(state: AgentState, config: RunnableConfig) -> Dict[str, Any]:
    """
    Executes tool calls from the planner.
    Includes retry logic for transient database failures.
    """
    messages = state["messages"]
    last_message = messages[-1]
    
    tool_map = {t.name: t for t in ALL_TOOLS}
    tool_outputs = []
    tool_messages = []
    
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        for tool_call in last_message.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]
            
            tool_func = tool_map.get(tool_name)
            if tool_func:
                # Execute tool with retry for transient failures
                max_retries = settings.LLM_MAX_RETRIES
                last_error = None
                
                for attempt in range(max_retries + 1):
                    try:
                        output = tool_func.invoke(tool_args, config=config)
                        break
                    except Exception as e:
                        last_error = e
                        if attempt < max_retries:
                            import time
                            delay = settings.LLM_RETRY_INITIAL_DELAY * (
                                settings.LLM_RETRY_BACKOFF_FACTOR ** attempt
                            )
                            logger.warning(
                                f"Tool {tool_name} attempt {attempt + 1} failed: {e}. "
                                f"Retrying in {delay:.1f}s..."
                            )
                            time.sleep(delay)
                        else:
                            output = f"Error executing tool {tool_name} after {max_retries + 1} attempts: {e}"
                            logger.error(output)
                
                tool_outputs.append({
                    "name": tool_name,
                    "args": tool_args,
                    "output": output
                })
                
                tool_messages.append(ToolMessage(
                    content=str(output),
                    tool_call_id=tool_call["id"],
                    name=tool_name
                ))
            else:
                tool_messages.append(ToolMessage(
                    content=f"Tool {tool_name} not found",
                    tool_call_id=tool_call["id"],
                    name=tool_name
                ))
                 
    return {
        "messages": tool_messages,
        "tool_outputs": tool_outputs
    }


async def formatter_node(state: AgentState) -> Dict[str, Any]:
    """
    Generates final response and formats for UI.
    """
    model = get_llm()
    
    try:
        response = await invoke_with_retry(model, state["messages"])
    except Exception as e:
        logger.error(f"Formatter node failed: {e}")
        response = AIMessage(content="I encountered an error. Please try again.")
    
    # Build UI payload
    ui_data = {"intent": "chat", "data": {}, "count": 0}
    
    last_tool_outputs = state.get("tool_outputs", [])
    if last_tool_outputs:
        last_output = last_tool_outputs[-1]
        try:
            data = json.loads(last_output["output"])
            
            if isinstance(data, list):
                ui_data["count"] = len(data)
                ui_data["data"] = data
            elif isinstance(data, dict):
                ui_data["data"] = data
                # Handle advanced_contact_search output
                if "total_matches" in data:
                    ui_data["count"] = data.get("total_matches", 0)
                    ui_data["filters_applied"] = data.get("filters_applied", [])
                # Handle search_everything output
                elif "contacts" in data:
                    ui_data["count"] = (
                        len(data.get("contacts", [])) + 
                        len(data.get("services", [])) + 
                        len(data.get("chats", []))
                    )
            
            ui_data["intent"] = last_output["name"].replace("_tool", "")
        except (json.JSONDecodeError, KeyError):
            pass

    return {
        "final_response": {
            "assistant_text": response.content,
            "ui": ui_data
        }
    }


def should_continue(state: AgentState) -> str:
    """Routing function to decide next node."""
    last_message = state["messages"][-1]
    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        return "executor"
    return "formatter"


# =============================================================================
# GRAPH CONSTRUCTION
# =============================================================================

def build_agent_graph():
    """Builds the agent graph."""
    workflow = StateGraph(AgentState)

    # Add nodes
    workflow.add_node("planner", planner_node)
    workflow.add_node("executor", executor_node)
    workflow.add_node("formatter", formatter_node)

    # Set entry point
    workflow.set_entry_point("planner")

    # Define edges
    workflow.add_conditional_edges("planner", should_continue)
    workflow.add_edge("executor", "planner")  # ReAct loop: Planner -> Executor -> Planner
    workflow.add_edge("formatter", END)

    return workflow.compile()


# Singleton compiled graph
app_graph = build_agent_graph()
