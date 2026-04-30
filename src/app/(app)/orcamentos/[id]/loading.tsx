export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-4 w-20 rounded bg-gray-100 animate-pulse" />
          <div className="h-8 w-72 rounded-md bg-gray-200 animate-pulse" />
          <div className="h-4 w-48 rounded bg-gray-100 animate-pulse" />
        </div>
        <div className="text-right space-y-1">
          <div className="h-4 w-20 rounded bg-gray-100 animate-pulse ml-auto" />
          <div className="h-8 w-32 rounded-md bg-gray-200 animate-pulse" />
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="border-b px-4 py-3">
          <div className="h-5 w-40 rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="divide-y">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4">
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-48 rounded bg-gray-200 animate-pulse" />
                <div className="h-3 w-20 rounded bg-gray-100 animate-pulse" />
              </div>
              <div className="h-4 w-10 rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-14 rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-20 rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-12 rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="h-5 w-28 rounded bg-gray-200 animate-pulse mb-4" />
        <div className="flex gap-3">
          <div className="h-9 flex-1 rounded-md bg-gray-100 animate-pulse" />
          <div className="h-9 w-24 rounded-md bg-gray-100 animate-pulse" />
          <div className="h-9 w-28 rounded-md bg-gray-100 animate-pulse" />
          <div className="h-9 w-24 rounded-md bg-gray-200 animate-pulse" />
        </div>
      </div>
    </div>
  );
}