import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { sweepRfqDeadlinesFn } from "@/lib/procurement.functions";
import { dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  rfq_id: string | null;
  read_at: string | null;
  created_at: string;
};

/** Bell for procurement: quote arrivals, full response sets, deadline lapses. */
export function NotificationBell({ className }: { className?: string } = {}) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, kind, title, body, rfq_id, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return data as Notification[];
    },
    refetchInterval: 30_000,
  });

  // Deadlines are time-based, so check for lapsed RFQs whenever procurement looks.
  useEffect(() => {
    sweepRfqDeadlinesFn()
      .then((r) => {
        if (r.closed) void queryClient.invalidateQueries();
      })
      .catch(() => {});
  }, [queryClient]);

  const markRead = useMutation({
    mutationFn: async () => {
      const unread = (data ?? []).filter((n) => !n.read_at).map((n) => n.id);
      if (!unread.length) return;
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", unread);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = (data ?? []).filter((n) => !n.read_at).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread ? `${unread} unread notifications` : "Notifications"}
          className={cn(
            "relative flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/12 hover:border-white/20 hover:text-white transition-all shadow-xs cursor-pointer active:scale-95 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/50",
            className,
          )}
        >
          <Bell className="h-4 w-4" aria-hidden />
          {unread ? (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#E5484D] px-1 text-[9px] font-bold leading-none text-white shadow-xs">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,90vw)] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="data-label">Supplier activity</span>
          {unread ? (
            <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => markRead.mutate()}>
              Mark all read
            </Button>
          ) : null}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {!data?.length ? (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              Nothing yet. You'll be alerted here as each supplier quote arrives, when everyone has
              responded, and when a deadline passes.
            </p>
          ) : (
            data.map((n) => {
              const inner = (
                <>
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body ? <p className="text-xs text-muted-foreground">{n.body}</p> : null}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {dateTime(n.created_at)}
                  </p>
                </>
              );
              const className = `block border-b border-border px-3 py-2.5 text-left ${
                n.read_at ? "" : "bg-signal/5"
              }`;
              return n.rfq_id ? (
                <Link key={n.id} to="/rfqs/$id" params={{ id: n.rfq_id }} className={className}>
                  {inner}
                </Link>
              ) : (
                <div key={n.id} className={className}>
                  {inner}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
