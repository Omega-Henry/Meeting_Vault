import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { ScrollText, Clock, User, Activity } from 'lucide-react'
import clsx from 'clsx'

export default function AuditLogViewer() {
    const [logs, setLogs] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchLogs()
    }, [])

    const fetchLogs = async () => {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/audit-logs?limit=100`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            })
            if (res.ok) {
                const data = await res.json()
                setLogs(data)
            }
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
                    <p className="text-muted-foreground mt-1">Track system activity and changes.</p>
                </div>
                <button
                    onClick={fetchLogs}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-input rounded-md hover:bg-muted"
                >
                    <Activity className={clsx("h-4 w-4", loading && "animate-spin")} />
                    Refresh
                </button>
            </div>

            <div className="border border-border rounded-lg bg-card overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 border-b border-border font-medium text-muted-foreground">
                        <tr>
                            <th className="px-4 py-3 w-48">Timestamp</th>
                            <th className="px-4 py-3 w-32">Actor</th>
                            <th className="px-4 py-3 w-40">Action</th>
                            <th className="px-4 py-3 w-40">Target</th>
                            <th className="px-4 py-3">Details (Diff)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {logs.map((log) => (
                            <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                                    {new Date(log.created_at).toLocaleString()}
                                </td>
                                <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-[100px]" title={log.actor_id}>
                                    {log.actor_id.substring(0, 8)}...
                                </td>
                                <td className="px-4 py-3 font-medium">
                                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                        {log.action}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                    {log.target_type}: {log.target_id?.substring(0, 8)}
                                </td>
                                <td className="px-4 py-3 font-mono text-xs text-muted-foreground overflow-hidden">
                                    <details>
                                        <summary className="cursor-pointer hover:text-foreground">View JSON</summary>
                                        <pre className="mt-2 text-[10px] bg-muted p-2 rounded overflow-x-auto max-w-md">
                                            {JSON.stringify(log.diff, null, 2)}
                                        </pre>
                                    </details>
                                </td>
                            </tr>
                        ))}
                        {logs.length === 0 && !loading && (
                            <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                                    No audit logs found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
