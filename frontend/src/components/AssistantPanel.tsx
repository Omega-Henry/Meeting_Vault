import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Send, Bot, Loader2 } from 'lucide-react'
import clsx from 'clsx'

interface Message {
    role: 'user' | 'assistant'
    content: string
    data?: any
}

export default function AssistantPanel() {
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: 'Hello! I can help you find meetings, contacts, or services. What are you looking for?' }
    ])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages])

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!input.trim() || loading) return

        const userMsg = input.trim()
        setInput('')
        setMessages(prev => [...prev, { role: 'user', content: userMsg }])
        setLoading(true)

        try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token

            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/assistant/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ query: userMsg })
            })

            if (!res.ok) {
                throw new Error('Failed to get response')
            }

            const data = await res.json()

            // data format: { assistant_text: string, ui: { intent: string, data: any, count: number } }
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: data.assistant_text,
                data: data.ui
            }])

        } catch (error) {
            console.error(error)
            setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }])
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b border-border bg-muted/20">
                <h2 className="font-semibold flex items-center">
                    <Bot className="mr-2 h-5 w-5" />
                    AI Assistant
                </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                {messages.map((msg, idx) => (
                    <div key={idx} className={clsx("flex flex-col", msg.role === 'user' ? "items-end" : "items-start")}>
                        <div className={clsx(
                            "max-w-[85%] rounded-lg p-3 text-sm",
                            msg.role === 'user'
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground"
                        )}>
                            <p className="whitespace-pre-wrap">{msg.content}</p>

                            {/* Render UI Data if present */}
                            {msg.data && msg.data.data && (
                                <div className="mt-3 pt-3 border-t border-border/20">
                                    {msg.data.intent === 'list_chats' && Array.isArray(msg.data.data) && (
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold opacity-70">Found {msg.data.count} chats:</p>
                                            {msg.data.data.map((chat: any) => (
                                                <div key={chat.id} className="text-xs bg-background/50 p-2 rounded">
                                                    {chat.meeting_name}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {msg.data.intent === 'search_contacts' && Array.isArray(msg.data.data) && (
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold opacity-70">Found {msg.data.count} contacts:</p>
                                            {msg.data.data.map((contact: any) => (
                                                <div key={contact.id} className="text-xs bg-background/50 p-2 rounded">
                                                    {contact.name || contact.email}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {/* Add more UI renderers as needed */}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex items-center text-muted-foreground text-sm">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Thinking...
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-border">
                <form onSubmit={handleSend} className="flex gap-2">
                    <input
                        type="text"
                        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder="Ask about your meetings..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={loading}
                    />
                    <button
                        type="submit"
                        disabled={loading || !input.trim()}
                        className="inline-flex items-center justify-center rounded-md bg-primary p-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        <Send className="h-4 w-4" />
                    </button>
                </form>
            </div>
        </div>
    )
}
