import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { ContactDetail } from '../../components/ContactDetail'
import { User, Loader2 } from 'lucide-react'

export default function MyProfile() {
    const [loading, setLoading] = useState(true)
    const [profileData, setProfileData] = useState<any>(null)
    const [isClaimed, setIsClaimed] = useState(false)
    const [detailOpen, setDetailOpen] = useState(false)

    useEffect(() => {
        fetchProfile()
    }, [])

    const fetchProfile = async () => {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/profiles/me`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            })
            if (res.ok) {
                const data = await res.json()
                setIsClaimed(data.claimed)
                if (data.claimed) {
                    setProfileData(data.contact)
                    // Auto open details ? Or show summary card?
                }
            }
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (!isClaimed) {
        return (
            <div className="max-w-2xl mx-auto py-12 text-center">
                <div className="mx-auto h-24 w-24 bg-muted rounded-full flex items-center justify-center mb-6">
                    <User className="h-10 w-10 text-muted-foreground" />
                </div>
                <h1 className="text-2xl font-bold">No Profile Linked</h1>
                <p className="text-muted-foreground mt-2 mb-6">
                    You haven't claimed a profile yet. Find your contact card to see it here.
                </p>
                <a
                    href="/onboarding"
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground h-10 px-6 py-2"
                >
                    Find My Profile
                </a>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>

            <div className="bg-card border border-border rounded-lg p-6 flex flex-col items-center sm:flex-row sm:items-start gap-6">
                <div className="h-24 w-24 rounded-full bg-muted overflow-hidden border-2 border-background shadow-sm shrink-0">
                    {profileData.profile?.avatar_url ? (
                        <img src={profileData.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                        <div className="h-full w-full flex items-center justify-center text-2xl font-bold text-muted-foreground bg-muted">
                            {profileData.name?.substring(0, 2).toUpperCase()}
                        </div>
                    )}
                </div>

                <div className="flex-1 text-center sm:text-left space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                        <h2 className="text-2xl font-bold">{profileData.name}</h2>
                        {profileData.is_unverified && (
                            <span className="inline-flex items-center rounded-full border border-destructive/50 px-2.5 py-0.5 text-xs font-semibold bg-destructive/10 text-destructive self-center sm:self-auto">
                                Unverified
                            </span>
                        )}
                    </div>
                    <p className="text-muted-foreground">{profileData.profile?.bio || "No bio set."}</p>

                    <div className="pt-4 flex justify-center sm:justify-start">
                        <button
                            onClick={() => setDetailOpen(true)}
                            className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
                        >
                            View & Edit Details
                        </button>
                    </div>
                </div>
            </div>

            <ContactDetail
                contact={profileData}
                isOpen={detailOpen}
                onClose={() => setDetailOpen(false)}
                editable={true} // Allow editing since it's "Me"
            />
        </div>
    )
}
