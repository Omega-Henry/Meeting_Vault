import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Search, Pencil, Check, X, Trash2, ExternalLink } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

export default function ContactsTable() {
    const [contacts, setContacts] = useState<any[]>([])
    const [searchParams, setSearchParams] = useSearchParams()
    const [search, setSearch] = useState(searchParams.get('search') || '')
    const [loading, setLoading] = useState(true)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    useEffect(() => {
        const fetchContacts = async () => {
            let query = supabase
                .from('contacts')
                .select('*, services(type, description)')
                .order('created_at', { ascending: false })

            if (search) {
                query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`)
            }

            const { data } = await query
            if (data) setContacts(data)
            setLoading(false)
        }

        const timer = setTimeout(fetchContacts, 300)
        return () => clearTimeout(timer)
    }, [search])

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(contacts.map(c => c.id)))
        } else {
            setSelectedIds(new Set())
        }
    }

    const handleSelectOne = (id: string) => {
        const newSelected = new Set(selectedIds)
        if (newSelected.has(id)) {
            newSelected.delete(id)
        } else {
            newSelected.add(id)
        }
        setSelectedIds(newSelected)
    }

    const handleBulkDelete = async () => {
        if (!confirm(`Are you sure you want to delete ${selectedIds.size} contacts?`)) return

        const { error } = await supabase
            .from('contacts')
            .delete()
            .in('id', Array.from(selectedIds))

        if (!error) {
            setContacts(contacts.filter(c => !selectedIds.has(c.id)))
            setSelectedIds(new Set())
        } else {
            alert('Failed to delete contacts')
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <h2 className="text-2xl font-bold">Contacts</h2>
                    {selectedIds.size > 0 && (
                        <button
                            onClick={handleBulkDelete}
                            className="flex items-center text-destructive hover:bg-destructive/10 px-3 py-1 rounded-md text-sm transition-colors"
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete ({selectedIds.size})
                        </button>
                    )}
                </div>
                <div className="relative w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search contacts..."
                        className="w-full rounded-md border border-input bg-background pl-8 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value)
                            setSearchParams(e.target.value ? { search: e.target.value } : {})
                        }}
                    />
                </div>
            </div>

            <div className="rounded-md border">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                            <th className="px-4 py-3 w-10">
                                <input
                                    type="checkbox"
                                    onChange={handleSelectAll}
                                    checked={contacts.length > 0 && selectedIds.size === contacts.length}
                                    className="rounded border-gray-300"
                                />
                            </th>
                            <th className="px-4 py-3 font-medium">Name</th>
                            <th className="px-4 py-3 font-medium">Email</th>
                            <th className="px-4 py-3 font-medium">Phone</th>
                            <th className="px-4 py-3 font-medium">Services</th>
                            <th className="px-4 py-3 font-medium">Links</th>
                            <th className="px-4 py-3 font-medium w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {loading ? (
                            <tr><td colSpan={4} className="p-4 text-center">Loading...</td></tr>
                        ) : contacts.length === 0 ? (
                            <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No contacts found</td></tr>
                        ) : (
                            contacts.map((contact) => (
                                <ContactRow
                                    key={contact.id}
                                    contact={contact}
                                    selected={selectedIds.has(contact.id)}
                                    onSelect={() => handleSelectOne(contact.id)}
                                    onUpdate={() => {
                                        // Refresh contacts (simple re-fetch logic for now)
                                        setSearch(prev => prev + ' ') // Hack to trigger effect
                                        setTimeout(() => setSearch(prev => prev.trim()), 0)
                                    }}
                                />
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
// End of ContactsTable

// End of ContactsTable

function ContactRow({ contact, selected, onSelect, onUpdate }: { contact: any, selected: boolean, onSelect: () => void, onUpdate: () => void }) {
    const [isEditing, setIsEditing] = useState(false)
    const [name, setName] = useState(contact.name || '')
    const [email, setEmail] = useState(contact.email || '')
    const [phone, setPhone] = useState(contact.phone || '')
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        setSaving(true)
        const { error } = await supabase
            .from('contacts')
            .update({ name, email, phone })
            .eq('id', contact.id)

        setSaving(false)
        if (!error) {
            setIsEditing(false)
            onUpdate()
        } else {
            alert('Failed to update contact')
        }
    }

    if (isEditing) {
        return (
            <tr className="bg-muted/30">
                <td className="px-4 py-3">
                    <input type="checkbox" checked={selected} onChange={onSelect} />
                </td>
                <td className="px-4 py-3">
                    <input
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Name"
                    />
                </td>
                <td className="px-4 py-3">
                    <input
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="Email"
                    />
                </td>
                <td className="px-4 py-3">
                    <input
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="Phone"
                    />
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                    (Services not editable)
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                    (Links not editable)
                </td>
                <td className="px-4 py-3 flex items-center space-x-1">
                    <button onClick={handleSave} disabled={saving} className="p-1 hover:bg-green-100 rounded text-green-600">
                        <Check className="h-4 w-4" />
                    </button>
                    <button onClick={() => setIsEditing(false)} className="p-1 hover:bg-red-100 rounded text-red-600">
                        <X className="h-4 w-4" />
                    </button>
                </td>
            </tr>
        )
    }

    return (
        <tr className="hover:bg-muted/50 group">
            <td className="px-4 py-3">
                <input type="checkbox" checked={selected} onChange={onSelect} />
            </td>
            <td className="px-4 py-3 font-medium">{contact.name || 'Unknown'}</td>
            <td className="px-4 py-3">{contact.email || '-'}</td>
            <td className="px-4 py-3">{contact.phone || '-'}</td>
            <td className="px-4 py-3">
                {contact.services && contact.services.length > 0 ? (
                    <Link to={`/admin/services?contact_id=${contact.id}`} className="text-xs text-primary hover:underline flex items-center">
                        {contact.services.length} Services
                        <ExternalLink className="h-3 w-3 ml-1" />
                    </Link>
                ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                )}
            </td>
            <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                    {contact.links && contact.links.map((link: string, i: number) => (
                        <a key={i} href={link} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline bg-primary/10 px-1 rounded">
                            Link {i + 1}
                        </a>
                    ))}
                </div>
            </td>
            <td className="px-4 py-3">
                <button
                    onClick={() => setIsEditing(true)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted rounded transition-opacity"
                >
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                </button>
            </td>
        </tr>
    )
}
