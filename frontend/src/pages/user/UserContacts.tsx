import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Search } from 'lucide-react'
import ChangeRequestModal from '../../components/ChangeRequestModal'

export default function UserContacts() {
    const [contacts, setContacts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    // Modal State
    const [modalOpen, setModalOpen] = useState(false)
    const [selectedItem, setSelectedItem] = useState<any>(null)

    useEffect(() => {
        fetchContacts()
    }, [search])

    const fetchContacts = async () => {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        let url = `${import.meta.env.VITE_API_BASE_URL || ''}/api/directory/contacts?limit=100`
        if (search) {
            url += `&q=${encodeURIComponent(search)}`
        }

        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        })

        if (res.ok) {
            const data = await res.json()
            setContacts(data)
        }
        setLoading(false)
    }

    const openSuggestModal = (contact: any) => {
        setSelectedItem(contact)
        setModalOpen(true)
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">Directory Contacts</h1>
            </div>

            <div className="flex items-center space-x-2">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search contacts..."
                        className="pl-9 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted/50 text-muted-foreground font-medium">
                            <tr>
                                <th className="px-4 py-3">Name</th>
                                <th className="px-4 py-3">Email</th>
                                <th className="px-4 py-3">Phone</th>
                                <th className="px-4 py-3">Links</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                                        Loading contacts...
                                    </td>
                                </tr>
                            ) : contacts.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                                        No contacts found.
                                    </td>
                                </tr>
                            ) : (
                                contacts.map((contact) => (
                                    <tr key={contact.id} className="hover:bg-muted/50 transition-colors">
                                        <td className="px-4 py-3 font-medium">{contact.name || 'Unknown'}</td>
                                        <td className="px-4 py-3">{contact.email || '-'}</td>
                                        <td className="px-4 py-3">{contact.phone || '-'}</td>
                                        <td className="px-4 py-3">
                                            {contact.links && contact.links.length > 0 ? (
                                                <div className="flex flex-wrap gap-2">
                                                    {contact.links.map((link: string, i: number) => (
                                                        <a
                                                            key={i}
                                                            href={link}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-xs text-blue-500 hover:underline truncate max-w-[150px] inline-block"
                                                        >
                                                            {link}
                                                        </a>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={() => openSuggestModal(contact)}
                                                className="text-xs text-primary hover:underline"
                                            >
                                                Suggest Edit
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <ChangeRequestModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                targetType="contact"
                targetId={selectedItem?.id}
                initialData={selectedItem}
            />
        </div>
    )
}
