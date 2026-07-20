import { Skeleton } from '@/components/ui/skeleton'

function SectionSkeleton({ className = '', bodyHeight = 'h-40' }: { className?: string; bodyHeight?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
      <Skeleton className="mb-4 h-4 w-40" />
      <Skeleton className={bodyHeight} />
    </div>
  )
}

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <Skeleton className="mb-3 h-8 w-8 rounded-lg" />
            <Skeleton className="h-7 w-2/3" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>

      <SectionSkeleton bodyHeight="h-16" />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionSkeleton />
        <SectionSkeleton />
      </div>

      <SectionSkeleton bodyHeight="h-32" />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionSkeleton />
        <SectionSkeleton />
      </div>
    </div>
  )
}
