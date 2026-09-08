const elements = {
  dashboard: document.querySelector("#dashboard"),
  error: document.querySelector("#load-error"),
  mcpList: document.querySelector("#mcp-list"),
  userList: document.querySelector("#user-list"),
  assignmentList: document.querySelector("#assignment-list"),
  mcpCount: document.querySelector("#mcp-count"),
  userCount: document.querySelector("#user-count"),
  form: document.querySelector("#access-tester"),
  userSelect: document.querySelector("#test-user"),
  mcpSelect: document.querySelector("#test-mcp"),
  result: document.querySelector("#test-result")
};

let configuration;

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function render(config) {
  const usersById = new Map(config.users.map((user) => [user.id, user]));
  const serversById = new Map(config.mcpServers.map((server) => [server.id, server]));
  const enabledUsers = config.users.filter((user) => user.enabled);

  elements.mcpCount.textContent = `${config.mcpServers.length} registrados`;
  elements.userCount.textContent = `${enabledUsers.length} habilitados`;
  elements.mcpList.innerHTML = config.mcpServers.map((server) => `
    <article class="card"><h3>${escapeHtml(server.name)}</h3><p>${escapeHtml(server.description)}</p><p><code>/mcp/${escapeHtml(server.id)}</code></p></article>
  `).join("");
  elements.userList.innerHTML = config.users.map((user) => `
    <article class="card"><span class="tag ${user.enabled ? "enabled" : "disabled"}">${user.enabled ? "Habilitado" : "Deshabilitado"}</span><h3>${escapeHtml(user.name)}</h3><p><code>${escapeHtml(user.id)}</code></p></article>
  `).join("");
  elements.assignmentList.innerHTML = config.assignments.map((assignment) => {
    const user = usersById.get(assignment.userId);
    const server = serversById.get(assignment.mcpServerId);
    return `<article class="assignment"><strong>${escapeHtml(user?.name ?? assignment.userId)}</strong><span>puede acceder a</span><strong>${escapeHtml(server?.name ?? assignment.mcpServerId)}</strong></article>`;
  }).join("") || "<p>No hay asignaciones configuradas.</p>";

  elements.userSelect.innerHTML = config.users.map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)}${user.enabled ? "" : " (deshabilitado)"}</option>`).join("");
  elements.mcpSelect.innerHTML = config.mcpServers.map((server) => `<option value="${escapeHtml(server.id)}">${escapeHtml(server.name)}</option>`).join("");
}

async function loadConfiguration() {
  const response = await fetch("/admin/config", { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`No se pudo cargar la configuración (${response.status}).`);
  configuration = await response.json();
  render(configuration);
  elements.dashboard.hidden = false;
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const userId = elements.userSelect.value;
  const mcpServerId = elements.mcpSelect.value;
  elements.result.textContent = "Consultando gateway…";
  try {
    const response = await fetch(`/mcp/${encodeURIComponent(mcpServerId)}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-client-id": userId },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
    });
    const body = await response.json();
    elements.result.textContent = JSON.stringify({ httpStatus: response.status, ...body }, null, 2);
  } catch (error) {
    elements.result.textContent = `No se pudo consultar el gateway: ${error instanceof Error ? error.message : "error desconocido"}`;
  }
});

loadConfiguration().catch((error) => {
  elements.error.textContent = error instanceof Error ? error.message : "No se pudo cargar la configuración.";
  elements.error.hidden = false;
});
