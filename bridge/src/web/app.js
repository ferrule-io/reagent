const items = new Map();

// ─── Routing ────────────────────────────────────────────────────────────────

function currentRoute() {
  const h = location.hash;
  if (h.startsWith("#/job/")) return { view: "job", id: h.slice(6) };
  return { view: "list" };
}

function navigate(hash) {
  location.hash = hash;
}

window.addEventListener("hashchange", () => route());

async function route() {
  const r = currentRoute();
  if (r.view === "job") {
    if (!items.has(r.id)) {
      // fetch from server if not in memory yet
      try {
        const res = await fetch(`/api/items/${r.id}`);
        if (res.ok) {
          const it = await res.json();
          items.set(it.id, it);
        }
      } catch (_) {}
    }
    renderJobPage(r.id);
  } else {
    renderListPage();
  }
}

// ─── List page ──────────────────────────────────────────────────────────────

function renderListPage() {
  const main = document.querySelector("main");
  main.innerHTML = "";

  const newWork = newWorkForm();
  main.appendChild(newWork);

  const itemsDiv = document.createElement("div");
  itemsDiv.id = "items";
  [...items.values()]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .forEach((it) => itemsDiv.appendChild(card(it)));
  main.appendChild(itemsDiv);
}

function card(it) {
  const gate = it.pendingCheckpoint && !it.pendingCheckpoint.decision;
  const div = document.createElement("div");
  div.className = "item" + (gate ? " gate" : "");

  const link = document.createElement("a");
  link.href = `#/job/${it.id}`;
  link.className = "card-link";
  link.innerHTML = `
    <div class="phase">${escapeHtml(it.phase)} · ${escapeHtml(it.origin)}</div>
    <strong>${escapeHtml(it.title)}</strong>
  `;
  div.appendChild(link);

  if ((it.log || []).length > 0) {
    const lastLog = it.log[it.log.length - 1];
    const pre = document.createElement("pre");
    pre.textContent = `· ${lastLog.line}`;
    div.appendChild(pre);
  }

  if (gate) {
    const prompt = document.createElement("pre");
    prompt.textContent = it.pendingCheckpoint.prompt;
    div.appendChild(prompt);
    div.appendChild(decisionButtons(it.id));
  }

  return div;
}

// ─── Job page ───────────────────────────────────────────────────────────────

const PIPELINE_STAGES = ["INTAKE", "INVESTIGATE", "PLAN_APPROVAL", "EXECUTE", "DONE"];
const TERMINAL_ERROR = ["REJECTED", "FAILED"];

function renderJobPage(id) {
  const main = document.querySelector("main");
  main.innerHTML = "";

  const it = items.get(id);

  if (!it) {
    main.innerHTML = `<p><a href="#/" class="back-link">← Back</a></p><p>Work item not found.</p>`;
    return;
  }

  // Back link
  const back = document.createElement("a");
  back.href = "#/";
  back.className = "back-link";
  back.textContent = "← All jobs";
  main.appendChild(back);

  // Title / origin
  const header = document.createElement("div");
  header.className = "job-header";
  header.innerHTML = `
    <div class="phase">${escapeHtml(it.phase)} · ${escapeHtml(it.origin)}</div>
    <h2 class="job-title">${escapeHtml(it.title)}</h2>
  `;
  main.appendChild(header);

  // Phase stepper
  main.appendChild(buildStepper(it.phase));

  // Labeled fields
  const fields = document.createElement("div");
  fields.className = "job-fields";

  fields.appendChild(labeledField("Request", escapeHtml(it.request), "pre"));
  fields.appendChild(labeledField("Repo", escapeHtml(it.repoPath), "code"));
  if (it.branch) fields.appendChild(labeledField("Branch", escapeHtml(it.branch), "code"));
  if (it.plan) fields.appendChild(labeledField("Plan", escapeHtml(it.plan), "pre"));

  main.appendChild(fields);

  // Checkpoint gate
  const gate = it.pendingCheckpoint && !it.pendingCheckpoint.decision;
  if (gate) {
    const gateDiv = document.createElement("div");
    gateDiv.className = "checkpoint-gate";
    const p = document.createElement("pre");
    p.textContent = it.pendingCheckpoint.prompt;
    gateDiv.appendChild(p);
    gateDiv.appendChild(decisionButtons(it.id));
    main.appendChild(gateDiv);
  }

  // Full activity log
  if ((it.log || []).length > 0) {
    const logSection = document.createElement("div");
    logSection.className = "log-section";
    const logTitle = document.createElement("div");
    logTitle.className = "log-title";
    logTitle.textContent = "Activity log";
    logSection.appendChild(logTitle);

    const logList = document.createElement("ol");
    logList.className = "log-list";
    [...it.log].forEach((entry) => {
      const li = document.createElement("li");
      li.className = "log-entry";
      const ts = document.createElement("span");
      ts.className = "log-ts";
      ts.textContent = formatTs(entry.at);
      const line = document.createElement("span");
      line.className = "log-line";
      line.textContent = entry.line;
      li.appendChild(ts);
      li.appendChild(line);
      logList.appendChild(li);
    });
    logSection.appendChild(logList);
    main.appendChild(logSection);
  }
}

function buildStepper(phase) {
  const isError = TERMINAL_ERROR.includes(phase);
  const stages = isError
    ? [...PIPELINE_STAGES.slice(0, -1), phase]
    : PIPELINE_STAGES;

  const currentIdx = isError
    ? stages.length - 1
    : stages.indexOf(phase);

  const stepper = document.createElement("div");
  stepper.className = "stepper";

  stages.forEach((stage, i) => {
    const step = document.createElement("div");
    let cls = "step";
    if (i < currentIdx) cls += " done";
    else if (i === currentIdx) {
      cls += isError ? " error" : " current";
    } else {
      cls += " todo";
    }
    step.className = cls;

    const label = document.createElement("div");
    label.className = "step-label";
    label.textContent = stageLabel(stage);
    step.appendChild(label);

    stepper.appendChild(step);

    // connector line between steps
    if (i < stages.length - 1) {
      const line = document.createElement("div");
      line.className = "step-connector" + (i < currentIdx ? " done" : "");
      stepper.appendChild(line);
    }
  });

  return stepper;
}

function stageLabel(stage) {
  const map = {
    INTAKE: "Intake",
    INVESTIGATE: "Investigate",
    PLAN_APPROVAL: "Plan",
    EXECUTE: "Execute",
    DONE: "Done",
    REJECTED: "Rejected",
    FAILED: "Failed",
  };
  return map[stage] || stage;
}

function labeledField(label, value, tag) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const lbl = document.createElement("div");
  lbl.className = "field-label";
  lbl.textContent = label;
  const val = document.createElement(tag);
  val.className = "field-value";
  val.innerHTML = value;
  wrap.appendChild(lbl);
  wrap.appendChild(val);
  return wrap;
}

function formatTs(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch (_) {
    return iso;
  }
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function decisionButtons(id) {
  const wrap = document.createElement("div");
  wrap.className = "decision-buttons";
  const approve = button("Approve", "approve", () => decide(id, "approve"));
  const reject = button("Reject", "reject", () => {
    const note = window.prompt("Why reject? (optional)") || undefined;
    decide(id, "reject", note);
  });
  wrap.append(approve, " ", reject);
  return wrap;
}

function button(label, cls, onClick) {
  const b = document.createElement("button");
  b.textContent = label; b.className = cls; b.onclick = onClick;
  return b;
}

async function decide(id, result, note) {
  await fetch(`/api/items/${id}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ result, note }),
  });
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function newWorkForm() {
  const details = document.createElement("details");
  details.innerHTML = `
    <summary>Start new work</summary>
    <form id="new">
      <input name="title" placeholder="title" required />
      <input name="repoPath" placeholder="/path/to/repo" required />
      <textarea name="request" placeholder="what needs doing?" required></textarea>
      <button type="submit">Start</button>
    </form>
  `;
  details.querySelector("#new").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    await fetch("/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(f)),
    });
    e.target.reset();
  });
  return details;
}

// ─── SSE + init ─────────────────────────────────────────────────────────────

async function init() {
  const res = await fetch("/api/items");
  for (const it of await res.json()) items.set(it.id, it);

  route();

  const es = new EventSource("/api/stream");
  es.addEventListener("item", (ev) => {
    const it = JSON.parse(ev.data);
    items.set(it.id, it);
    // Re-render whichever view is currently active
    const r = currentRoute();
    if (r.view === "job" && r.id === it.id) {
      renderJobPage(it.id);
    } else if (r.view === "list") {
      renderListPage();
    }
  });
}

init();
