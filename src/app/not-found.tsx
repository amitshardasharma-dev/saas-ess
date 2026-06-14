export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <p className="text-muted-foreground">Page not found</p>
        <a href="/dashboard" className="text-primary hover:underline mt-4 inline-block">
          Go to Dashboard
        </a>
      </div>
    </div>
  )
}
