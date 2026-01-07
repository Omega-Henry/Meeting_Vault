import { } from 'react'
import { Routes, Route } from 'react-router-dom'
import { LayoutDashboard, MessageSquare, Users, Link as LinkIcon, Search, CheckSquare, Database, Briefcase } from 'lucide-react'
import AssistantPanel from '../components/AssistantPanel'
import ChatList from '../pages/ChatList'
import ChatDetail from '../pages/ChatDetail'
import ContactsTable from '../pages/ContactsTable'
import ServicesTable from '../pages/ServicesTable'
import LinksTable from '../pages/LinksTable'
import GlobalSearch from '../pages/GlobalSearch'
import RequestsTable from '../pages/admin/RequestsTable'
import DatabaseEditor from '../pages/admin/DatabaseEditor'
import AdminFeedback from '../pages/admin/AdminFeedback'
import Sidebar from '../components/layout/Sidebar'
import ResizableAside from '../components/layout/ResizableAside'
import Dashboard from '../pages/Dashboard'

export default function AdminLayout() {
    const navItems = [
        { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
        { name: 'Chats', href: '/admin/chats', icon: MessageSquare },
        { name: 'Requests', href: '/admin/requests', icon: CheckSquare },
        { name: 'Contacts', href: '/admin/contacts', icon: Users },
        { name: 'Services', href: '/admin/services', icon: Briefcase }, // Changed icon to Briefcase to match user layout
        { name: 'Links', href: '/admin/links', icon: LinkIcon },
        { name: 'Database', href: '/admin/database', icon: Database },
        { name: 'Feedback', href: '/admin/feedback', icon: MessageSquare }, // Keep message square, maybe duplicates icon but fine
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
                    <Route path="/" element={<Dashboard />} />
                    <Route path="chats" element={<ChatList />} />
                    <Route path="chats/:id" element={<ChatDetail />} />
                    <Route path="requests" element={<RequestsTable />} />
                    <Route path="database" element={<DatabaseEditor />} />
                    <Route path="contacts" element={<ContactsTable />} />
                    <Route path="services" element={<ServicesTable />} />
                    <Route path="links" element={<LinksTable />} />
                    <Route path="feedback" element={<AdminFeedback />} />
                    <Route path="search" element={<GlobalSearch />} />
                </Routes>
            </div>

            {/* Assistant Panel - Hidden on mobile for now */}
            <div className="hidden lg:block h-full">
                <ResizableAside>
                    <AssistantPanel />
                </ResizableAside>
            </div>
        </div>
    )
}
