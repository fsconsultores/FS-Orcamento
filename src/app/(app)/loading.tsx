export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 rounded-md bg-gray-200 animate-pulse" />
      <div className="h-4 w-64 rounded bg-gray-100 animate-pulse" />
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="border-b px-4 py-3">
          <div className="h-5 w-32 rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="divide-y">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-4 w-24 rounded bg-gray-100 animate-pulse" />
              <div className="h-4 flex-1 rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-16 rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-20 rounded bg-gray-100 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}