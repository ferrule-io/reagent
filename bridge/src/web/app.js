const items = new Map();
const el = document.getElementById("items");

function render() {
  el.innerHTML = "";
  [...items.values()]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .forEach((it) => el.appendChild(card(it)));
}

function card(it) {
  const gate = it.pendingCheckpoint && !it.pendingCheckpoint.decision;
  const div = document.createElement("div");
  div.className = "item" + (gate ? " gate" : "");
  div.innerHTML = `
    <div class="phase">${it.phase} · ${it.origin}</div>
    <strong>${escapeHtml(it.title)}</strong>
    ${it.plan ? `<pre>${escapeHtml(it.plan)}</pre>` : ""}
    ${(it.log || []).slice(-4).map((l) => `<pre>· ${escapeHtml(l.line)}</pre>`).join("")}
  `;
  if (gate) {
    const prompt = document.createElement("pre");
    prompt.textContent = it.pendingCheckpoint.prompt;
    div.appendChild(prompt);
    div.appendChild(decisionButtons(it.id));
  }
  return div;
}

function decisionButtons(id) {
  const wrap = document.createElement("div");
  const approve = button("Approve", "approve", () => decide(id, "approve"));
  const reject = button("Reject", "reject", () => {
    const note = prompt("Why reject? (optional)") || undefined;
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
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

document.getElementById("new").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  await fetch("/api/items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.fromEntries(f)),
  });
  e.target.reset();
});

async function init() {
  const res = await fetch("/api/items");
  for (const it of await res.json()) items.set(it.id, it);
  render();
  const es = new EventSource("/api/stream");
  es.addEventListener("item", (ev) => {
    const it = JSON.parse(ev.data);
    items.set(it.id, it);
    render();
  });
}
init();
