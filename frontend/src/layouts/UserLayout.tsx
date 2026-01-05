import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { LayoutDashboard, Users, CheckSquare, MessageSquare } from 'lucide-react'
import AssistantPanel from '../components/AssistantPanel'
import UserContacts from '../pages/user/UserContacts'
import UserServices from '../pages/user/UserServices'
import ChatList from '../pages/ChatList'
import ChatDetail from '../pages/ChatDetail'
import Sidebar from '../components/layout/Sidebar'
import ResizableAside from '../components/layout/ResizableAside'
import FeedbackModal from '../components/FeedbackModal'

export default function UserLayout() {
    const navItems = [
        { name: 'Offers', href: '/app/offers', icon: LayoutDashboard },
        { name: 'Requests', href: '/app/requests', icon: CheckSquare },
        { name: 'Contacts', href: '/app/contacts', icon: Users },
        { name: 'Chats', href: '/app/chats', icon: MessageSquare }, // Added Chats
    ]


    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)

    return (
        <div className="flex flex-col lg:flex-row h-screen bg-background text-foreground">
            <Sidebar
                title="MeetingVault"
                subtitle="MEMBER PORTAL"
                navItems={navItems}
                footerSlot={
                    <button
                        onClick={() => setIsFeedbackOpen(true)}
                        className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md w-full transition-colors"
                    >
                        <MessageSquare className="h-4 w-4" />
                        Feedback
                    </button>
                }
            />

            {/* Main Content */}
            <div className="flex-1 overflow-auto p-4 lg:p-8">
                <Routes>
                    <Route path="/offers" element={<UserServices type="offer" />} />
                    <Route path="/requests" element={<UserServices type="request" />} />
                    <Route path="/contacts" element={<UserContacts />} />
                    <Route path="chats" element={<ChatList />} />
                    <Route path="chats/:id" element={<ChatDetail />} />
                    <Route path="/*" element={<UserServices type="offer" />} />
                </Routes>
            </div>

            {/* Assistant Panel - Hidden on mobile for now */}
            <div className="hidden lg:block h-full">
                <ResizableAside>
                    <AssistantPanel />
                </ResizableAside>
            </div>

            <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
        </div>
    )
}
