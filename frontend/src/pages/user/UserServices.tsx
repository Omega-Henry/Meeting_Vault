
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Search } from 'lucide-react'
import ChangeRequestModal from '../../components/ChangeRequestModal'

interface UserServicesProps {
    type: 'offer' | 'request'
}

export default function UserServices({ type }: UserServicesProps) {
    const [services, setServices] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    // Modal
    const [modalOpen, setModalOpen] = useState(false)
    const [selectedItem, setSelectedItem] = useState<any>(null)

    useEffect(() => {
        fetchServices()
    }, [type, search])

    const fetchServices = async () => {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        let url = `${import.meta.env.VITE_API_BASE_URL || ''}/api/directory/services?type=${type}&limit=100`
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
            setServices(data)
        }
        setLoading(false)
    }

    const openSuggestModal = (item: any) => {
        setSelectedItem(item)
        setModalOpen(true)
    }

    const title = type === 'offer' ? 'Directory Offers' : 'Directory Requests'
    const thType = type === 'offer' ? 'Provider' : 'Requester'

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">{title}</h1>
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
                                <th className="px-4 py-3">Description</th>
                                <th className="px-4 py-3">{thType}</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                <tr>
                                    <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                                        Loading...
                                    </td>
                                </tr>
                            ) : services.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                                        No entries found.
                                    </td>
                                </tr>
                            ) : (
                                services.map((item) => (
                                    <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                                        <td className="px-4 py-3 font-medium">{item.description}</td>
                                        <td className="px-4 py-3">
                                            {item.contacts?.name || item.contact_name || 'Unknown'}
                                            <div className="text-xs text-muted-foreground">{item.contacts?.email}</div>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={() => openSuggestModal(item)}
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
                targetType="service"
                targetId={selectedItem?.id}
                initialData={selectedItem}
            />
        </div>
    )
}

