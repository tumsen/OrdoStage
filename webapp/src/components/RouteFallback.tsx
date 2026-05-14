/** Shown while a lazy route chunk is loading (keeps shell transitions fast). */
export function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center bg-gray-950">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent"
        aria-label="Loading"
      />
    </div>
  );
}
