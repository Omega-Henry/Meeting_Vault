import { } from 'react'
import { Routes, Route } from 'react-router-dom'
import { LayoutDashboard, MessageSquare, Users, Link as LinkIcon, Search, CheckSquare, Database } from 'lucide-react'
import AssistantPanel from '../components/AssistantPanel'
import ChatList from '../pages/ChatList'
import ChatDetail from '../pages/ChatDetail'
import ContactsTable from '../pages/ContactsTable'
import ServicesTable from '../pages/ServicesTable'
import LinksTable from '../pages/LinksTable'
import GlobalSearch from '../pages/GlobalSearch'
import RequestsTable from '../pages/admin/RequestsTable'
import DatabaseEditor from '../pages/admin/DatabaseEditor'
import Sidebar from '../components/layout/Sidebar'

export default function AdminLayout() {
    const navItems = [
        { name: 'Chats', href: '/admin', icon: MessageSquare },
        { name: 'Requests', href: '/admin/requests', icon: CheckSquare },
        { name: 'Contacts', href: '/admin/contacts', icon: Users },
        { name: 'Services', href: '/admin/services', icon: LayoutDashboard },
        { name: 'Links', href: '/admin/links', icon: LinkIcon },
        { name: 'Database', href: '/admin/database', icon: Database },
        { name: 'Search', href: '/admin/search', icon: Search },
    ]

    return (
        <div className="flex flex-col lg:flex-row h-screen bg-background text-foreground">
            <Sidebar
                title="MeetingVault"
                subtitle="ADMIN PORTAL"
                navItems={navItems}
            />

            {/* Main Content */}
            <div className="flex-1 overflow-auto p-4 lg:p-8">
                <Routes>
                    <Route path="/" element={<ChatList />} />
                    <Route path="chats/:id" element={<ChatDetail />} />
                    <Route path="requests" element={<RequestsTable />} />
                    <Route path="database" element={<DatabaseEditor />} />
                    <Route path="contacts" element={<ContactsTable />} />
                    <Route path="services" element={<ServicesTable />} />
                    <Route path="links" element={<LinksTable />} />
                    <Route path="search" element={<GlobalSearch />} />
                </Routes>
            </div>

            {/* Assistant Panel - Hidden on mobile for now */}
            <div className="hidden lg:block w-96 border-l border-border bg-card">
                <AssistantPanel />
            </div>
        </div>
    )
}
