// The visible shortcut legend (wireframe #7's footer bar). CP2 ships the
// core verbs — J/K move, A accept, C category; CP3 appends S (split) and
// T (transfer). No E anywhere: the explain verb was cut from F3 (#15).

function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded border px-1 py-px font-mono font-semibold text-[10px] text-muted-foreground">
      {children}
    </kbd>
  )
}

export function KeyboardLegend() {
  return (
    <div
      data-testid="inbox-legend"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t bg-muted/50 px-3.5 py-2 text-[11.5px] text-muted-foreground"
    >
      <span className="flex items-center gap-1">
        <Key>J</Key>
        <Key>K</Key> move
      </span>
      <span className="flex items-center gap-1">
        <Key>A</Key> accept
      </span>
      <span className="flex items-center gap-1">
        <Key>C</Key> category
      </span>
      <span className="flex items-center gap-1">
        <Key>⇧A</Key> accept all
      </span>
    </div>
  )
}
