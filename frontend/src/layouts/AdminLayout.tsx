import { } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, MessageSquare, Users, Link as LinkIcon, Search, LogOut, CheckSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'
import clsx from 'clsx'
import AssistantPanel from '../components/AssistantPanel'
import { ThemeToggle } from '../components/ThemeToggle'
import ChatList from '../pages/ChatList'
import ChatDetail from '../pages/ChatDetail'
import ContactsTable from '../pages/ContactsTable'
import ServicesTable from '../pages/ServicesTable'
import LinksTable from '../pages/LinksTable'
import GlobalSearch from '../pages/GlobalSearch'
import RequestsTable from '../pages/admin/RequestsTable'

export default function AdminLayout() {
    const location = useLocation()

    const navItems = [
        { name: 'Chats', href: '/admin', icon: MessageSquare },
        { name: 'Requests', href: '/admin/requests', icon: CheckSquare },
        { name: 'Contacts', href: '/admin/contacts', icon: Users },
        { name: 'Services', href: '/admin/services', icon: LayoutDashboard },
        { name: 'Links', href: '/admin/links', icon: LinkIcon },
        { name: 'Search', href: '/admin/search', icon: Search },
    ]

    return (
        <div className="flex h-screen bg-background text-foreground">
            {/* Sidebar */}
            <div className="w-64 border-r border-border bg-card p-4 flex flex-col">
                <div className="mb-8 px-2">
                    <div className="flex items-center justify-between">
                        <h1 className="text-xl font-bold">MeetingVault</h1>
                        <ThemeToggle />
                    </div>
                    <p className="text-xs text-muted-foreground font-medium mt-1">ADMIN PORTAL</p>
                </div>

                <nav className="space-y-1 flex-1">
                    {navItems.map((item) => {
                        const Icon = item.icon
                        const isActive = location.pathname === item.href || (item.href !== '/admin' && location.pathname.startsWith(item.href))
                        return (
                            <Link
                                key={item.name}
                                to={item.href}
                                className={clsx(
                                    'flex items-center rounded-md px-2 py-2 text-sm font-medium transition-colors',
                                    isActive
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                )}
                            >
                                <Icon className="mr-3 h-5 w-5" />
                                {item.name}
                            </Link>
                        )
                    })}
                </nav>

                <div className="mt-auto border-t border-border pt-4">
                    <button
                        onClick={() => supabase.auth.signOut()}
                        className="flex w-full items-center rounded-md px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                        <LogOut className="mr-3 h-5 w-5" />
                        Sign Out
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto p-8">
                <Routes>
                    <Route path="/" element={<ChatList />} />
                    <Route path="chats/:id" element={<ChatDetail />} />
                    <Route path="requests" element={<RequestsTable />} />
                    <Route path="contacts" element={<ContactsTable />} />
                    <Route path="services" element={<ServicesTable />} />
                    <Route path="links" element={<LinksTable />} />
                    <Route path="search" element={<GlobalSearch />} />
                </Routes>
            </div>

            {/* Assistant Panel */}
            <div className="w-96 border-l border-border bg-card">
                <AssistantPanel />
            </div>
        </div>
    )
}
