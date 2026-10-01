import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatPricePrecise } from "@/lib/currency";

type TickerItem = {
  asset_name: string;
  class_type: string;
  currency: string;
  price_per_share: string;
  price_type: string;
  as_of_date: string;
};

function TickerItemDisplay({ item }: { item: TickerItem }) {
  return (
    <span className="inline-flex items-center gap-2 px-6 whitespace-nowrap">
      <span className="font-semibold text-foreground">{item.asset_name}</span>
      <span className="text-xs text-muted-foreground uppercase">{item.class_type}</span>
      <span className="font-mono text-foreground">{formatPricePrecise(item.price_per_share)}</span>
    </span>
  );
}

export function Ticker() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: items = [] } = useQuery({
    queryKey: ["ticker"],
    queryFn: () => api<TickerItem[]>("/api/v1/public/ticker"),
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || items.length === 0) return;

    let animationId: number;
    let position = 0;

    function step() {
      position -= 0.5;
      if (el) {
        const halfWidth = el.scrollWidth / 2;
        if (Math.abs(position) >= halfWidth) {
          position = 0;
        }
        el.style.transform = `translateX(${position}px)`;
      }
      animationId = requestAnimationFrame(step);
    }

    animationId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationId);
  }, [items]);

  if (items.length === 0) return null;

  const doubled = [...items, ...items];

  return (
    <div className="w-full overflow-hidden border-b bg-muted/30 py-2.5">
      <div ref={scrollRef} className="flex will-change-transform">
        {doubled.map((item, i) => (
          <TickerItemDisplay key={i} item={item} />
        ))}
      </div>
    </div>
  );
}
