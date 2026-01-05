import { } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Users, CheckSquare } from 'lucide-react'
import clsx from 'clsx'
import AssistantPanel from '../components/AssistantPanel'
import { ThemeToggle } from '../components/ThemeToggle'
import AccountSwitcher from '../components/AccountSwitcher'
import UserContacts from '../pages/user/UserContacts'
import UserServices from '../pages/user/UserServices'

export default function UserLayout() {
    const location = useLocation()

    const navItems = [
        { name: 'Offers', href: '/app/offers', icon: LayoutDashboard },
        { name: 'Requests', href: '/app/requests', icon: CheckSquare },
        { name: 'Contacts', href: '/app/contacts', icon: Users },
    ]

    return (
        <div className="flex h-screen bg-background text-foreground">
            {/* Sidebar */}
            <div className="w-64 border-r border-border bg-card p-4 flex flex-col">
                <div className="mb-8 flex items-center justify-between px-2">
                    <div>
                        <h1 className="text-xl font-bold">MeetingVault</h1>
                        <span className="text-xs text-muted-foreground uppercase tracking-wider">MEMBER PORTAL</span>
                    </div>
                    <ThemeToggle />
                </div>

                <nav className="space-y-1 flex-1">
                    {navItems.map((item) => {
                        const Icon = item.icon
                        const isActive = location.pathname.startsWith(item.href)
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

                <div className="mt-auto border-t border-border pt-4 px-2">
                    <AccountSwitcher />
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto p-8">
                <Routes>
                    <Route path="/offers" element={<UserServices type="offer" />} />
                    <Route path="/requests" element={<UserServices type="request" />} />
                    <Route path="/contacts" element={<UserContacts />} />
                    <Route path="/*" element={<UserServices type="offer" />} />
                </Routes>
            </div>

            {/* Assistant Panel - Shared with User */}
            <div className="w-96 border-l border-border bg-card">
                <AssistantPanel />
            </div>
        </div>
    )
}
