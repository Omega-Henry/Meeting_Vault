import { } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, MessageSquare, Users, Link as LinkIcon, Search, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import clsx from 'clsx'
import AssistantPanel from '../components/AssistantPanel'
import { ThemeToggle } from '../components/ThemeToggle'
import ChatList from './ChatList'
import ChatDetail from './ChatDetail'
import ContactsTable from './ContactsTable'
import ServicesTable from './ServicesTable'
import LinksTable from './LinksTable'
import GlobalSearch from './GlobalSearch'

export default function Dashboard() {
    const location = useLocation()

    const navItems = [
        { name: 'Chats', href: '/', icon: MessageSquare },
        { name: 'Contacts', href: '/contacts', icon: Users },
        { name: 'Services', href: '/services', icon: LayoutDashboard },
        { name: 'Links', href: '/links', icon: LinkIcon },
        { name: 'Search', href: '/search', icon: Search },
    ]

    return (
        <div className="flex h-screen bg-background text-foreground">
            {/* Sidebar */}
            <div className="w-64 border-r border-border bg-card p-4 flex flex-col">
                <div className="mb-8 flex items-center justify-between px-2">
                    <h1 className="text-xl font-bold">MeetingVault</h1>
                    <ThemeToggle />
                </div>

                <nav className="space-y-1 flex-1">
                    {navItems.map((item) => {
                        const Icon = item.icon
                        const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href))
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
                    <Route path="/chats/:id" element={<ChatDetail />} />
                    <Route path="/contacts" element={<ContactsTable />} />
                    <Route path="/services" element={<ServicesTable />} />
                    <Route path="/links" element={<LinksTable />} />
                    <Route path="/search" element={<GlobalSearch />} />
                </Routes>
            </div>

            {/* Assistant Panel */}
            <div className="w-96 border-l border-border bg-card">
                <AssistantPanel />
            </div>
        </div>
    )
}
