import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Users, CheckSquare, MessageSquare, Briefcase } from 'lucide-react'
import { useUserProfile } from '../hooks/useUserContext'

export default function Dashboard() {
    const { profile } = useUserProfile()
    const [stats, setStats] = useState({
        contacts: 0,
        services: 0,
        chats: 0,
        requests: 0
    })
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchStats()
    }, [profile])

    const fetchStats = async () => {
        if (!profile) return
        setLoading(true)

        try {
            // Parallel fetch for simplified stats
            // Note: RLS will automatically scope these counts to what the user can see.
            // For Admins: All. For Users: Their own / Org's.

            const [contacts, services, chats, requests] = await Promise.all([
                supabase.from('contacts').select('*', { count: 'exact', head: true }),
                supabase.from('services').select('*', { count: 'exact', head: true }),
                supabase.from('meeting_chats').select('*', { count: 'exact', head: true }),
                supabase.from('change_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending')
            ])

            setStats({
                contacts: contacts.count || 0,
                services: services.count || 0,
                chats: chats.count || 0,
                requests: requests.count || 0
            })
        } catch (error) {
            console.error("Error fetching stats:", error)
        } finally {
            setLoading(false)
        }
    }

    const statCards = [
        { label: 'Total Contacts', value: stats.contacts, icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' },
        { label: 'Active Services', value: stats.services, icon: Briefcase, color: 'text-purple-600', bg: 'bg-purple-100' },
        { label: 'Meeting Chats', value: stats.chats, icon: MessageSquare, color: 'text-green-600', bg: 'bg-green-100' },
        { label: 'Pending Requests', value: stats.requests, icon: CheckSquare, color: 'text-amber-600', bg: 'bg-amber-100', adminOnly: true },
    ]

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-muted-foreground mt-2">
                    Welcome back, {profile?.email}. Here's an overview of your workspace.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {statCards
                    .filter(card => !card.adminOnly || profile?.role === 'admin')
                    .map((card, i) => (
                        <div key={i} className="p-6 rounded-lg border bg-card text-card-foreground shadow-sm flex items-center space-x-4">
                            <div className={`p-3 rounded-full ${card.bg}`}>
                                <card.icon className={`h-6 w-6 ${card.color}`} />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
                                {loading ? (
                                    <div className="h-6 w-16 bg-muted animate-pulse rounded mt-1"></div>
                                ) : (
                                    <h3 className="text-2xl font-bold">{card.value}</h3>
                                )}
                            </div>
                        </div>
                    ))}
            </div>

            {/* Recent Activity Placeholder or other widgets could go here */}
            <div className="rounded-lg border bg-card p-6">
                <h3 className="font-semibold mb-4">Quick Actions</h3>
                <div className="flex gap-4">
                    <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90">
                        Upload Chat
                    </button>
                    <button className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-muted">
                        Search Database
                    </button>
                </div>
            </div>
        </div>
    )
}
