import { useEffect, useState, createContext } from 'react'
import { supabase } from '../lib/supabase'

interface UserProfile {
    id: string
    email: string
    org_id: string
    role: 'admin' | 'user'
}

export const UserContext = createContext<UserProfile | null>(null)

export function useUserProfile() {
    const [profile, setProfile] = useState<UserProfile | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let mounted = true

        const getProfile = async (session: any) => {
            if (!session) {
                if (mounted) {
                    setProfile(null)
                    setLoading(false)
                }
                return
            }

            try {
                const token = session.access_token
                const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/users/me`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                })

                if (res.ok) {
                    const data = await res.json()
                    if (mounted) setProfile(data)
                } else {
                    console.error("Failed to fetch profile")
                    if (mounted) setProfile(null)
                }
            } catch (e) {
                console.error(e)
                if (mounted) setProfile(null)
            } finally {
                if (mounted) setLoading(false)
            }
        }

        // 1. Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            getProfile(session)
        })

        // 2. Listen for changes (e.g. Magic Link redirect processing)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            // Only re-fetch if we have a session (to avoid race conditions)
            // or if we explicitly signed out.
            getProfile(session)
        })

        return () => {
            mounted = false
            subscription.unsubscribe()
        }
    }, [])

    return { profile, loading }
}
