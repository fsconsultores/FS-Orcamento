export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-24 rounded-md bg-gray-200 animate-pulse" />
          <div className="h-4 w-48 rounded bg-gray-100 animate-pulse" />
        </div>
        <div className="h-9 w-32 rounded-md bg-gray-200 animate-pulse" />
      </div>

      <div className="h-10 w-full rounded-lg bg-gray-100 animate-pulse" />

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="h-10 border-b bg-gray-50" />
        <div className="divide-y">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-2">
              <div className="h-4 w-20 rounded bg-gray-100 animate-pulse" />
              <div className="h-4 flex-1 rounded bg-gray-200 animate-pulse" />
              <div className="h-4 w-16 rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-14 rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-20 rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-20 rounded bg-gray-100 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
