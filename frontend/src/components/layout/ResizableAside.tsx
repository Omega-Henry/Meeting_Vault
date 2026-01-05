import { useState, useCallback, useEffect } from 'react'
import clsx from 'clsx'
import { GripVertical } from 'lucide-react'

interface ResizableAsideProps {
    children: React.ReactNode
    className?: string
    minWidth?: number
    maxWidth?: number
    defaultWidth?: number
}

export default function ResizableAside({
    children,
    className,
    minWidth = 300,
    maxWidth = 600,
    defaultWidth = 384 // w-96
}: ResizableAsideProps) {
    const [width, setWidth] = useState(defaultWidth)
    const [isDragging, setIsDragging] = useState(false)

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true)
        e.preventDefault()
    }

    const handleMouseUp = useCallback(() => {
        setIsDragging(false)
    }, [])

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (isDragging) {
            // Calculate new width: window width - mouse X
            // Assuming sidebar is on the right
            const newWidth = window.innerWidth - e.clientX
            if (newWidth >= minWidth && newWidth <= maxWidth) {
                setWidth(newWidth)
            }
        }
    }, [isDragging, minWidth, maxWidth])

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove)
            window.addEventListener('mouseup', handleMouseUp)
        } else {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isDragging, handleMouseMove, handleMouseUp])

    return (
        <div
            className={clsx("relative flex h-full bg-card border-l border-border", className)}
            style={{ width: `${width}px` }}
        >
            {/* Drag Handle */}
            <div
                className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-primary/50 group z-50 flex items-center justify-center -ml-0.5 transition-colors"
                onMouseDown={handleMouseDown}
            >
                <div className="h-8 w-4 bg-background border border-border shadow-sm rounded-full absolute -left-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                    <GripVertical className="h-3 w-3 text-muted-foreground" />
                </div>
            </div>

            <div className="flex-1 w-full h-full overflow-hidden">
                {children}
            </div>

            {isDragging && (
                <div className="fixed inset-0 z-50 cursor-ew-resize select-none" />
            )}
        </div>
    )
}
