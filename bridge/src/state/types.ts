export type Phase =
  | "INTAKE"
  | "INVESTIGATE"
  | "PROPOSE"
  | "PLAN"
  | "EXECUTE"
  | "DONE"
  | "REJECTED"
  | "FAILED";

/** A human gate awaiting a decision. */
export interface Checkpoint {
  id: string;
  kind: "PROPOSE";
  /** Human-facing payload to render (e.g. diagnosis + proposed direction). */
  prompt: string;
  createdAt: string; // ISO
  /** Set once the human responds. */
  decision?: {
    result: "approve" | "reject" | "revise";
    note?: string;
    decidedAt: string; // ISO
  };
}

/** A unit of work produced by the PLAN stage. */
export interface Unit {
  id: string;
  title: string;
  /** File path globs that define the scope of this unit (mutually exclusive with other units). */
  scope: string[];
  /** Path to the plan document in the target repo. */
  planDocPath: string;
  /** IDs of units this unit depends on (for future DAG execution). */
  dependsOn: string[];
}

/** Durable per-work-item state. The single source of truth on disk. */
export interface WorkItem {
  id: string;
  title: string;
  repoPath: string;
  phase: Phase;
  /** Freeform request text from intake. */
  request: string;
  /** Short diagnosis + proposed direction produced by INVESTIGATE. Kept for backward compat. */
  plan?: string;
  /** Human-facing proposal text (current iteration, produced by PROPOSE stage). */
  proposal?: string;
  /** Append-only trail of revise feedback notes from the human. */
  feedback?: { at: string; note: string }[];
  /** Units of work produced by the PLAN stage. */
  units?: Unit[];
  /** Branch the EXECUTE stage works on. */
  branch?: string;
  /** Absolute path to the git worktree for this item (e.g. ~/.reagent/worktrees/<id>). Assigned alongside branch; torn down on terminal state. */
  worktreePath?: string;
  /** Resolved git base ref this item's branch was created from (e.g. "origin/development"). */
  baseBranch?: string;
  /** Pending human gate, if any. */
  pendingCheckpoint?: Checkpoint;
  /** Append-only activity log lines for the UI. */
  log: { at: string; line: string }[];
  createdAt: string; // ISO
  updatedAt: string; // ISO
  /** Origin of the work item, for display. */
  origin: "terminal" | "phone";
}

/** Live status update a session streams to the bridge. */
export interface StatusUpdate {
  phase?: Phase;
  line?: string; // appended to log
  plan?: string;
  proposal?: string;
  units?: Unit[];
  branch?: string;
}
