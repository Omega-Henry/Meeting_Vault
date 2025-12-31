import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { Session } from '@supabase/supabase-js'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import { ThemeProvider } from './components/ThemeProvider'

function App() {
    const [session, setSession] = useState<Session | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            setLoading(false)
        })

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
        })

        return () => subscription.unsubscribe()
    }, [])

    if (loading) {
        return <div className="flex h-screen items-center justify-center">Loading...</div>
    }

    return (
        <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
            <Router>
                <Routes>
                    <Route path="/login" element={!session ? <Login /> : <Navigate to="/" />} />
                    <Route path="/*" element={session ? <Dashboard /> : <Navigate to="/login" />} />
                </Routes>
            </Router>
        </ThemeProvider>
    )
}

export default App
