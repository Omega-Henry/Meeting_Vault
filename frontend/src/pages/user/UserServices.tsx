
import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Search } from 'lucide-react'
import ChangeRequestModal from '../../components/ChangeRequestModal'

interface UserServicesProps {
    type: 'offer' | 'request'
}

export default function UserServices({ type }: UserServicesProps) {
    const [services, setServices] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchParams, setSearchParams] = useSearchParams()
    const [search, setSearch] = useState(searchParams.get('q') || searchParams.get('search') || '')
    const contactId = searchParams.get('contact_id')

    // Modal
    const [modalOpen, setModalOpen] = useState(false)
    const [selectedItem, setSelectedItem] = useState<any>(null)

    useEffect(() => {
        fetchServices()
    }, [type, search, contactId])

    const fetchServices = async () => {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        let url = `${import.meta.env.VITE_API_BASE_URL || ''}/api/directory/services?type=${type}&limit=100`
        if (search) {
            url += `&q=${encodeURIComponent(search)}`
        }
        if (contactId) {
            url += `&contact_id=${contactId}`
        }

        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        })

        if (res.ok) {
            const data = await res.json()
            setServices(data)
        }
        setLoading(false)
    }

    const openSuggestModal = (item: any) => {
        setSelectedItem(item)
        setModalOpen(true)
    }

    const clearContactFilter = () => {
        setSearchParams({})
    }

    const title = type === 'offer' ? 'Directory Offers' : 'Directory Requests'
    const thType = type === 'offer' ? 'Provider' : 'Requester'

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold">{title}</h1>
                    {contactId && (
                        <div className="flex items-center text-sm text-muted-foreground bg-muted/50 px-2 py-1 rounded w-fit">
                            <span className="mr-2">Filtered by Contact</span>
                            <button onClick={clearContactFilter} className="hover:text-destructive flex items-center">
                                Clear
                                <span className="sr-only">Clear filter</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center space-x-2">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder={`Search ${type}s...`}
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
                                <th className="px-4 py-3 w-1/2">Description</th>
                                <th className="px-4 py-3">Links</th>
                                <th className="px-4 py-3">{thType}</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                                        Loading...
                                    </td>
                                </tr>
                            ) : services.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                                        No entries found.
                                    </td>
                                </tr>
                            ) : (
                                services.map((item) => (
                                    <tr
                                        key={item.id}
                                        className="hover:bg-muted/50 transition-colors cursor-pointer"
                                        onClick={() => setSelectedItem(item)} // Click row to view details (reusing selectedItem logic below, but need new view mode)
                                    >
                                        <td className="px-4 py-3 font-medium">
                                            <div className="line-clamp-2" title="Click to view full description">
                                                {item.description}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {item.links && item.links.length > 0 ? (
                                                <div className="flex flex-col gap-1">
                                                    {item.links.slice(0, 2).map((link: string, i: number) => (
                                                        <a
                                                            key={i}
                                                            href={link}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-xs text-blue-500 hover:underline truncate max-w-[150px]"
                                                            onClick={(e) => e.stopPropagation()} // Prevent row click
                                                        >
                                                            {link}
                                                        </a>
                                                    ))}
                                                    {item.links.length > 2 && <span className="text-xs text-muted-foreground">+{item.links.length - 2} more</span>}
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {item.contacts?.name ? (
                                                <Link
                                                    to={`/app/contacts?search=${encodeURIComponent(item.contacts.name)}`}
                                                    className="hover:underline text-primary"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {item.contacts.name}
                                                </Link>
                                            ) : (
                                                item.contacts?.name || item.contact_name || 'Unknown'
                                            )}
                                            <div className="text-xs text-muted-foreground">{item.contacts?.email}</div>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    openSuggestModal(item)
                                                }}
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

            {/* View Details Modal */}
            {selectedItem && !modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setSelectedItem(null)}>
                    <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
                        <h2 className="text-xl font-bold">Service Details</h2>

                        <div className="space-y-2">
                            <h3 className="text-sm font-medium text-muted-foreground">Description</h3>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed bg-muted/30 p-3 rounded-md border">
                                {selectedItem.description}
                            </p>
                        </div>

                        {selectedItem.links && selectedItem.links.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-medium text-muted-foreground">Links</h3>
                                <div className="flex flex-col gap-1">
                                    {selectedItem.links.map((link: string, i: number) => (
                                        <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all text-sm">
                                            {link}
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end pt-2">
                            <button
                                onClick={() => setSelectedItem(null)}
                                className="px-4 py-2 text-sm font-medium border rounded-md hover:bg-muted"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ChangeRequestModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                targetType="service"
                targetId={selectedItem?.id}
                initialData={selectedItem}
            />
        </div>
    )
}

