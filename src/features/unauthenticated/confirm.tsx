import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ConfirmPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: (token: string) =>
      api(`/api/v1/public/confirm?confirmation_token=${encodeURIComponent(token)}`),
    onSuccess: () =>
      navigate("/login", {
        replace: true,
        state: { message: "Email confirmed! Please sign in." },
      }),
  });

  useEffect(() => {
    const token = searchParams.get("confirmation_token");
    if (token) {
      mutation.mutate(token);
    }
  }, [searchParams]);

  const error = mutation.error instanceof Error ? mutation.error.message : "";
  const noToken = !searchParams.get("confirmation_token");

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{error || noToken ? "Confirmation failed" : "Confirming..."}</CardTitle>
          <CardDescription>
            {noToken ? "Missing confirmation token." : error || "Verifying your email address..."}
          </CardDescription>
        </CardHeader>
        {(error || noToken) && (
          <CardContent>
            <p className="text-sm text-destructive">
              {noToken ? "Missing confirmation token." : error}
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
