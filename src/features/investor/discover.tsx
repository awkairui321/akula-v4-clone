import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { SECTOR_LABELS } from "@/lib/types";
import type { DiscoverCompany } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeftIcon, SearchIcon } from "lucide-react";

export default function DiscoverPage() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["discover"],
    queryFn: () => api<{ companies: DiscoverCompany[] }>("/api/v1/discover"),
  });

  const companies = data?.companies ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return companies;
    const q = search.toLowerCase();
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.codename?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        (SECTOR_LABELS[c.sector] ?? c.sector).toLowerCase().includes(q),
    );
  }, [companies, search]);

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/funds"
        className="mb-6 inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeftIcon className="size-3.5" />
        Back to opportunities
      </Link>

      <div className="mb-6 space-y-1">
        <p className="text-xs font-semibold tracking-wider text-primary uppercase">
          Potential future opportunities
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Explore companies Akula is tracking</h1>
        <p className="text-sm text-muted-foreground">Research only · no live Akula vehicle</p>
      </div>

      <div className="relative mb-6">
        <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search a company — Canva, Anduril, Mistral..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading && <p className="py-12 text-center text-muted-foreground">Loading...</p>}

      {!isLoading && filtered.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">No companies match your search.</p>
      )}

      <div className="divide-y rounded-lg border">
        {filtered.map((company) => (
          <Link
            key={company.id}
            to={`/discover/${company.id}`}
            className="flex items-center justify-between px-5 py-4 transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-muted/50"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{company.codename ?? company.name}</span>
                <Badge variant="secondary" className="text-[10px]">
                  Potential
                </Badge>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{company.description}</p>
            </div>
            <span className="ml-4 shrink-0 text-sm text-primary hover:underline">
              Explore project
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
