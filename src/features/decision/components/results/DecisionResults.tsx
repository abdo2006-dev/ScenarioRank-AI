import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { PipelineResponse } from "../../contracts";
import { AnalysisTab } from "./AnalysisTab";
import { CandidatesTab } from "./CandidatesTab";
import { OverviewTab } from "./OverviewTab";
import { PairingTab } from "./PairingTab";
import { PipelineTab } from "./PipelineTab";
import { RunMetadataFooter } from "./RunMetadataFooter";

type ResultTab = "overview" | "candidates" | "analysis" | "pairing" | "pipeline";

const tabLabels: Record<ResultTab, string> = {
  overview: "Overview", candidates: "Candidates", analysis: "Analysis",
  pairing: "Pairing", pipeline: "Pipeline",
};

export function DecisionResults({ response }: { response: PipelineResponse }) {
  const [selectedTab, setSelectedTab] = useState<ResultTab>("overview");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const tabs = (Object.keys(tabLabels) as ResultTab[]).filter(
    (tab) => tab !== "pairing" || response.pairing_result !== undefined,
  );
  useEffect(() => { headingRef.current?.focus(); }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    setSelectedTab(tabs[nextIndex]);
    document.getElementById(`results-tab-${tabs[nextIndex]}`)?.focus();
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-6 py-10" aria-labelledby="results-heading">
      <h2 ref={headingRef} id="results-heading" tabIndex={-1}
        className="text-xl font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
        Decision results
      </h2>
      <div role="tablist" aria-label="Decision results sections" className="flex flex-wrap gap-2">
        {tabs.map((tab, index) => (
          <button key={tab} id={`results-tab-${tab}`} type="button" role="tab"
            aria-selected={selectedTab === tab} aria-controls={`results-panel-${tab}`}
            tabIndex={selectedTab === tab ? 0 : -1} onClick={() => setSelectedTab(tab)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={
              "rounded-lg px-3 py-1.5 text-xs focus-visible:outline-none " +
              "focus-visible:ring-2 focus-visible:ring-amber-300 " +
              "focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0f14] " +
              (selectedTab === tab ? "bg-amber-400 text-black" : "bg-white/10 text-white/60")
            }>
            {tabLabels[tab]}
          </button>
        ))}
      </div>
      <div id={`results-panel-${selectedTab}`} role="tabpanel" aria-labelledby={`results-tab-${selectedTab}`}
        tabIndex={0} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
        {selectedTab === "overview" && <OverviewTab response={response} />}
        {selectedTab === "candidates" && <CandidatesTab response={response} />}
        {selectedTab === "analysis" && <AnalysisTab response={response} />}
        {selectedTab === "pairing" && response.pairing_result && <PairingTab pairing={response.pairing_result} />}
        {selectedTab === "pipeline" && <PipelineTab response={response} />}
      </div>
      <RunMetadataFooter metadata={response.run_metadata} />
    </section>
  );
}
