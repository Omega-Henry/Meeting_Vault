import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CheckCircle2, ArrowRight, Search, RefreshCw, AlertCircle } from 'lucide-react'
import clsx from 'clsx'

// Simple API wrapper
async function searchClaims(payload: any) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error("No session")

    const baseUrl = import.meta.env.VITE_API_BASE_URL || ''

    const res = await fetch(`${baseUrl}/api/claims/search`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(payload)
    })
    if (!res.ok) throw new Error("Search failed")
    return res.json()
}

async function submitClaim(contactId: string, evidence: any) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error("No session")
    const baseUrl = import.meta.env.VITE_API_BASE_URL || ''

    const res = await fetch(`${baseUrl}/api/claims`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ contact_id: contactId, evidence })
    })
    if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || "Claim failed")
    }
    return res.json()
}

export default function Onboarding() {
    const [step, setStep] = useState<'search' | 'results' | 'success'>('search')
    const [formData, setFormData] = useState({ phone: '', email: '', name: '' })
    const [matches, setMatches] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const navigate = useNavigate()

    // Create Mode
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [newProfile, setNewProfile] = useState({ name: '', email: '', phone: '' })
    const [submitting, setSubmitting] = useState(false)

    const handleSearch = async (e: React.FormEvent) => {
        if (e) e.preventDefault()
        setLoading(true)
        setError('')
        try {
            const results = await searchClaims(formData)
            setMatches(results)
            setStep('results')
            setShowCreateForm(false)
        } catch (err: any) {
            console.error(err)
            setError("Failed to search. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    const handleClaim = async (candidate: any) => {
        setLoading(true)
        setError('')
        try {
            await submitClaim(candidate.contact.id, {
                match_type: candidate.match_type,
                user_provided: formData
            })
            setStep('success')
        } catch (err: any) {
            setError(err.message || "Failed to submit claim")
        } finally {
            setLoading(false)
        }
    }

    const handleCreateProfile = async () => {
        setSubmitting(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/claims/create-profile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify(newProfile)
            })

            if (res.ok) {
                setStep('success')
            } else {
                alert("Failed to create profile")
            }
        } catch (error) {
            console.error(error)
            alert("Error creating profile")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
            <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg overflow-hidden">
                <div className="p-6 pb-4 border-b border-border bg-background">
                    <h1 className="text-2xl font-bold tracking-tight">Welcome to MeetingVault</h1>
                    <p className="text-muted-foreground text-sm mt-1">Let's connect you to your existing profile.</p>
                </div>

                <div className="p-6">
                    {error && (
                        <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            {error}
                        </div>
                    )}

                    {step === 'search' && (
                        <form onSubmit={handleSearch} className="space-y-4">
                            <div className="space-y-2">
                                <label htmlFor="phone" className="text-sm font-medium leading-none">Phone Number</label>
                                <input
                                    id="phone"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                    placeholder="+1 (555) 000-0000"
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="email" className="text-sm font-medium leading-none">Email Address</label>
                                <input
                                    id="email"
                                    type="email"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    placeholder="you@example.com"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="name" className="text-sm font-medium leading-none">Full Name</label>
                                <input
                                    id="name"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    placeholder="John Doe"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full mt-4"
                            >
                                {loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                                Find My Profile
                            </button>
                        </form>
                    )}

                    {step === 'results' && (
                        <div className="space-y-4">
                            {!showCreateForm ? (
                                <>
                                    <p className="text-sm text-muted-foreground">
                                        We found {matches.length} potential match{matches.length !== 1 && 'es'}.
                                    </p>

                                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                                        {matches.map((item: any) => (
                                            <div key={item.contact.id} className="border border-border rounded-lg p-3 flex items-center justify-between bg-card hover:bg-muted/30 transition-colors">
                                                <div className="min-w-0 flex-1 mr-4">
                                                    <p className="font-medium truncate">{item.contact.name || "Unknown"}</p>
                                                    <div className="text-xs text-muted-foreground flex flex-col gap-0.5">
                                                        {item.contact.email && <span className="truncate">{item.contact.email}</span>}
                                                        {item.contact.phone && <span className="truncate">{item.contact.phone}</span>}
                                                    </div>
                                                    <div className="mt-1">
                                                        <span className={clsx(
                                                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                                                            item.confidence === 'High' ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                                                        )}>
                                                            {item.confidence} Confidence - {item.match_type.replace('_', ' ')}
                                                        </span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleClaim(item)}
                                                    disabled={loading}
                                                    className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 shrink-0"
                                                >
                                                    This is me
                                                </button>
                                            </div>
                                        ))}
                                        {matches.length === 0 && (
                                            <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg p-4">
                                                <p className="mb-2">No matches found.</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-6 flex flex-col gap-3">
                                        <p className="text-sm text-center text-muted-foreground">Or if you're sure you're not in the list:</p>
                                        <button
                                            onClick={() => setShowCreateForm(true)}
                                            className="w-full py-2 px-4 border border-dashed border-input rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                        >
                                            + Create a new profile
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Full Name</label>
                                        <input
                                            className="w-full px-3 py-2 rounded-md border border-input bg-background"
                                            value={newProfile.name}
                                            onChange={e => setNewProfile({ ...newProfile, name: e.target.value })}
                                            placeholder="e.g. Jane Doe"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Email</label>
                                        <input
                                            className="w-full px-3 py-2 rounded-md border border-input bg-background"
                                            value={newProfile.email}
                                            onChange={e => setNewProfile({ ...newProfile, email: e.target.value })}
                                            placeholder="e.g. jane@example.com"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Phone</label>
                                        <input
                                            className="w-full px-3 py-2 rounded-md border border-input bg-background"
                                            value={newProfile.phone}
                                            onChange={e => setNewProfile({ ...newProfile, phone: e.target.value })}
                                            placeholder="e.g. +1 555 000 0000"
                                        />
                                    </div>

                                    <div className="flex gap-3 pt-2">
                                        <button
                                            onClick={() => setShowCreateForm(false)}
                                            className="flex-1 py-2 px-4 border border-input rounded-md hover:bg-muted"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleCreateProfile}
                                            disabled={submitting || !newProfile.name}
                                            className="flex-1 py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                                        >
                                            {submitting ? 'Creating...' : 'Create & Claim'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="pt-4 flex flex-col gap-2">
                                <button
                                    onClick={() => setStep('search')}
                                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 w-full"
                                >
                                    Search Again
                                </button>
                                <button
                                    onClick={() => navigate('/app')}
                                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 w-full text-muted-foreground"
                                >
                                    Skip for now
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center space-y-4 py-6">
                            <div className="mx-auto h-16 w-16 rounded-full bg-green-100 flex items-center justify-center text-green-600 animate-in zoom-in duration-300">
                                <CheckCircle2 className="h-8 w-8" />
                            </div>
                            <div>
                                <h3 className="font-bold text-xl">Claim Request Sent!</h3>
                                <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
                                    An admin will review your request shortly. You can explore the directory while you wait.
                                </p>
                            </div>
                            <button
                                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
                                onClick={() => navigate('/app')}
                            >
                                Go to Directory <ArrowRight className="ml-2 h-4 w-4" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
