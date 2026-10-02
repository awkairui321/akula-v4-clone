import { useState } from "react";
import { Link } from "react-router-dom";
import WorkflowPage from "@/features/workspace/workflow-page";
import { isMocking } from "@/mocks/browser";
import DemoResetButton from "@/components/demo-reset-button";
import "./workflow.css";

type Persona = { id: number; label: string; surfaces: string[] };
const personas: Persona[] = [
  {
    id: 2,
    label: "Investor · Elena Cross",
    surfaces: ["Overview", "Investments", "Documents", "Support", "Reporting", "Company requests"],
  },
  {
    id: 7,
    label: "Akula Ops",
    surfaces: [
      "Overview",
      "Investments",
      "Documents",
      "Publication",
      "Demand",
      "Reporting",
      "Support",
    ],
  },
  {
    id: 6,
    label: "LUCA RM",
    surfaces: ["Overview", "Reports", "Opportunities", "Documents", "Relationships", "Support"],
  },
  {
    id: 4,
    label: "EAM · Meridian",
    surfaces: ["Overview", "Investments", "Documents", "Support", "Reporting", "Company requests"],
  },
  {
    id: 1,
    label: "LUCA · Fund manager",
    surfaces: [
      "Overview",
      "Investments",
      "Documents",
      "Support",
      "Publication",
      "Demand",
      "Relationships",
      "Reporting",
    ],
  },
];

function PersonaPane({
  pane,
  index,
  changePersona,
  changeSurface,
}: {
  pane: { personaId: number; surface: string };
  index: number;
  changePersona: (id: number) => void;
  changeSurface: (surface: string) => void;
}) {
  const persona = personas.find((item) => item.id === pane.personaId) ?? personas[0];
  return (
    <section className="live-pane live-workspace-pane" aria-label={`Comparison view ${index}`}>
      <header className="live-pane-controls">
        <div>
          <p className="wf-eyebrow">VIEW {index} · SIMULATED PERSONA</p>
          <h2>{persona.label}</h2>
        </div>
        <div className="live-selectors">
          <label>
            <span>Persona</span>
            <select
              value={persona.id}
              onChange={(event) => changePersona(Number(event.target.value))}
            >
              {personas.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Surface</span>
            <select value={pane.surface} onChange={(event) => changeSurface(event.target.value)}>
              {persona.surfaces.map((surface) => (
                <option key={surface} value={surface}>
                  {surface}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      <div className="live-pane-screen">
        <WorkflowPage
          key={persona.id}
          demoPersonaId={persona.id}
          surface={pane.surface}
          compact
          onSurfaceChange={changeSurface}
        />
      </div>
    </section>
  );
}

export default function LiveComparePage() {
  const [panes, setPanes] = useState([
    { personaId: 2, surface: "Overview" },
    { personaId: 7, surface: "Overview" },
    { personaId: 6, surface: "Overview" },
    { personaId: 1, surface: "Overview" },
  ]);
  const updatePersona = (index: number, personaId: number) => {
    const persona = personas.find((item) => item.id === personaId)!;
    setPanes((previous) =>
      previous.map((pane, paneIndex) =>
        paneIndex === index ? { personaId, surface: persona.surfaces[0] } : pane,
      ),
    );
  };
  const updateSurface = (index: number, surface: string) => {
    setPanes((previous) =>
      previous.map((pane, paneIndex) => (paneIndex === index ? { ...pane, surface } : pane)),
    );
  };

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
          <h1>Watch four platforms work together</h1>
          <p>
            Choose a persona and workspace surface for each pane. Simulated actions refresh across
            the shared records in all four views.
          </p>
        </div>
        <div className="live-tools">
          <Link to="/workflows">Connected records →</Link>
          <DemoResetButton compact />
        </div>
      </header>
      <div className="live-banner">
        DEMO PERSONA VIEW · Select a different role and surface in either pane. All changes remain
        fictional and browser-local.
      </div>
      <div className="live-split" aria-label="Four live platform views">
        {panes.map((pane, index) => (
          <PersonaPane
            key={index}
            pane={pane}
            index={index + 1}
            changePersona={(id) => updatePersona(index, id)}
            changeSurface={(surface) => updateSurface(index, surface)}
          />
        ))}
      </div>
    </div>
  );
}

