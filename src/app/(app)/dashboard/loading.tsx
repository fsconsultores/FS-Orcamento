function Card({ className = '' }: { className?: string }) {
  return <div className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm animate-pulse ${className}`}>
    <div className="h-4 w-24 rounded bg-gray-100 mb-3" />
    <div className="h-4 w-3/4 rounded bg-gray-100 mb-2" />
    <div className="h-4 w-1/2 rounded bg-gray-100" />
  </div>
}

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-24 rounded-md bg-gray-200 animate-pulse" />
        <div className="h-4 w-48 rounded bg-gray-100 animate-pulse" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="h-5 w-28 rounded bg-gray-200 animate-pulse mb-4" />
        <div className="h-9 w-52 rounded-md bg-gray-200 animate-pulse" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card />
        <Card />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card />
        <Card />
        <Card />
        <Card className="sm:col-span-2 lg:col-span-3" />
      </div>
    </div>
  );
}
