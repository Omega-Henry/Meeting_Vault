import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link, useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'

export default function ServicesTable() {
    const [services, setServices] = useState<any[]>([])
    const [filter, setFilter] = useState('all')
    const [loading, setLoading] = useState(true)
    const [searchParams, setSearchParams] = useSearchParams()
    const contactId = searchParams.get('contact_id')

    useEffect(() => {
        const fetchServices = async () => {
            let query = supabase
                .from('services')
                .select('*, contacts(name, email), meeting_chats(meeting_name)')
                .order('created_at', { ascending: false })

            if (filter !== 'all') {
                query = query.eq('type', filter)
            }

            if (contactId) {
                query = query.eq('contact_id', contactId)
            }

            const { data } = await query
            if (data) setServices(data)
            setLoading(false)
        }

        fetchServices()
    }, [filter, contactId])

    const clearContactFilter = () => {
        setSearchParams({})
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <h2 className="text-2xl font-bold">Services</h2>
                    {contactId && (
                        <div className="flex items-center bg-muted px-3 py-1 rounded-full text-sm">
                            <span className="mr-2">Filtered by Contact</span>
                            <button onClick={clearContactFilter} className="hover:text-destructive">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </div>
                <select
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                >
                    <option value="all">All Types</option>
                    <option value="offer">Offers</option>
                    <option value="request">Requests</option>
                </select>
            </div>

            <div className="rounded-md border">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                            <th className="px-4 py-3 font-medium">Type</th>
                            <th className="px-4 py-3 font-medium">Description</th>
                            <th className="px-4 py-3 font-medium">Contact</th>
                            <th className="px-4 py-3 font-medium">Meeting</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {loading ? (
                            <tr><td colSpan={4} className="p-4 text-center">Loading...</td></tr>
                        ) : services.length === 0 ? (
                            <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No services found</td></tr>
                        ) : (
                            services.map((service) => (
                                <tr key={service.id} className="hover:bg-muted/50">
                                    <td className="px-4 py-3">
                                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${service.type === 'offer' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                                            }`}>
                                            {service.type.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 max-w-md truncate" title={service.description}>
                                        {service.description}
                                    </td>
                                    <td className="px-4 py-3">
                                        {service.contacts ? (
                                            <Link to={`/contacts?search=${service.contacts.name}`} className="hover:underline text-primary">
                                                {service.contacts.name || service.contacts.email || 'Unknown'}
                                            </Link>
                                        ) : 'Unknown'}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {service.meeting_chats?.meeting_name || 'Deleted'}
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
