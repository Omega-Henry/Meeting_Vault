import { Link, useLocation } from 'react-router-dom'
import { X, Menu } from 'lucide-react'
import clsx from 'clsx'
import { ThemeToggle } from '../ThemeToggle'
import AccountSwitcher from '../AccountSwitcher'
import { useState } from 'react'

interface NavItem {
    name: string
    href: string
    icon: any
}

interface SidebarProps {
    title: string
    subtitle: string
    navItems: NavItem[]
}

export default function Sidebar({ title, subtitle, navItems }: SidebarProps) {
    const location = useLocation()
    const [isOpen, setIsOpen] = useState(false)

    const toggleSidebar = () => setIsOpen(!isOpen)

    return (
        <>
            {/* Mobile Header Trigger */}
            <div className="lg:hidden p-4 border-b border-border bg-card flex items-center justify-between">
                <div className="flex items-center">
                    <button onClick={toggleSidebar} className="mr-3 p-1 rounded hover:bg-muted">
                        <Menu className="h-6 w-6" />
                    </button>
                    <h1 className="font-bold">{title}</h1>
                </div>
                <ThemeToggle />
            </div>

            {/* Overlay for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sidebar Container */}
            <div className={clsx(
                "fixed lg:static inset-y-0 left-0 z-50 w-64 border-r border-border bg-card p-4 flex flex-col transition-transform duration-200 ease-in-out",
                isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
            )}>
                <div className="mb-8 flex items-center justify-between px-2">
                    <div>
                        <h1 className="text-xl font-bold">{title}</h1>
                        <span className="text-xs text-muted-foreground uppercase tracking-wider">{subtitle}</span>
                    </div>
                    {/* Only show toggle here on Desktop, or handle differently? 
                        Actually ThemeToggle is in header on mobile. Keep it here for Desktop.
                    */}
                    <div className="hidden lg:block">
                        <ThemeToggle />
                    </div>
                    {/* Close button for Mobile */}
                    <button onClick={toggleSidebar} className="lg:hidden p-1 rounded hover:bg-muted">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <nav className="space-y-1 flex-1">
                    {navItems.map((item) => {
                        const Icon = item.icon
                        // Active logic: Exact match for root, startsWith for sub-routes, but avoid partial matches like /app vs /apple
                        const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href))

                        return (
                            <Link
                                key={item.name}
                                to={item.href}
                                onClick={() => setIsOpen(false)} // Close on navigate
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
        </>
    )
}
