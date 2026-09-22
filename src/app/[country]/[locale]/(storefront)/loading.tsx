export default function StorefrontLoading() {
  return (
    <div
      aria-hidden="true"
      className="min-h-[68dvh] bg-background"
    >
      <div className="container mx-auto px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <div className="max-w-6xl space-y-8">
          <div className="h-8 w-64 max-w-[70%] rounded-xl bg-muted" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="h-40 rounded-2xl bg-muted/70" />
            <div className="h-40 rounded-2xl bg-muted/70" />
            <div className="hidden h-40 rounded-2xl bg-muted/70 lg:block" />
          </div>
        </div>
      </div>
    </div>
  );
}
