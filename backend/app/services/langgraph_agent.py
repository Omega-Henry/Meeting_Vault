from typing import Annotated, TypedDict, Union, List, Dict, Any
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig
from app.services import tools as db_tools
from app.core.config import settings
import json

# State definition
class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], add_messages]
    user_id: str
    intent: str
    tool_calls: List[Dict[str, Any]]
    tool_outputs: List[Dict[str, Any]]
    final_response: Dict[str, Any]

# We need to create the tools dynamically per request to inject the client
# But LangGraph usually defines the graph once.
# We can pass the client in the 'configurable' config and access it in the tool.

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

ALL_TOOLS = [list_chats_tool, get_chat_tool, search_contacts_tool, list_services_tool, search_everything_tool, advanced_contact_search_tool]

# Nodes

def intent_router(state: AgentState):
    # Router to determine initial intent. 
    # Currently defaults to 'general' to let the Planner decide tool usage.
    return {"intent": "general"}


def planner_node(state: AgentState):
    # This node calls the LLM to decide which tools to call
    # Use OpenRouter if key is present, otherwise fallback to OpenAI key
    api_key = settings.OPENROUTER_API_KEY or settings.OPENAI_API_KEY
    base_url = settings.OPENROUTER_BASE_URL if settings.OPENROUTER_API_KEY else None
    
    model = ChatOpenAI(
        model=settings.LLM_MODEL, 
        api_key=api_key,
        base_url=base_url
    )
    
    system_msg = SystemMessage(content="""You are a DATABASE SEARCH ASSISTANT for MeetingVault. Your ONLY job is to search the database and return results.

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
""")
    
    messages = [system_msg] + state["messages"]
    
    model_with_tools = model.bind_tools(ALL_TOOLS)
    response = model_with_tools.invoke(messages)
    return {"messages": [response]}

def executor_node(state: AgentState, config: RunnableConfig):
    messages = state["messages"]
    last_message = messages[-1]
    
    # Create tool map
    tool_map = {t.name: t for t in ALL_TOOLS}
    
    tool_outputs = []
    tool_messages = []
    
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        for tool_call in last_message.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]
            
            tool_func = tool_map.get(tool_name)
            if tool_func:
                # We invoke the tool. The tool expects 'config' for client.
                try:
                    # bind_tools usually handles arg parsing, invoc handles passing config if needed
                    output = tool_func.invoke(tool_args, config=config)
                except Exception as e:
                    output = f"Error executing tool {tool_name}: {e}"
                
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

def formatter_node(state: AgentState):
    # Generate final response
    api_key = settings.OPENROUTER_API_KEY or settings.OPENAI_API_KEY
    base_url = settings.OPENROUTER_BASE_URL if settings.OPENROUTER_API_KEY else None
    
    model = ChatOpenAI(
        model=settings.LLM_MODEL, 
        api_key=api_key,
        base_url=base_url
    )
    
    # Check if we have tool outputs to format
    last_tool_outputs = state.get("tool_outputs", [])
    
    if last_tool_outputs:
        # If we just ran tools, ask LLM to summarize
        pass
    else:
        # If no tools run, maybe we are just asking for clarification
        pass
        
    response = model.invoke(state["messages"])
    
    # Construct UI payload
    ui_data = {"intent": "chat", "data": {}, "count": 0}
    
    if last_tool_outputs:
        last_output = last_tool_outputs[-1]
        try:
            data = json.loads(last_output["output"])
            # Handle list vs dict
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
                    ui_data["count"] = len(data.get("contacts", [])) + len(data.get("services", [])) + len(data.get("chats", []))
            
            ui_data["intent"] = last_output["name"].replace("_tool", "")
        except:
             pass

    return {
        "final_response": {
            "assistant_text": response.content,
            "ui": ui_data
        }
    }

def should_continue(state: AgentState):
    last_message = state["messages"][-1]
    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        return "executor"
    return "formatter"

# Build Graph
workflow = StateGraph(AgentState)

workflow.add_node("intent_router", intent_router)
workflow.add_node("planner", planner_node)
workflow.add_node("executor", executor_node)
workflow.add_node("formatter", formatter_node)

workflow.set_entry_point("intent_router")
workflow.add_edge("intent_router", "planner")
workflow.add_conditional_edges("planner", should_continue)
workflow.add_edge("executor", "planner") # ReAct loop: Planner -> Executor -> Planner
# To ensure stability and avoid infinite loops, we can also enforce a max depth or strict flow.
# For this implementation, we allow the planner to decide if it needs to run more tools or exit.

workflow.add_edge("executor", "formatter") 
workflow.add_edge("formatter", END)

app_graph = workflow.compile()
