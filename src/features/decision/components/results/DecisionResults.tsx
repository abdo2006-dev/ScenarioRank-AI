import { useState } from "react";
import type { PipelineResponse } from "../../contracts";
import { AnalysisTab } from "./AnalysisTab";
import { CandidatesTab } from "./CandidatesTab";
import { OverviewTab } from "./OverviewTab";
import { PairingTab } from "./PairingTab";
import { PipelineTab } from "./PipelineTab";
import { RunMetadataFooter } from "./RunMetadataFooter";

type ResultTab = "overview" | "candidates" | "analysis" | "pairing" | "pipeline";

const tabLabels: Record<ResultTab, string> = {
  overview: "Overview",
  candidates: "Candidates",
  analysis: "Analysis",
  pairing: "Pairing",
  pipeline: "Pipeline",
};

export function DecisionResults({ response }: { response: PipelineResponse }) {
  const [selectedTab, setSelectedTab] = useState<ResultTab>("overview");
  const tabs = (Object.keys(tabLabels) as ResultTab[]).filter(
    (tab) => tab !== "pairing" || response.pairing_result !== undefined,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setSelectedTab(tab)}
            className={
              "rounded-lg px-3 py-1.5 text-xs " +
              (selectedTab === tab
                ? "bg-amber-400 text-black"
                : "bg-white/10 text-white/60")
            }
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {selectedTab === "overview" && <OverviewTab response={response} />}
      {selectedTab === "candidates" && <CandidatesTab response={response} />}
      {selectedTab === "analysis" && <AnalysisTab response={response} />}
      {selectedTab === "pairing" && response.pairing_result && (
        <PairingTab pairing={response.pairing_result} />
      )}
      {selectedTab === "pipeline" && <PipelineTab response={response} />}

      <RunMetadataFooter metadata={response.run_metadata} />
    </div>
  );
}
