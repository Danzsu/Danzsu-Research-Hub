import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      // Upstream shadcn uses `bg-accent`. In this theme `--accent` is the
      // signal orange (#f15f22), which would make every skeleton pulse bright
      // orange, so this uses the ink-based neutral instead.
      className={cn("animate-pulse rounded-md bg-primary/10", className)}
      {...props}
    />
  )
}

export { Skeleton }
