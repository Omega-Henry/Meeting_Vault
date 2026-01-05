
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Star } from 'lucide-react'
import clsx from 'clsx'

export default function AdminFeedback() {
    const [feedback, setFeedback] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('new') // new, read, archived, all

    useEffect(() => {
        fetchFeedback()
    }, [filter])

    const fetchFeedback = async () => {
        setLoading(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token

            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/feedback/?status=${filter}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            if (res.ok) {
                const data = await res.json()
                setFeedback(data)
            }
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString()
    }

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">User Feedback</h1>
                    <p className="text-muted-foreground">Review feedback submitted by users.</p>
                </div>
                <div className="flex bg-muted p-1 rounded-md">
                    {['new', 'read', 'archived', 'all'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={clsx(
                                "px-3 py-1 text-sm rounded-sm capitalize",
                                filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            <div className="border border-border rounded-md bg-card flex-1 overflow-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border bg-muted/50 text-left">
                            <th className="p-4 font-medium text-muted-foreground w-[150px]">Date</th>
                            <th className="p-4 font-medium text-muted-foreground w-[100px]">User ID</th>
                            <th className="p-4 font-medium text-muted-foreground w-[100px]">Rating</th>
                            <th className="p-4 font-medium text-muted-foreground">Message</th>
                            <th className="p-4 font-medium text-muted-foreground w-[100px]">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="p-8 text-center text-muted-foreground">Loading...</td>
                            </tr>
                        ) : feedback.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="p-8 text-center text-muted-foreground">No feedback found.</td>
                            </tr>
                        ) : (
                            feedback.map((item) => (
                                <tr key={item.id} className="hover:bg-muted/50">
                                    <td className="p-4 align-top whitespace-nowrap text-muted-foreground">{formatDate(item.created_at)}</td>
                                    <td className="p-4 align-top font-mono text-xs text-muted-foreground" title={item.user_id}>
                                        {item.user_id.slice(0, 8)}...
                                    </td>
                                    <td className="p-4 align-top">
                                        <div className="flex">
                                            {[...Array(5)].map((_, i) => (
                                                <Star
                                                    key={i}
                                                    className={clsx(
                                                        "h-3 w-3",
                                                        i < (item.rating || 0) ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30"
                                                    )}
                                                />
                                            ))}
                                        </div>
                                    </td>
                                    <td className="p-4 align-top whitespace-pre-wrap">{item.message}</td>
                                    <td className="p-4 align-top">
                                        <span className={clsx(
                                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted capitalize",
                                            item.status === 'new' && "text-blue-500 bg-blue-500/10",
                                            item.status === 'read' && "text-green-500 bg-green-500/10",
                                        )}>
                                            {item.status}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
