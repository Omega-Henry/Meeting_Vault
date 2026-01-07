import { Routes, Route } from 'react-router-dom'
import { LayoutDashboard, MessageSquare, Users, Link as LinkIcon, Search, CheckSquare, Database, Briefcase, ScrollText, TerminalSquare } from 'lucide-react'
import AssistantPanel from '../components/AssistantPanel'
import ChatList from '../pages/ChatList'
import ChatDetail from '../pages/ChatDetail'
import ContactsTable from '../pages/ContactsTable'
import ServicesTable from '../pages/ServicesTable'
import LinksTable from '../pages/LinksTable'
import GlobalSearch from '../pages/GlobalSearch'
import RequestsQueue from '../pages/admin/RequestsQueue'
import DatabaseEditor from '../pages/admin/DatabaseEditor'
import AdminFeedback from '../pages/admin/AdminFeedback'
import Sidebar from '../components/layout/Sidebar'
import ResizableAside from '../components/layout/ResizableAside'
import Dashboard from '../pages/Dashboard'
import AuditLogViewer from '../pages/admin/AuditLogViewer'
import ExtractionReview from '../pages/admin/ExtractionReview'

export default function AdminLayout() {
    const navItems = [
        { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
        { name: 'Chats', href: '/admin/chats', icon: MessageSquare },
        { name: 'Requests', href: '/admin/requests', icon: CheckSquare },
        { name: 'Contacts', href: '/admin/contacts', icon: Users },
        { name: 'Services', href: '/admin/services', icon: Briefcase },
        { name: 'Links', href: '/admin/links', icon: LinkIcon },
        { name: 'Database', href: '/admin/database', icon: Database },
        { name: 'Audit Logs', href: '/admin/audit', icon: ScrollText },
        { name: 'Data Review', href: '/admin/review', icon: CheckSquare },
        { name: 'Prompts', href: '/admin/prompts', icon: TerminalSquare },
        { name: 'Feedback', href: '/admin/feedback', icon: MessageSquare },
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
                    <Route path="requests" element={<RequestsQueue />} />
                    <Route path="database" element={<DatabaseEditor />} />
                    <Route path="contacts" element={<ContactsTable />} />
                    <Route path="services" element={<ServicesTable />} />
                    <Route path="links" element={<LinksTable />} />
                    <Route path="audit" element={<AuditLogViewer />} />
                    <Route path="review" element={<ExtractionReview />} />
                    <Route path="prompts" element={<div className="p-8">Prompts Placeholder</div>} />
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
