import { } from 'react'
import { Routes, Route } from 'react-router-dom'
import { LayoutDashboard, Users, CheckSquare } from 'lucide-react'
import AssistantPanel from '../components/AssistantPanel'
import UserContacts from '../pages/user/UserContacts'
import UserServices from '../pages/user/UserServices'
import Sidebar from '../components/layout/Sidebar'

export default function UserLayout() {
    const navItems = [
        { name: 'Offers', href: '/app/offers', icon: LayoutDashboard },
        { name: 'Requests', href: '/app/requests', icon: CheckSquare },
        { name: 'Contacts', href: '/app/contacts', icon: Users },
    ]

    return (
        <div className="flex flex-col lg:flex-row h-screen bg-background text-foreground">
            <Sidebar
                title="MeetingVault"
                subtitle="MEMBER PORTAL"
                navItems={navItems}
            />

            {/* Main Content */}
            <div className="flex-1 overflow-auto p-4 lg:p-8">
                <Routes>
                    <Route path="/offers" element={<UserServices type="offer" />} />
                    <Route path="/requests" element={<UserServices type="request" />} />
                    <Route path="/contacts" element={<UserContacts />} />
                    <Route path="/*" element={<UserServices type="offer" />} />
                </Routes>
            </div>

            {/* Assistant Panel - Hidden on mobile for now */}
            <div className="hidden lg:block w-96 border-l border-border bg-card">
                <AssistantPanel />
            </div>
        </div>
    )
}
