// client/src/components/docs-skeleton.tsx
export function DocsSkeleton() {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col space-y-6">
        {/* Header skeleton */}
        <div className="space-y-2">
          <div className="h-8 w-3/4 bg-muted rounded animate-pulse"></div>
          <div className="h-4 w-1/2 bg-muted rounded animate-pulse"></div>
        </div>
        
        {/* Content skeleton */}
        <div className="space-y-4">
          <div className="h-4 w-full bg-muted rounded animate-pulse"></div>
          <div className="h-4 w-full bg-muted rounded animate-pulse"></div>
          <div className="h-4 w-5/6 bg-muted rounded animate-pulse"></div>
          <div className="h-4 w-4/6 bg-muted rounded animate-pulse"></div>
        </div>
        
        {/* Code block skeleton */}
        <div className="h-32 w-full bg-muted rounded animate-pulse"></div>
        
        {/* More content skeleton */}
        <div className="space-y-4">
          <div className="h-4 w-full bg-muted rounded animate-pulse"></div>
          <div className="h-4 w-full bg-muted rounded animate-pulse"></div>
          <div className="h-4 w-3/4 bg-muted rounded animate-pulse"></div>
        </div>
      </div>
    </div>
  );
}