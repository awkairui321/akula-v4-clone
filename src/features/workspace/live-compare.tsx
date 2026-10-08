import { useState } from "react";
import { isMocking } from "@/mocks/browser";
import DemoResetButton from "@/components/demo-reset-button";
import "./workflow.css";

type Persona = { id: number; label: string; surfaces: Record<string, string> };
const personas: Persona[] = [
  {
    id: 7,
    label: "Akula Ops",
    surfaces: {
      Overview: "/ops",
      Investments: "/ops?surface=Investments",
      Documents: "/ops?surface=Documents",
      Publication: "/ops?surface=Publication",
      Demand: "/ops?surface=Demand",
      Reporting: "/ops?surface=Reporting",
    },
  },
  {
    id: 2,
    label: "Investor · Elena Cross",
    surfaces: {
      Portfolio: "/portfolio",
      Invest: "/funds",
      Documents: "/documents",
      Messages: "/messages",
      Account: "/account",
    },
  },
  {
    id: 6,
    label: "LUCA RM",
    surfaces: {
      Overview: "/rm",
      "Client follow-ups": "/rm/clients",
      "Client onboarding": "/rm/onboarding",
      Opportunities: "/rm/opportunities",
      "Partner client book": "/rm/partners",
      Communications: "/rm/communications",
    },
  },
  {
    id: 9000,
    label: "LUCA Investment Team",
    surfaces: { Deals: "/luca/deals", Publication: "/luca/publication" },
  },
  {
    id: 1,
    label: "LUCA Fund Manager",
    surfaces: {
      Dashboard: "/luca",
      Deals: "/luca/deals",
      Subscriptions: "/luca/subscriptions",
      Clients: "/luca/clients",
      "Partner client book": "/luca/partners",
      Compliance: "/luca/compliance",
      Communications: "/luca/communications",
      Analytics: "/luca/analytics",
    },
  },
];

export default function LiveComparePage() {
  const [panes, setPanes] = useState(
    [2, 9000, 6, 1, 7].map((id) => ({
      id,
      surface: Object.keys(personas.find((p) => p.id === id)!.surfaces)[0],
      revision: 0,
    })),
  );
  if (!isMocking)
    return (
      <main className="wf-main">
        <p>Persona comparison is available in the fictional demo.</p>
      </main>
    );
  return (
    <div className="live-compare-wrap">
      <header className="live-top">
        <div>
          <p className="wf-eyebrow">SIMULATION CONTROL ROOM</p>
          <h1>Watch five interfaces work together</h1>
          <p>
            Each pane shows the actual role interface. Follow links inside a pane; shared demo
            records refresh across all views.
          </p>
        </div>
        <DemoResetButton compact />
      </header>
      <div className="live-banner">
        DEMO PERSONA VIEW · All actions remain fictional and browser-local. Each pane keeps its own
        role and navigation.
      </div>
      <div
        className="live-split"
        aria-label="Five live platform views"
        style={{ "--live-pane-height": "900px" } as React.CSSProperties}
      >
        {panes.map((pane, index) => {
          const persona = personas.find((p) => p.id === pane.id)!;
          const path = persona.surfaces[pane.surface];
          return (
            <section
              key={index}
              className="live-pane live-workspace-pane"
              aria-label={"Comparison view " + (index + 1)}
            >
              <header className="live-pane-controls">
                <div>
                  <p className="wf-eyebrow">VIEW {index + 1} · SIMULATED PERSONA</p>
                  <h2>{persona.label}</h2>
                </div>
                <div className="live-selectors">
                  <label>
                    <span>Persona</span>
                    <select
                      value={pane.id}
                      onChange={(event) => {
                        const selected = personas.find((p) => p.id === Number(event.target.value))!;
                        setPanes((previous) =>
                          previous.map((p, i) =>
                            i === index
                              ? {
                                  id: selected.id,
                                  surface: Object.keys(selected.surfaces)[0],
                                  revision: p.revision + 1,
                                }
                              : p,
                          ),
                        );
                      }}
                    >
                      {personas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Open page</span>
                    <select
                      value=""
                      onChange={(event) =>
                        setPanes((previous) =>
                          previous.map((p, i) =>
                            i === index
                              ? { ...p, surface: event.target.value, revision: p.revision + 1 }
                              : p,
                          ),
                        )
                      }
                    >
                      <option value="" disabled>
                        Choose a page…
                      </option>
                      {Object.keys(persona.surfaces).map((surface) => (
                        <option key={surface}>{surface}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </header>
              <iframe
                key={pane.id + path + pane.revision}
                title={persona.label + " interface"}
                src={"/?demo_persona=" + pane.id + "&demo_path=" + encodeURIComponent(path)}
                className="w-full flex-1 border-0"
                style={{ minHeight: 720 }}
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}
