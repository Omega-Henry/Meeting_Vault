import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Send, Bot, Loader2, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { useNavigate } from 'react-router-dom'

import ContactCard from './ai/ContactCard'
import ChangeRequestModal from './ChangeRequestModal'

interface Message {
    role: 'user' | 'assistant'
    content: string
    data?: any
    suggestions?: string[]
}

export default function AssistantPanel() {
    const navigate = useNavigate()
    const [messages, setMessages] = useState<Message[]>(() => {
        const saved = localStorage.getItem('ai_chat_history')
        return saved ? JSON.parse(saved) : [
            { role: 'assistant', content: 'Hello! I can help you find meetings, contacts, or services. What are you looking for?' }
        ]
    })
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        localStorage.setItem('ai_chat_history', JSON.stringify(messages))
    }, [messages])

    const clearChat = () => {
        const initial: Message[] = [{ role: 'assistant', content: 'Chat history cleared. How can I help?' }]
        setMessages(initial)
        localStorage.removeItem('ai_chat_history')
    }

    // Edit Modal for fallback
    const [editTarget] = useState<any>(null)
    const [editType] = useState<'contact' | 'service'>('contact')
    const [isEditModalOpen, setEditModalOpen] = useState(false)

    // Scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages])

    const handleSend = async (e?: React.FormEvent, overrideText?: string) => {
        if (e) e.preventDefault()
        const textToSend = overrideText || input.trim()

        if (!textToSend || loading) return

        setInput('')
        setMessages(prev => [...prev, { role: 'user', content: textToSend }])
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
                body: JSON.stringify({ query: textToSend })
            })

            if (!res.ok) {
                throw new Error('Failed to get response')
            }

            const data = await res.json()

            // data format: { assistant_text: string, ui: { intent: string, data: any, count: number, suggestions: [] } }
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: data.assistant_text,
                data: data.ui,
                suggestions: data.ui?.suggestions
            }])

        } catch (error) {
            console.error(error)
            setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }])
        } finally {
            setLoading(false)
        }
    }

    const latestSuggestions = messages[messages.length - 1]?.suggestions || []

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gradient-to-b from-card to-background">
            <div className="p-4 border-b border-border bg-muted/20 flex justify-between items-center shrink-0 backdrop-blur-sm">
                <h2 className="font-semibold flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                        <Bot className="h-4 w-4" />
                    </div>
                    AI Assistant
                </h2>
                <button
                    onClick={clearChat}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded hover:bg-muted"
                >
                    Clear Chat
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6 min-h-0" ref={scrollRef}>
                {messages.map((msg, idx) => (
                    <div key={idx} className={clsx("flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300", msg.role === 'user' ? "items-end" : "items-start")}>
                        <div className={clsx(
                            "max-w-full lg:max-w-[90%] rounded-2xl p-4 text-sm break-words shadow-sm",
                            msg.role === 'user'
                                ? "bg-primary text-primary-foreground rounded-br-sm"
                                : "bg-card border border-border text-foreground rounded-bl-sm"
                        )}>
                            {/* AI Text Content */}
                            {msg.content && (
                                <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                </div>
                            )}

                            {/* UI Content: Cards */}
                            {msg.data?.data && Array.isArray(msg.data.data) && msg.data.data.length > 0 && (
                                <div className="mt-4 space-y-3">
                                    {/* Detect if these are CONTACT cards */}
                                    {msg.data.intent === 'search_contacts' ? (
                                        <div className="grid grid-cols-1 gap-3">
                                            {msg.data.data.map((item: any, i: number) => (
                                                <ContactCard
                                                    key={item.id || i}
                                                    contact={item}
                                                    onView={(id) => navigate(`/admin/contacts?search=${encodeURIComponent(item.name || '')}`)} // Quick hack, or navigate to detail
                                                    onMerge={() => { }} // TODO: Hook up merge
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        // Fallback list for non-contact items
                                        <div className="space-y-2">
                                            {msg.data.data.map((item: any, i: number) => (
                                                <div key={i} className="text-xs bg-muted/50 p-2 rounded">
                                                    {JSON.stringify(item).slice(0, 100)}...
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {loading && (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm px-4">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="animate-pulse">Thinking...</span>
                    </div>
                )}
            </div>

            {/* Suggestions & Input */}
            <div className="p-4 border-t border-border bg-card/50 backdrop-blur-md shrink-0 space-y-3">
                {/* Suggestion Chips */}
                {!loading && latestSuggestions.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                        {latestSuggestions.map((s, i) => (
                            <button
                                key={i}
                                onClick={() => handleSend(undefined, s)}
                                className="inline-flex items-center whitespace-nowrap rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                            >
                                <Sparkles className="mr-1.5 h-3 w-3" />
                                {s}
                            </button>
                        ))}
                    </div>
                )}

                <form onSubmit={(e) => handleSend(e)} className="flex gap-2 relative">
                    <input
                        type="text"
                        className="flex-1 min-w-0 rounded-xl border border-input bg-background/50 px-4 py-3 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all"
                        placeholder="Ask about contacts, deals, or market data..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={loading}
                    />
                    <button
                        type="submit"
                        disabled={loading || !input.trim()}
                        className="inline-flex items-center justify-center rounded-xl bg-primary px-4 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shadow-sm transition-all hover:scale-105 active:scale-95"
                    >
                        <Send className="h-5 w-5" />
                    </button>
                </form>
            </div>

            {editTarget && (
                <ChangeRequestModal
                    isOpen={isEditModalOpen}
                    onClose={() => setEditModalOpen(false)}
                    target={editTarget}
                    type={editType}
                />
            )}
        </div>
    )
}
