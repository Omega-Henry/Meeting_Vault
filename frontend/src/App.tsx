import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import AdminLayout from './layouts/AdminLayout'
import UserLayout from './layouts/UserLayout'
import { ThemeProvider } from './components/ThemeProvider'
import { useUserProfile } from './hooks/useUserContext'

function App() {
    const { profile, loading } = useUserProfile()

    if (loading) {
        return <div className="flex h-screen items-center justify-center bg-background text-foreground">Loading...</div>
    }

    return (
        <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
            <Router>
                <Routes>
                    <Route path="/login" element={!profile ? <Login /> : <Navigate to="/" />} />

                    {/* Admin Routes */}
                    <Route path="/admin/*" element={
                        profile?.role === 'admin' ? <AdminLayout /> : <Navigate to="/" />
                    } />

                    {/* User Routes */}
                    <Route path="/app/*" element={
                        profile ? <UserLayout /> : <Navigate to="/login" />
                    } />

                    {/* Root Redirect */}
                    <Route path="/" element={
                        !profile ? <Navigate to="/login" /> :
                            profile.role === 'admin' ? <Navigate to="/admin" /> :
                                <Navigate to="/app/offers" />
                    } />
                </Routes>
            </Router>
        </ThemeProvider>
    )
}

export default App
