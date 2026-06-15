export type Phase =
  | "INTAKE"
  | "INVESTIGATE"
  | "PLAN_APPROVAL"
  | "EXECUTE"
  | "DONE"
  | "REJECTED"
  | "FAILED";

/** A human gate awaiting a decision. */
export interface Checkpoint {
  id: string;
  kind: "PLAN_APPROVAL";
  /** Human-facing payload to render (e.g. diagnosis + proposed direction). */
  prompt: string;
  createdAt: string; // ISO
  /** Set once the human responds. */
  decision?: {
    result: "approve" | "reject";
    note?: string;
    decidedAt: string; // ISO
  };
}

/** Durable per-work-item state. The single source of truth on disk. */
export interface WorkItem {
  id: string;
  title: string;
  repoPath: string;
  phase: Phase;
  /** Freeform request text from intake. */
  request: string;
  /** Short diagnosis + proposed direction produced by INVESTIGATE. */
  plan?: string;
  /** Branch the EXECUTE stage works on. */
  branch?: string;
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
  branch?: string;
}
