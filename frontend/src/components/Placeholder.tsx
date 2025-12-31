export default function Placeholder({ title }: { title: string }) {
    return (
        <div className="p-8 text-center text-muted-foreground">
            <h2 className="text-2xl font-bold mb-4">{title}</h2>
            <p>This view is under construction.</p>
        </div>
    )
}
