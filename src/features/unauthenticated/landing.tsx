import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="front-door flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-[#dce4e8] px-6 py-5 sm:px-10">
        <Link to="/" className="text-[13px] font-semibold tracking-[.2em] text-[#193548]">
          AKULA · PRIVATE MARKETS
        </Link>
        <Link to="/login">
          <Button
            variant="outline"
            size="sm"
            className="border-[#9db2bd] bg-white text-[#193548] hover:bg-[#edf2f4]"
          >
            Sign in →
          </Button>
        </Link>
      </header>

      <main className="relative flex flex-1 flex-col justify-center overflow-hidden px-6 py-20 sm:px-12 lg:px-20">
        <div className="front-door-orbit" aria-hidden="true" />
        <div className="relative max-w-3xl space-y-7">
          <p className="text-[11px] font-semibold tracking-[.18em] text-[#5a7f92]">
            A CLEARER WAY TO ACCESS PRIVATE MARKETS
          </p>
          <h1 className="max-w-3xl leading-[1.05] font-medium tracking-[-.055em] text-[#193548]">
            Private opportunities.
            <br />
            <span className="front-door-serif">A more considered view.</span>
          </h1>
          <p className="max-w-xl text-lg leading-8 text-[#587180]">
            Explore the LUCA opportunities available to your investor profile, understand the terms
            and follow a simulated investment from request through portfolio reporting.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link to="/login">
              <Button size="lg" className="bg-[#285f80] px-6 text-white hover:bg-[#193f56]">
                Enter the demo <span aria-hidden="true">→</span>
              </Button>
            </Link>
            <Link to="/signup">
              <Button
                variant="outline"
                size="lg"
                className="border-[#9db2bd] bg-white text-[#193548] hover:bg-[#edf2f4]"
              >
                Get started
              </Button>
            </Link>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-2 pt-8 text-xs text-[#718896]">
            <span>SIMULATED BETA</span>
            <span>FICTIONAL DEAL DATA</span>
            <span>NO REAL INVESTMENT OR PAYMENT</span>
          </div>
        </div>
      </main>

      <footer className="border-t border-[#dce4e8] px-6 py-5 text-sm text-[#718896] sm:px-10">
        Akula Markets Pte. Ltd. · Singapore{" "}
        <span className="float-right">LUCA Beta · Simulated experience</span>
      </footer>
    </div>
  );
}
