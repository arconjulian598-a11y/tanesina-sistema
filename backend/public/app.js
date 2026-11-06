"use strict";
/* ---------- estado ---------- */
var token = null, user = null;
try { token = localStorage.getItem("tamesina.token"); user = JSON.parse(localStorage.getItem("tamesina.user") || "null"); } catch (e) {}
var servicios = [], productos = [], variantMap = {}, cart = {};

/* ---------- utilidades ---------- */
function money(n) { return "$" + (Number(n) || 0).toLocaleString("es-CO"); }
function $(id) { return document.getElementById(id); }
function esc(s){ return String(s==null?"":s).replace(/[&<>]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;"}[c]}); }
function toast(msg) {
  var t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  $("toast").appendChild(t); setTimeout(function () { t.remove(); }, 3200);
}
async function api(path, opts) {
  opts = opts || {};
  var headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  var res = await fetch("/api" + path, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  var data = null; try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error((data && data.error) || "Error de servidor");
  return data;
}

/* ---------- navegación / vistas ---------- */
function showView(v) {
  ["home", "mis", "panel"].forEach(function (x) { $("view-" + x).classList.toggle("hidden", x !== v); });
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (v === "mis") loadMis();
  if (v === "panel") loadPanel();
}
function scrollTo(id) {
  showView("home");
  setTimeout(function () { var el = $(id); if (el) el.scrollIntoView({ behavior: "smooth" }); }, 60);
}
document.addEventListener("click", function (e) {
  var s = e.target.closest("[data-scroll]"); if (s) { scrollTo(s.getAttribute("data-scroll")); closeMenu(); }
  var r = e.target.closest("[data-reservar]"); if (r) { var sv = r.getAttribute("data-reservar");
    if ($("r_serv")) $("r_serv").value = sv; scrollTo("reservar"); }
  var n = e.target.closest("[data-nav]"); if (n) { showView("home"); }
});

/* ---------- autenticación ---------- */
function openAuth() { $("authModal").classList.remove("hidden"); $("authErr").classList.add("hidden"); }
function closeAuth() { $("authModal").classList.add("hidden"); }
$("loginBtn").onclick = openAuth;
$("authX").onclick = closeAuth;
$("authModal").addEventListener("click", function (e) { if (e.target === $("authModal")) closeAuth(); });
$("tabLogin").onclick = function () { setTab("login"); };
$("tabReg").onclick = function () { setTab("reg"); };
function setTab(t) {
  $("tabLogin").classList.toggle("active", t === "login");
  $("tabReg").classList.toggle("active", t === "reg");
  $("loginForm").classList.toggle("hidden", t !== "login");
  $("regForm").classList.toggle("hidden", t !== "reg");
  $("authTitle").textContent = t === "login" ? "Iniciar sesión" : "Crear cuenta";
  $("authErr").classList.add("hidden");
}
function authError(m) { var e = $("authErr"); e.textContent = m; e.classList.remove("hidden"); }
function setSession(d) {
  token = d.token; user = d.user;
  try { localStorage.setItem("tamesina.token", token); localStorage.setItem("tamesina.user", JSON.stringify(user)); } catch (e) {}
  updateUI(); closeAuth(); toast("Hola, " + user.nombre.split(" ")[0] + " 👋");
}
$("loginForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  try { setSession(await api("/auth/login", { method: "POST", body: { email: $("l_email").value, password: $("l_pass").value } })); }
  catch (err) { authError(err.message); }
});
$("regForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  try { setSession(await api("/auth/register", { method: "POST", body: { nombre: $("g_nombre").value, email: $("g_email").value, telefono: $("g_tel").value, password: $("g_pass").value } })); }
  catch (err) { authError(err.message); }
});
function logout() { token = null; user = null; try { localStorage.removeItem("tamesina.token"); localStorage.removeItem("tamesina.user"); } catch (e) {} updateUI(); showView("home"); toast("Sesión cerrada"); }

/* menú de usuario */
$("avatar").onclick = function () { $("dropdown").classList.toggle("hidden"); };
document.addEventListener("click", function (e) { if (!e.target.closest("#userMenu")) $("dropdown").classList.add("hidden"); });
$("dropdown").addEventListener("click", function (e) {
  var b = e.target.closest("[data-act]"); if (!b) return;
  var a = b.getAttribute("data-act"); $("dropdown").classList.add("hidden");
  if (a === "logout") logout(); else if (a === "mis") showView("mis"); else if (a === "panel") showView("panel");
});

function updateUI() {
  var logged = !!token && !!user;
  $("loginBtn").classList.toggle("hidden", logged);
  $("userMenu").classList.toggle("hidden", !logged);
  if (logged) {
    $("uname").textContent = user.nombre.split(" ")[0];
    $("uinit").textContent = (user.nombre[0] || "T").toUpperCase();
    $("dname").textContent = user.nombre;
    $("drol").innerHTML = user.rol === "admin" ? '<span class="rolepill">Administrador</span>' : "Cliente";
    $("panelLink").classList.toggle("hidden", user.rol !== "admin"); // panel solo admin
  }
}

/* ---------- catálogo ---------- */
async function loadCatalogo() {
  try {
    servicios = await api("/servicios");
    var sel = $("r_serv"); sel.innerHTML = "";
    servicios.forEach(function (s) {
      var o = document.createElement("option"); o.value = s.id;
      o.textContent = s.nombre + " — " + money(s.precio) + (s.por_persona ? " / persona" : " / noche");
      sel.appendChild(o);
    });
  } catch (e) {}
  try {
    productos = await api("/productos"); variantMap = {};
    productos.forEach(function (p) { p.variantes.forEach(function (v) { variantMap[v.id] = { nombre: p.nombre, pres: v.presentacion, precio: v.precio }; }); });
    renderProductos();
  } catch (e) {}
}
function renderProductos() {
  var g = $("prodgrid"); g.innerHTML = "";
  productos.forEach(function (p) {
    var el = document.createElement("div"); el.className = "prod";
    el.innerHTML = '<div class="n">' + esc(p.nombre) + '</div><div class="d">' + esc(p.descripcion || "") + '</div>';
    var sel = document.createElement("select");
    sel.innerHTML = p.variantes.map(function (v) { return '<option value="' + v.id + '">' + v.presentacion + " — " + money(v.precio) + '</option>'; }).join("");
    var b = document.createElement("button"); b.className = "btn sec sm"; b.style.marginTop = ".5rem"; b.textContent = "Agregar";
    b.onclick = function () { var id = sel.value; cart[id] = (cart[id] || 0) + 1; renderCart(); };
    if (p.variantes.length > 1) el.appendChild(sel);
    el.appendChild(b); g.appendChild(el);
  });
}

/* ---------- carrito / pedidos ---------- */
function cartCount() { var t = 0; for (var k in cart) t += cart[k]; return t; }
function cartTotal() { var t = 0; for (var k in cart) { var v = variantMap[k]; if (v) t += v.precio * cart[k]; } return t; }
function renderCart() {
  var n = cartCount(); $("cartbar").classList.toggle("hidden", n === 0);
  $("cartText").textContent = n + (n === 1 ? " producto · " : " productos · ") + money(cartTotal());
}
$("cartSend").onclick = async function () {
  if (!token) { openAuth(); return toast("Inicia sesión para pedir"); }
  var items = Object.keys(cart).map(function (k) { return { variante_id: Number(k), cantidad: cart[k] }; });
  try { var r = await api("/pedidos", { method: "POST", body: { items: items } }); cart = {}; renderCart(); toast("Pedido " + r.codigo + " enviado"); }
  catch (e) { toast(e.message); }
};

/* ---------- reservar ---------- */
$("resForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  if (!token) { openAuth(); return toast("Inicia sesión para reservar"); }
  try {
    var r = await api("/reservas", { method: "POST", body: {
      servicio_id: Number($("r_serv").value), fecha: $("r_fecha").value,
      personas: Number($("r_pers").value), tel: $("r_tel").value, canal: "Web" } });
    toast("Reserva " + r.codigo + " registrada ✅");
    $("resForm").reset(); $("r_pers").value = 2;
  } catch (err) { toast(err.message); }
});

/* ---------- mis reservas ---------- */
async function loadMis() {
  try {
    var R = await api("/reservas/mias");
    $("misRes").innerHTML = R.length ? R.map(function (r) {
      return "<tr><td><b>" + r.codigo + "</b></td><td>" + esc(r.servicio || "") + "</td><td>" + (r.fecha || "—") +
        "</td><td>" + r.personas + "</td><td>" + money(r.total) + "</td><td><span class='pill " + r.estado + "'>" + r.estado + "</span></td></tr>";
    }).join("") : '<tr><td colspan="6"><div class="empty">Aún no tienes reservas.</div></td></tr>';
    var P = await api("/pedidos/mios");
    $("misPed").innerHTML = P.length ? P.map(function (p) {
      return "<tr><td><b>" + p.codigo + "</b></td><td>" + money(p.total) + "</td><td><span class='pill " + p.estado + "'>" + p.estado + "</span></td></tr>";
    }).join("") : '<tr><td colspan="3"><div class="empty">Aún no tienes pedidos.</div></td></tr>';
  } catch (e) { toast(e.message); }
}

/* ---------- panel admin ---------- */
async function loadPanel() {
  if (!user || user.rol !== "admin") { showView("home"); return toast("Solo el administrador puede ver el panel"); }
  try {
    var s = await api("/stats");
    $("kpis").innerHTML =
      kpi(s.reservas_total, "Reservas", "") + kpi(s.pendientes, "Pendientes", "warn") +
      kpi(s.confirmadas, "Confirmadas", "good") + kpi(money(s.ingresos), "Ingresos conf.", "");
    var max = Math.max.apply(null, s.por_servicio.map(function (x) { return x.n; }).concat([1]));
    $("rep").innerHTML = '<div class="l" style="font-weight:800;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)">Reservas por servicio</div>' +
      s.por_servicio.map(function (x) {
        return '<div class="reprow"><span>' + esc(x.servicio) + '</span><span class="bar"><i style="width:' + (x.n / max * 100) + '%"></i></span><span style="text-align:right">' + x.n + '</span></div>';
      }).join("");
  } catch (e) { toast(e.message); }
  loadAdminRes(); loadAdminPed();
}
function kpi(v, l, cls) { return '<div class="kpi ' + (cls || "") + '"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>'; }
async function loadAdminRes() {
  try {
    var f = $("filtro").value;
    var R = await api("/reservas" + (f !== "Todas" ? "?estado=" + f : ""));
    var tb = $("admRes"); tb.innerHTML = "";
    if (!R.length) { tb.innerHTML = '<tr><td colspan="9"><div class="empty">Sin reservas.</div></td></tr>'; return; }
    R.forEach(function (r) {
      var tr = document.createElement("tr");
      tr.innerHTML = "<td><b>" + r.codigo + "</b></td><td>" + esc(r.cliente_nombre) + "</td><td>" + esc(r.servicio || "") + "</td><td>" + (r.fecha || "—") +
        "</td><td>" + r.personas + "</td><td>" + r.canal + "</td><td>" + money(r.total) + "</td><td><span class='pill " + r.estado + "'>" + r.estado + "</span></td>";
      var td = document.createElement("td");
      if (r.estado !== "Confirmada") td.appendChild(mini("Confirmar", function () { setRes(r.id, "Confirmada"); }));
      if (r.estado !== "Cancelada") td.appendChild(mini("Cancelar", function () { setRes(r.id, "Cancelada"); }));
      td.appendChild(mini("🗑", function () { delRes(r.id); }));
      tr.appendChild(td); tb.appendChild(tr);
    });
  } catch (e) { toast(e.message); }
}
async function loadAdminPed() {
  try {
    var P = await api("/pedidos");
    var tb = $("admPed"); tb.innerHTML = "";
    if (!P.length) { tb.innerHTML = '<tr><td colspan="5"><div class="empty">Sin pedidos.</div></td></tr>'; return; }
    P.forEach(function (p) {
      var tr = document.createElement("tr");
      tr.innerHTML = "<td><b>" + p.codigo + "</b></td><td>" + esc(p.cliente_nombre) + "</td><td>" + money(p.total) + "</td><td><span class='pill " + p.estado + "'>" + p.estado + "</span></td>";
      var td = document.createElement("td");
      if (p.estado !== "Confirmada") td.appendChild(mini("Confirmar", function () { setPed(p.id, "Confirmada"); }));
      if (p.estado !== "Entregado") td.appendChild(mini("Entregado", function () { setPed(p.id, "Entregado"); }));
      tr.appendChild(td); tb.appendChild(tr);
    });
  } catch (e) { toast(e.message); }
}
function mini(t, fn) { var b = document.createElement("button"); b.className = "minibtn"; b.textContent = t; b.onclick = fn; return b; }
async function setRes(id, estado) { try { await api("/reservas/" + id + "/estado", { method: "PATCH", body: { estado: estado } }); loadPanel(); } catch (e) { toast(e.message); } }
async function delRes(id) { try { await api("/reservas/" + id, { method: "DELETE" }); loadPanel(); } catch (e) { toast(e.message); } }
async function setPed(id, estado) { try { await api("/pedidos/" + id + "/estado", { method: "PATCH", body: { estado: estado } }); loadPanel(); } catch (e) { toast(e.message); } }
$("filtro").onchange = loadAdminRes;

/* ---------- tema / menú ---------- */
(function () {
  var saved = null; try { saved = localStorage.getItem("tamesina.theme"); } catch (e) {}
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  $("themeBtn").onclick = function () {
    var cur = document.documentElement.getAttribute("data-theme");
    var dark = cur ? cur === "dark" : matchMedia("(prefers-color-scheme:dark)").matches;
    var next = dark ? "light" : "dark"; document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("tamesina.theme", next); } catch (e) {}
  };
})();
function closeMenu() { if (window.innerWidth <= 900) $("links").style.display = ""; }
$("menuBtn").onclick = function () { var l = $("links"); l.style.display = l.style.display === "flex" ? "" : "flex"; };

/* ---------- init ---------- */
updateUI(); loadCatalogo(); renderCart();
