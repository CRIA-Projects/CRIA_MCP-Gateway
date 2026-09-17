const $ = (selector) => document.querySelector(selector);
const message = $("#message"), dashboard = $("#dashboard");
let config, editingUserId, editingServerId, deviceAuth = false;
const key = () => sessionStorage.getItem("cria-admin-key") || "";
const headers = () => ({ "content-type": "application/json", "x-admin-key": key() });
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);
function showMessage(text, isError = true) { message.textContent = text; message.className = isError ? "error" : "success"; message.hidden = false; }
function clearMessage() { message.hidden = true; }
async function withLoading(button, run) { if (!button) return run(); button.disabled = true; button.classList.add("is-loading"); try { return await run(); } finally { button.disabled = false; button.classList.remove("is-loading"); } }
async function api(path, options = {}) { const response = await fetch(path, { ...options, headers: { ...headers(), ...(options.headers || {}) } }); const body = response.status === 204 ? undefined : await response.json().catch(() => undefined); if (!response.ok) throw new Error(body?.error || `Error ${response.status}`); return body; }
async function refresh() { config = await api("/admin/config", { headers: { accept: "application/json" } }); deviceAuth = (await api("/admin/auth")).mode === "device"; render(); await Promise.all([refreshLogs(), refreshAnalytics(), refreshDevices()]); dashboard.hidden = false; }
function options(items, label) { return items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(label(item))}</option>`).join(""); }
function render() {
  $("#device-section").hidden = !deviceAuth;
  const users = new Map(config.users.map((item) => [item.id, item])); const servers = new Map(config.mcpServers.map((item) => [item.id, item]));
  $("#user-count").textContent = `${config.users.filter((user) => user.enabled).length}/${config.users.length} habilitados`;
  $("#mcp-count").textContent = `${config.mcpServers.length} registrados`;
  $("#user-list").innerHTML = config.users.map((user) => `<article class="card"><span class="tag ${user.enabled ? "enabled" : "disabled"}">${user.enabled ? "Habilitado" : "Deshabilitado"}</span><h3>${escapeHtml(user.name)}</h3><p><code>${escapeHtml(user.id)}</code></p><div class="actions"><button data-edit-user="${escapeHtml(user.id)}" class="secondary">Editar</button><button data-delete-user="${escapeHtml(user.id)}" class="danger">Eliminar</button></div></article>`).join("");
  $("#mcp-list").innerHTML = config.mcpServers.map((server) => `<article class="card"><span class="tag ${server.kind === "remote" ? "remote" : "enabled"}">${server.kind === "remote" ? "Remoto" : "Demo"}</span><h3>${escapeHtml(server.name)}</h3>${server.description ? `<p>${escapeHtml(server.description)}</p>` : ""}<p>ID interno: <code>${escapeHtml(server.id)}</code></p>${server.endpoint ? `<p class="endpoint">${escapeHtml(server.endpoint)}</p>` : ""}${server.authorizationHeader ? `<p class="muted">Autenticación: ${escapeHtml(server.authHeaderName || "Authorization")}.</p>` : ""}<div class="actions"><button data-edit-server="${escapeHtml(server.id)}" class="secondary">Editar</button><button data-delete-server="${escapeHtml(server.id)}" class="danger">Eliminar</button></div></article>`).join("");
  $("#assignment-list").innerHTML = config.assignments.map((assignment) => `<article class="assignment"><strong>${escapeHtml(users.get(assignment.userId)?.name || assignment.userId)}</strong><span>puede acceder a</span><strong>${escapeHtml(servers.get(assignment.mcpServerId)?.name || assignment.mcpServerId)}</strong></article>`).join("") || "<p class=\"muted\">No hay accesos asignados.</p>";
  document.querySelectorAll('select[name="userId"]').forEach((select) => select.innerHTML = options(config.users, (user) => `${user.name}${user.enabled ? "" : " (deshabilitado)"}`));
  document.querySelectorAll('select[name="mcpServerId"]').forEach((select) => select.innerHTML = options(config.mcpServers, (server) => server.name));
}
async function refreshLogs() { const { events } = await api("/admin/logs?limit=100"); $("#log-list").innerHTML = events.map((event) => `<details class="log"><summary><span class="tag ${event.decision}">${escapeHtml(event.decision)}</span> <strong>${event.path === "/admin/test-user" ? "Prueba administrativa · " : ""}${escapeHtml(event.rpcMethod || "invalid request")}</strong> <span>${escapeHtml(event.clientId || "unknown user")} → ${escapeHtml(event.mcpServerId || "unknown MCP")}</span><time>${new Date(event.at).toLocaleString()}</time></summary><pre>${escapeHtml(JSON.stringify(event, null, 2))}</pre></details>`).join("") || "<p class=\"muted\">Todavía no llegaron requests al gateway.</p>"; }
const dash = (value) => value === undefined || value === null || value === "" ? "—" : escapeHtml(String(value));
const when = (iso) => iso ? new Date(iso).toLocaleString() : "—";
async function refreshAnalytics() {
  const users = new Map(config.users.map((item) => [item.id, item]));
  const servers = new Map(config.mcpServers.map((item) => [item.id, item]));
  const analytics = await api("/admin/analytics");
  $("#analytics-sample-size").textContent = analytics.sampleSize;
  $("#analytics-sample-size-mcp").textContent = analytics.sampleSize;
  $("#user-analytics-body").innerHTML = analytics.users.map((row) => `<tr><td>${escapeHtml(users.get(row.userId)?.name || row.userId)}</td><td>${row.totalRequests}</td><td>${row.allowed}</td><td>${row.denied}</td><td>${row.errors}</td><td>${dash(servers.get(row.topMcpServerId)?.name || row.topMcpServerId)}</td><td>${when(row.lastSeenAt)}</td></tr>`).join("") || `<tr><td colspan="7" class="muted">Todavía no hay actividad.</td></tr>`;
  $("#mcp-analytics-body").innerHTML = analytics.mcpServers.map((row) => `<tr><td>${escapeHtml(servers.get(row.mcpServerId)?.name || row.mcpServerId)}</td><td>${row.totalCalls}</td><td>${row.allowed}</td><td>${row.denied}</td><td>${row.errors}</td><td>${dash(row.topTool)}</td><td>${when(row.lastUsedAt)}</td></tr>`).join("") || `<tr><td colspan="7" class="muted">Todavía no hay actividad.</td></tr>`;
}
function switchTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  document.querySelectorAll("[data-tab-panel]").forEach((panel) => panel.hidden = panel.dataset.tabPanel !== name);
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
function resetUser() { editingUserId = undefined; $("#user-form").reset(); $("#user-form-title").textContent = "Nuevo usuario"; $("#user-form [name=id]").disabled = false; $("#cancel-user").hidden = true; resetUserSlug(); }
function resetServer() { editingServerId = undefined; $("#server-form").reset(); $("#server-form-title").textContent = "Nuevo MCP"; $("#server-form [name=kind]").value = "remote"; $("#cancel-server").hidden = true; toggleAuthFields(); resetServerSlug(); }
function toggleAuthFields() { const type = $("#server-form [name=authType]").value; $("#auth-header-name-field").hidden = type !== "header"; $("#auth-value-field").hidden = type === "none"; $("#auth-value-label").textContent = type === "bearer" ? "Token" : "Valor del header"; }
const slugify = (value) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
function wireAutoSlug(form) {
  const nameInput = form.querySelector("[name=name]"), idInput = form.querySelector("[name=id]");
  let touched = false;
  idInput.addEventListener("input", () => { touched = true; });
  nameInput.addEventListener("input", () => { if (!touched && !idInput.disabled) idInput.value = slugify(nameInput.value); });
  return () => { touched = false; };
}
const resetUserSlug = wireAutoSlug($("#user-form")), resetServerSlug = wireAutoSlug($("#server-form"));
$("#login-form").addEventListener("submit", async (event) => { event.preventDefault(); sessionStorage.setItem("cria-admin-key", $("#admin-key").value); try { clearMessage(); await withLoading(event.submitter, () => refresh()); } catch (error) { showMessage(error.message); sessionStorage.removeItem("cria-admin-key"); } });
$("#user-form").addEventListener("submit", async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const body = { id: data.get("id"), name: data.get("name"), enabled: data.has("enabled") }; try { await withLoading(event.submitter, () => api(editingUserId ? `/admin/users/${editingUserId}` : "/admin/users", { method: editingUserId ? "PATCH" : "POST", body: JSON.stringify(editingUserId ? { name: body.name, enabled: body.enabled } : body) })); resetUser(); await refresh(); showMessage("Usuario guardado.", false); } catch (error) { showMessage(error.message); } });
$("#server-form").addEventListener("submit", async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const authType = data.get("authType"); const authValue = (data.get("authValue") || "").trim(); const authorizationHeader = authType === "none" || !authValue ? undefined : authType === "bearer" ? `Bearer ${authValue}` : authValue; const authHeaderName = authType === "header" && authValue ? (data.get("authHeaderName") || undefined) : undefined; const body = { id: data.get("id"), name: data.get("name"), kind: data.get("kind"), endpoint: data.get("endpoint") || undefined, authorizationHeader, authHeaderName }; try { await withLoading(event.submitter, () => api(editingServerId ? `/admin/servers/${editingServerId}` : "/admin/servers", { method: editingServerId ? "PATCH" : "POST", body: JSON.stringify(editingServerId ? { name: body.name, kind: body.kind, endpoint: body.endpoint, authorizationHeader: body.authorizationHeader, authHeaderName: body.authHeaderName } : body) })); resetServer(); await refresh(); showMessage("MCP guardado.", false); } catch (error) { showMessage(error.message); } });
$("#access-form").addEventListener("submit", async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const granted = event.submitter?.value !== "false"; try { await withLoading(event.submitter, () => api("/admin/access", { method: "PUT", body: JSON.stringify({ userId: data.get("userId"), mcpServerId: data.get("mcpServerId"), granted }) })); await refresh(); showMessage(granted ? "Acceso habilitado." : "Acceso revocado.", false); } catch (error) { showMessage(error.message); } });
$("#access-tester").addEventListener("submit", async event => {
  event.preventDefault();
  const userId = new FormData(event.currentTarget).get("userId");
  try {
    await withLoading(event.submitter, async () => {
      const result = await api("/admin/test-user", { method: "POST", body: JSON.stringify({ userId }) });
      $("#test-result").textContent = JSON.stringify(result, null, 2);
      await Promise.all([refreshLogs(), refreshAnalytics()]);
    });
  } catch (error) { $("#test-result").textContent = error.message; showMessage(error.message); }
});
document.addEventListener("click", async (event) => { const target = event.target; if (!(target instanceof HTMLButtonElement)) return; const user = target.dataset.editUser || target.dataset.deleteUser; const server = target.dataset.editServer || target.dataset.deleteServer; try { if (target.dataset.editUser) { const value = config.users.find((item) => item.id === user); editingUserId = user; $("#user-form-title").textContent = `Editar ${value.name}`; $("#user-form [name=id]").value = value.id; $("#user-form [name=id]").disabled = true; $("#user-form [name=name]").value = value.name; $("#user-form [name=enabled]").checked = value.enabled; $("#cancel-user").hidden = false; } if (target.dataset.deleteUser && confirm(`Eliminar ${user}?`)) { await withLoading(target, () => api(`/admin/users/${user}`, { method: "DELETE" })); await refresh(); } if (target.dataset.editServer) { const value = config.mcpServers.find((item) => item.id === server); editingServerId = server; $("#server-form-title").textContent = `Editar ${value.name}`; ["id", "name", "kind", "endpoint"].forEach((name) => $("#server-form [name=" + name + "]").value = value[name] || ""); let authType = "none", authValue = ""; if (value.authorizationHeader) { if (!value.authHeaderName && value.authorizationHeader.startsWith("Bearer ")) { authType = "bearer"; authValue = value.authorizationHeader.slice(7); } else { authType = "header"; authValue = value.authorizationHeader; } } $("#server-form [name=authType]").value = authType; $("#server-form [name=authValue]").value = authValue; $("#server-form [name=authHeaderName]").value = value.authHeaderName || ""; toggleAuthFields(); $("#cancel-server").hidden = false; } if (target.dataset.deleteServer && confirm(`Eliminar ${server}?`)) { await withLoading(target, () => api(`/admin/servers/${server}`, { method: "DELETE" })); await refresh(); } } catch (error) { showMessage(error.message); } });
$("#cancel-user").addEventListener("click", resetUser); $("#cancel-server").addEventListener("click", resetServer); $("#server-form [name=authType]").addEventListener("change", toggleAuthFields); $("#refresh-logs").addEventListener("click", (event) => withLoading(event.currentTarget, () => refreshLogs()).catch((error) => showMessage(error.message)));
if (key()) refresh().catch((error) => { sessionStorage.removeItem("cria-admin-key"); showMessage(error.message); });

async function refreshDevices() {
  if (!deviceAuth) return;
  const { credentials } = await api("/admin/credentials");
  $("#device-list").innerHTML = credentials.map(c => {
    const status = c.revokedAt ? "Revocada" : Date.parse(c.expiresAt) <= Date.now() ? "Vencida" : "Activa";
    return `<article class="card"><h3>${escapeHtml(c.deviceName)}</h3><p>Usuario: ${escapeHtml(c.userId)} · ${status}</p><p>Creada: ${escapeHtml(when(c.createdAt))}</p><p>Vence: ${escapeHtml(when(c.expiresAt))}</p><p>Último uso: ${escapeHtml(when(c.lastUsedAt))}</p>${!c.revokedAt ? `<button class="danger" data-revoke-device="${escapeHtml(c.id)}">Revocar</button>` : ""}</article>`;
  }).join("") || '<p class="muted">No hay credenciales de dispositivos.</p>';
}
$("#device-form").addEventListener("submit", async event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  try {
    await withLoading(event.submitter, async () => {
      const result = await api("/admin/credentials", { method: "POST", body: JSON.stringify({ userId: data.get("userId"), deviceName: data.get("deviceName"), expiresInDays: Number(data.get("expiresInDays")) }) });
      $("#issued-token").value = result.token;
      $("#credential-dialog").showModal();
      await refreshDevices();
    });
  } catch (error) { showMessage(error.message); }
});
$("#close-credential").addEventListener("click", () => { $("#issued-token").value = ""; $("#credential-dialog").close(); });
$("#credential-dialog").addEventListener("cancel", () => { $("#issued-token").value = ""; });
$("#credential-dialog").addEventListener("close", () => { $("#issued-token").value = ""; });
window.addEventListener("pagehide", () => { $("#issued-token").value = ""; });
$("#device-list").addEventListener("click", async event => {
  const id = event.target.dataset?.revokeDevice;
  if (!id || !confirm("¿Revocar esta credencial? Esa computadora dejará de tener acceso inmediatamente.")) return;
  try { await withLoading(event.target, () => api(`/admin/credentials/${encodeURIComponent(id)}`, { method: "DELETE" })); await refreshDevices(); }
  catch (error) { showMessage(error.message); }
});

function updateInstallCommand() {
  const windows = $("#install-os").value === "windows";
  const folder = $("#install-folder").value.trim();
  const profile = $("#install-profile").value.trim();
  const rawUrl = $("#install-url").value.trim();
  const command = $("#install-command");
  $("#copy-install-command").disabled = true;
  command.value = "";
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.pathname !== "/mcp" || url.username || url.password || url.search || url.hash) throw new Error();
    if (!folder || /[\r\n\0]/.test(folder) || !/^[a-zA-Z0-9_-]{1,64}$/.test(profile)) throw new Error();
    const path = folder.replace(/[\\/]+$/, "") + (windows ? "\\" : "/") + "enroll-device.mjs";
    const quote = value => "'" + (windows ? value.replaceAll("'", "''") : value.replaceAll("'", "'\\''")) + "'";
    command.value = `node ${quote(path)} ${quote(url.href)} ${quote(profile)}`;
    $("#copy-install-command").disabled = false;
    $("#install-feedback").textContent = "La key se pega después, en el campo oculto del terminal.";
  } catch { $("#install-feedback").textContent = "Completá la carpeta, la URL HTTPS terminada en /mcp y un perfil sin espacios."; }
}
$("#install-os").addEventListener("change", () => {
  $("#install-folder").value = $("#install-os").value === "windows" ? "C:\\CRIA" : "/Users/usuario/CRIA";
  updateInstallCommand();
});
for (const id of ["install-folder", "install-url", "install-profile"]) $("#" + id).addEventListener("input", updateInstallCommand);
$("#copy-install-command").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("#install-command").value); $("#install-feedback").textContent = "Comando copiado. Ejecutalo en la computadora del empleado."; }
  catch { $("#install-command").focus(); $("#install-command").select(); $("#install-feedback").textContent = "Copiá el texto seleccionado con ⌘C o Ctrl+C."; }
});
if (location.protocol === "https:") $("#install-url").value = location.origin + "/mcp";
updateInstallCommand();
