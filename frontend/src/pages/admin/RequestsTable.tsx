import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Check, X } from 'lucide-react'

export default function RequestsTable() {
    const [requests, setRequests] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchRequests()
    }, [])

    const fetchRequests = async () => {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/change-requests?status=pending`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        })

        if (res.ok) {
            const data = await res.json()
            setRequests(data)
        }
        setLoading(false)
    }

    const handleReview = async (id: string, action: 'approve' | 'reject') => {
        if (!confirm(`Are you sure you want to ${action} this request?`)) return

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/change-requests/${id}/review`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                action: action,
                reason: "Admin review"
            })
        })

        if (res.ok) {
            // Remove from list
            setRequests(requests.filter(r => r.id !== id))
        } else {
            alert("Failed to process request")
        }
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Pending Change Requests</h1>

            <div className="rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted/50 text-muted-foreground font-medium">
                            <tr>
                                <th className="px-4 py-3">Type</th>
                                <th className="px-4 py-3">Summary</th>
                                <th className="px-4 py-3">Submitted By</th>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                                        Loading...
                                    </td>
                                </tr>
                            ) : requests.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                                        No pending requests.
                                    </td>
                                </tr>
                            ) : (
                                requests.map((req) => (
                                    <tr key={req.id} className="hover:bg-muted/50 transition-colors">
                                        <td className="px-4 py-3 capitalize font-medium">{req.target_type}</td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium">{req.summary}</div>
                                            <pre className="text-xs text-muted-foreground mt-1 max-w-xs overflow-hidden text-ellipsis">
                                                {JSON.stringify(req.payload).substring(0, 50)}...
                                            </pre>
                                        </td>
                                        <td className="px-4 py-3">{req.created_by_user?.email || 'Unknown'}</td>
                                        <td className="px-4 py-3">{new Date(req.created_at).toLocaleDateString()}</td>
                                        <td className="px-4 py-3 text-right space-x-2">
                                            <button
                                                onClick={() => handleReview(req.id, 'approve')}
                                                className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-green-100 text-green-700 hover:bg-green-200"
                                                title="Approve"
                                            >
                                                <Check className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleReview(req.id, 'reject')}
                                                className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-red-100 text-red-700 hover:bg-red-200"
                                                title="Reject"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
