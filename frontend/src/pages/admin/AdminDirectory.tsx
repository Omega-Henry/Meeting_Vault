import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Search, Users, Trash2, X, AlertTriangle } from 'lucide-react'
import { ContactCard } from '../../components/ContactCard'
import { ContactDetail } from '../../components/ContactDetail'

export default function AdminDirectory() {
    const [contacts, setContacts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    // Modal State
    const [detailOpen, setDetailOpen] = useState(false)
    const [selectedContact, setSelectedContact] = useState<any>(null)

    // Bulk Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [deleting, setDeleting] = useState(false)

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

    const toggleSelect = (id: string) => {
        const newSelected = new Set(selectedIds)
        if (newSelected.has(id)) {
            newSelected.delete(id)
        } else {
            newSelected.add(id)
        }
        setSelectedIds(newSelected)
    }

    const clearSelection = () => {
        setSelectedIds(new Set())
    }

    const selectAll = () => {
        setSelectedIds(new Set(contacts.map(c => c.id)))
    }

    const handleBulkDelete = async () => {
        // Enhanced warning for bulk delete
        const warningMessage = selectedIds.size === contacts.length
            ? `⚠️ WARNING: You are about to delete ALL ${selectedIds.size} contacts!\n\nThis will permanently remove:\n- All selected contacts\n- All their associated services\n- All their profile data\n\nThis action CANNOT be undone.\n\nType "DELETE ALL" to confirm:`
            : `Are you sure you want to delete ${selectedIds.size} contact${selectedIds.size > 1 ? 's' : ''}?\n\nThis will also delete all their services and cannot be undone.`

        if (selectedIds.size === contacts.length) {
            const confirmation = prompt(warningMessage)
            if (confirmation !== 'DELETE ALL') {
                alert('Deletion cancelled. You must type "DELETE ALL" exactly to confirm.')
                return
            }
        } else {
            if (!confirm(warningMessage)) {
                return
            }
        }

        setDeleting(true)
        try {
            const { error } = await supabase
                .from('contacts')
                .delete()
                .in('id', Array.from(selectedIds))

            if (error) throw error

            setSelectedIds(new Set())
            fetchContacts()
        } catch (e) {
            console.error(e)
            alert('Failed to delete contacts')
        } finally {
            setDeleting(false)
        }
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

            {/* Bulk Actions Bar */}
            {selectedIds.size > 0 && (
                <div className="flex items-center justify-between p-3 bg-destructive/10 rounded-lg border border-destructive/30">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        <span className="text-sm font-medium">
                            {selectedIds.size} contact{selectedIds.size > 1 ? 's' : ''} selected
                            {selectedIds.size === contacts.length && (
                                <span className="ml-1 text-destructive font-bold">(ALL)</span>
                            )}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedIds.size < contacts.length && (
                            <button
                                onClick={selectAll}
                                className="flex items-center gap-1 text-sm text-primary hover:underline px-2 py-1 rounded transition-colors"
                            >
                                Select All ({contacts.length})
                            </button>
                        )}
                        <button
                            onClick={clearSelection}
                            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground px-2 py-1 rounded transition-colors"
                        >
                            <X className="h-4 w-4" />
                            Clear
                        </button>
                        <button
                            onClick={handleBulkDelete}
                            disabled={deleting}
                            className="flex items-center gap-1 text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
                        >
                            <Trash2 className="h-4 w-4" />
                            {deleting ? 'Deleting...' : `Delete (${selectedIds.size})`}
                        </button>
                    </div>
                </div>
            )}

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
                            selectable={true}
                            selected={selectedIds.has(contact.id)}
                            onSelect={toggleSelect}
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
                onDelete={() => {
                    setDetailOpen(false)
                    fetchContacts()
                }}
            />
        </div>
    )
}
