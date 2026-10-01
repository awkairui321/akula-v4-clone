import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { EamProfile } from "./types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BuildingIcon, UserIcon } from "lucide-react";

export default function ProfilePage() {
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["eamProfile"],
    queryFn: () => api<EamProfile>("/api/v1/eam/profile"),
  });

  const [editing, setEditing] = useState(false);
  const [firmName, setFirmName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function startEditing() {
    if (!profile) return;
    setFirmName(profile.firm_name);
    setDisplayName(profile.display_name);
    setError("");
    setMessage("");
    setEditing(true);
  }

  const mutation = useMutation({
    mutationFn: () =>
      api("/api/v1/eam/profile", {
        method: "PATCH",
        body: {
          eam_profile: {
            firm_name: firmName,
            display_name: displayName,
          },
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eamProfile"] });
      setMessage("Profile updated successfully.");
      setEditing(false);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    mutation.mutate();
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Profile</h1>

      {isLoading && <p className="py-12 text-center text-muted-foreground">Loading...</p>}

      {!isLoading && profile && (
        <div className="space-y-4">
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <BuildingIcon className="size-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-lg font-semibold">{profile.display_name}</p>
                <p className="text-sm text-muted-foreground">{profile.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">{profile.firm_name}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserIcon className="size-4" />
                  Profile details
                </CardTitle>
                {!editing && (
                  <Button variant="ghost" size="sm" onClick={startEditing}>
                    Edit
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {editing ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="firm-name">Firm name</Label>
                    <Input
                      id="firm-name"
                      value={firmName}
                      onChange={(e) => setFirmName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="display-name">Display name</Label>
                    <Input
                      id="display-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <div className="flex gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      {mutation.isPending ? "Saving..." : "Save changes"}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <dl className="space-y-3">
                  <div className="flex items-center justify-between">
                    <dt className="text-sm text-muted-foreground">Firm name</dt>
                    <dd className="text-sm font-medium">{profile.firm_name}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-sm text-muted-foreground">Display name</dt>
                    <dd className="text-sm font-medium">{profile.display_name}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-sm text-muted-foreground">Email</dt>
                    <dd className="text-sm font-medium">{profile.email}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-sm text-muted-foreground">Member since</dt>
                    <dd className="text-sm font-medium">
                      {new Date(profile.created_at).toLocaleDateString()}
                    </dd>
                  </div>
                  {message && <p className="text-sm text-green-600">{message}</p>}
                </dl>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
