import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Search, Users } from 'lucide-react'
import { ContactCard } from '../../components/ContactCard'
import { ContactDetail } from '../../components/ContactDetail'

export default function AdminDirectory() {
    const [contacts, setContacts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    // Modal State
    const [detailOpen, setDetailOpen] = useState(false)
    const [selectedContact, setSelectedContact] = useState<any>(null)

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchContacts()
        }, 300)
        return () => clearTimeout(timer)
    }, [search])

    const fetchContacts = async () => {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        let url = `${import.meta.env.VITE_API_BASE_URL || ''}/api/directory/contacts?limit=100`
        if (search) {
            url += `&q=${encodeURIComponent(search)}`
        }

        try {
            const res = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            })

            if (res.ok) {
                const data = await res.json()
                // Normalize profile if array
                const cleaned = data.map((c: any) => ({
                    ...c,
                    profile: Array.isArray(c.profile) ? c.profile[0] : c.profile
                }))
                setContacts(cleaned)
            }
        } catch (e) {
            console.error("Failed to fetch contacts", e)
        } finally {
            setLoading(false)
        }
    }

    const openDetail = (contact: any) => {
        setSelectedContact(contact)
        setDetailOpen(true)
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Users className="h-8 w-8 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Directory</h1>
                </div>

                <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search contacts..."
                        className="pl-9 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                        <div key={i} className="h-40 rounded-xl border bg-muted/20 animate-pulse" />
                    ))}
                </div>
            ) : contacts.length === 0 ? (
                <div className="text-center py-12 border border-dashed rounded-xl">
                    <p className="text-muted-foreground">No contacts found matching your search.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {contacts.map((contact) => (
                        <ContactCard
                            key={contact.id}
                            contact={contact}
                            onClick={() => openDetail(contact)}
                        />
                    ))}
                </div>
            )}

            {/* Contact Detail Modal */}
            <ContactDetail
                contact={selectedContact}
                isOpen={detailOpen}
                onClose={() => setDetailOpen(false)}
                editable={true}
            />
        </div>
    )
}

