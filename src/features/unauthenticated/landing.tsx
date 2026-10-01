import { Link } from "react-router-dom";
import { Ticker } from "@/components/ticker";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/currency";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Ticker />

      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="text-xl font-bold tracking-tight">AKULA</span>
        <Link to="/login">
          <Button variant="outline" size="sm">
            Sign in
          </Button>
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="max-w-2xl space-y-6 text-center">
          <h1 className="text-5xl font-bold tracking-tight">
            Invest in the world's most
            <br />
            valuable private companies
          </h1>
          <p className="text-lg text-muted-foreground">
            Access pre-IPO opportunities from {formatPrice(25000)}. Browse live deals, subscribe
            digitally, and track your portfolio — all through a regulated Singapore fund structure.
          </p>
          <Link to="/signup">
            <Button size="lg" className="mt-4">
              Get started
            </Button>
          </Link>
        </div>
      </main>

      <footer className="border-t px-6 py-6 text-center text-sm text-muted-foreground">
        Akula Markets Pte. Ltd. &middot; Singapore
      </footer>
    </div>
  );
}
