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

ALL_TOOLS = [list_chats_tool, get_chat_tool, search_contacts_tool, list_services_tool, search_everything_tool]

# Nodes

def intent_router(state: AgentState):
    # Simple router based on last message
    # In a real app, we might use an LLM call here to classify intent
    # For MVP, we'll just let the Planner (LLM with tools) decide.
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
    
    system_msg = SystemMessage(content="""You are a helpful Meeting Vault assistant. 
    Your goal is to help users find information about contacts, services (offers/requests), and meeting chats.
    
    GUIDELINES:
    1. If the user's request is ambiguous (e.g., "lenders"), ASK a clarifying question (e.g., "Do you mean lenders offering loans or requesting them? Any location?").
    2. Use the available tools to query the database. YOU ARE READ-ONLY.
    3. If you find results, summarize them briefly and let the UI handle the detailed display.
    4. If the user asks for "contacts from meeting X", use search tools or list chats to find the meeting first if needed.
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
                 # specialized handling for search_everything or single item
                 ui_data["data"] = data
                 if "contacts" in data: # search_everything signature
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
workflow.add_edge("executor", "planner") # Loop back to planner to see if more tools needed (ReAct)
# Actually, for read-only retrieval, usually one hop is enough, but ReAct is safer.
# But to avoid infinite loops in MVP, let's go executor -> formatter for now, or check depth.
# Let's do executor -> formatter for simplicity in this MVP unless we need multi-step.
# The prompt says "Planner (choose tools) -> Executor (run tools) -> Formatter".
# So:
# Planner -> (has tools) -> Executor -> Formatter
# Planner -> (no tools) -> Formatter

workflow.add_edge("executor", "formatter") 
workflow.add_edge("formatter", END)

app_graph = workflow.compile()
