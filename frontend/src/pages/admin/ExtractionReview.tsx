import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { CheckCircle, XCircle, AlertTriangle, ExternalLink, Archive } from 'lucide-react'
import clsx from 'clsx'

export default function ExtractionReview() {
    const [items, setItems] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchQueue()
    }, [])

    const fetchQueue = async () => {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/review-queue`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            })
            if (res.ok) {
                const data = await res.json()
                setItems(data)
            }
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    const archiveService = async (id: string) => {
        if (!confirm("Are you sure you want to archive this service?")) return

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/services/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ is_archived: true, archive_reason: 'Admin Review' })
            })
            if (res.ok) {
                setItems(prev => prev.map(i => i.id === id ? { ...i, is_archived: true } : i))
            }
        } catch (error) {
            console.error(error)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Data Review</h1>
                    <p className="text-muted-foreground mt-1">Review recently extracted services.</p>
                </div>
                <button
                    onClick={fetchQueue}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-input rounded-md hover:bg-muted"
                >
                    Refresh
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {items.map((item) => (
                    <div key={item.id} className={clsx(
                        "p-4 rounded-lg border bg-card transition-all",
                        item.is_archived ? "opacity-50 grayscale border-dashed" : "border-border shadow-sm"
                    )}>
                        <div className="flex justify-between items-start gap-4">
                            <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className={clsx(
                                        "uppercase text-[10px] font-bold px-1.5 py-0.5 rounded",
                                        item.type === 'offer' ? "bg-green-500/10 text-green-500" : "bg-blue-500/10 text-blue-500"
                                    )}>
                                        {item.type}
                                    </span>
                                    <span className="text-xs text-muted-foreground font-mono">
                                        {new Date(item.created_at).toLocaleString()}
                                    </span>
                                </div>
                                <p className="text-sm font-medium leading-relaxed">{item.description}</p>
                                <div className="text-xs text-muted-foreground pt-1 flex items-center gap-2">
                                    <UserIcon className="h-3 w-3" />
                                    {item.contacts?.name || 'Unknown User'} ({item.contacts?.email || 'No email'})
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                {!item.is_archived && (
                                    <button
                                        onClick={() => archiveService(item.id)}
                                        className="inline-flex items-center justify-center p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                        title="Archive (Incorrect/Spam)"
                                    >
                                        <Archive className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function UserIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </svg>
    )
}
