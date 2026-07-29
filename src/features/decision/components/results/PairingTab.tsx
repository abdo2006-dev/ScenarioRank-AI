import { Badge, Card } from "../ui";
import type { PairingResult } from "./types";

type SuccessfulPairing = Extract<PairingResult, { status: "ok" }>;

function pairIdentity(pair: SuccessfulPairing["best_pair"]) {
  return [pair.candidate_id_a, pair.candidate_id_b].sort().join("-");
}

export function PairingTab({ pairing }: { pairing: PairingResult }) {
  if (pairing.status === "unavailable") {
    return (
      <Card>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
          Pairing Unavailable
        </h3>
        <p className="text-sm text-white/70">
          We couldn't evaluate leadership pairs for this run. No pair result is
          available — nothing below is a real recommendation.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-amber-400/20">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/40">
          Best Leadership Pair
        </h3>
        <div className="mb-4 flex flex-wrap gap-3">
          <b>{pairing.best_pair.pair[0]}</b>
          <span className="text-amber-400">+</span>
          <b>{pairing.best_pair.pair[1]}</b>
          <Badge color="amber">
            {pairing.best_pair.pair_score.toFixed(1)} / 10
          </Badge>
        </div>
        <p className="text-xs text-white/60">
          {pairing.best_pair.explanation}
        </p>
      </Card>

      {pairing.top_pairs.length > 1 && (
        <Card>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
            Other Pairs Evaluated
          </h3>
          {pairing.top_pairs.slice(1).map((pair) => (
            <div key={pairIdentity(pair)} className="mb-3">
              <b className="text-sm">
                {pair.pair[0]} + {pair.pair[1]}
              </b>
              <span className="ml-2 text-xs text-white/40">
                {pair.pair_score.toFixed(1)} / 10
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
