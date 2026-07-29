import type { PipelineResponse } from "../../contracts";

export function RunMetadataFooter({
  metadata,
}: {
  metadata: PipelineResponse["run_metadata"];
}) {
  const stageSuffix =
    metadata.logicalProviderStageCount === 1 ? "stage" : "stages";
  const attemptSuffix =
    metadata.providerAttemptCount === 1 ? "OpenAI call" : "OpenAI calls";

  return (
    <div className="space-y-1 pt-2 text-center text-[11px] text-white/25">
      <div>
        Evaluated with {metadata.provider} ({metadata.model}) ·{" "}
        {metadata.logicalProviderStageCount} {stageSuffix} ·{" "}
        {metadata.providerAttemptCount} {attemptSuffix} ·{" "}
        {metadata.totalTokens.toLocaleString()} tokens
      </div>
      <div>
        {metadata.estimatedCostUsd !== null
          ? `Estimated cost: ~$${metadata.estimatedCostUsd.toFixed(4)} ` +
            "(approximate, not an invoice)"
          : "Estimated cost: unavailable for this model"}
      </div>
    </div>
  );
}
