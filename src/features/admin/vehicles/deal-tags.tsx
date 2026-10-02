import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { Fund, Tag } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Free-form tags: LUCA writes its own; there is no preset list to pick from. */
export default function DealTags({ fund }: { fund: Fund }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "funds"] });
    queryClient.invalidateQueries({ queryKey: ["fund", fund.id] });
  };

  // The deal owns its complete tag set, so every change posts the whole list.
  const save = useMutation({
    mutationFn: (tagIds: number[]) =>
      api<{ fund: Fund }>(`/api/v1/funds/${fund.id}`, {
        method: "PATCH",
        body: { fund: { tag_ids: tagIds } },
      }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const add = useMutation({
    mutationFn: async (tagName: string) => {
      const { tag } = await api<{ tag: Tag }>("/api/v1/tags", {
        method: "POST",
        body: { tag: { name: tagName } },
      });
      return tag;
    },
    onSuccess: (tag) => {
      setName("");
      const current = fund.tags.map((t) => t.id);
      if (!current.includes(tag.id)) save.mutate([...current, tag.id]);
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (fund.tags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
      setError(`“${trimmed}” is already on this deal.`);
      return;
    }
    setError(null);
    add.mutate(trimmed);
  };

  const busy = add.isPending || save.isPending;

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Deal tags</h2>
        <p className="text-sm text-muted-foreground">
          Write your own tags to describe this deal. They are compared with adviser client tags, and
          changes appear in adviser review prompts after publication.
        </p>
      </div>

      <form onSubmit={submit} className="flex max-w-md gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Type a tag, e.g. Defensive, Revenue-positive"
          maxLength={40}
          aria-label="New tag"
        />
        <Button type="submit" disabled={!name.trim() || busy}>
          Add tag
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {fund.tags.length === 0 ? (
        <p className="border-y py-8 text-sm text-muted-foreground">
          No tags yet. Add the first one above.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {fund.tags.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center gap-1.5 rounded-full border bg-muted/50 py-1 pr-1.5 pl-3 text-sm"
            >
              {tag.name}
              <button
                type="button"
                aria-label={`Remove ${tag.name}`}
                disabled={busy}
                onClick={() =>
                  save.mutate(fund.tags.filter((t) => t.id !== tag.id).map((t) => t.id))
                }
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50"
              >
                <XIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
