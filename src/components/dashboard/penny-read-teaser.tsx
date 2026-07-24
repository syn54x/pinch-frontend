// Penny's read (wireframe s6, PRD Decision 4): the F6 slot kept warm. A static
// teaser — Penny dot, header, still skeleton lines (NO animate-pulse; nothing
// is loading), a "Coming soon" chip, non-interactive. This is the one
// sanctioned light-mode purple surface; nothing lives behind it yet.
export function PennyReadTeaser() {
  return (
    <section
      data-testid="dashboard-penny-read"
      aria-label="Penny's read — coming soon"
      className="flex flex-1 flex-col gap-2.5 rounded-xl bg-penny/5 p-4 ring-1 ring-penny/15 dark:bg-penny/10"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="size-5 rounded-full bg-penny" />
        <span className="font-medium text-sm">Penny's read</span>
        <span className="ml-auto rounded-full bg-penny/15 px-2 py-0.5 text-[10.5px] font-medium text-penny">
          Coming soon
        </span>
      </div>
      <div aria-hidden className="mt-1 flex flex-col gap-2">
        <SkeletonLine width="100%" />
        <SkeletonLine width="92%" />
        <SkeletonLine width="70%" />
        <SkeletonLine width="88%" faint />
        <SkeletonLine width="54%" faint />
      </div>
      <p className="mt-auto text-[11.5px] text-muted-foreground">
        A plain-language monthly summary of your money, auto-generated.
      </p>
    </section>
  )
}

function SkeletonLine({ width, faint }: { width: string; faint?: boolean }) {
  return (
    <span
      className={
        faint ? 'h-2 rounded-full bg-penny/10' : 'h-2 rounded-full bg-penny/20'
      }
      style={{ width }}
    />
  )
}
