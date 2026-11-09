// Tamesina S.A.S. — API en Cloudflare Workers + base de datos D1.
// Sirve también el frontend (carpeta backend/public) como recursos estáticos.

/* ================= Esquema de la base ================= */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, rol TEXT NOT NULL DEFAULT 'cliente' CHECK (rol IN ('admin','cliente')),
    telefono TEXT, creado_en TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS servicios (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, descripcion TEXT, precio INTEGER NOT NULL,
    por_persona INTEGER NOT NULL DEFAULT 0,
    tipo TEXT NOT NULL DEFAULT 'experiencia' CHECK (tipo IN ('hospedaje','experiencia')))`,
  `CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, descripcion TEXT)`,
  `CREATE TABLE IF NOT EXISTS producto_variantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    presentacion TEXT NOT NULL, precio INTEGER NOT NULL, stock INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS reservas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL, cliente_nombre TEXT NOT NULL,
    cliente_tel TEXT, cliente_correo TEXT, servicio_id INTEGER REFERENCES servicios(id) ON DELETE SET NULL,
    fecha TEXT, personas INTEGER NOT NULL DEFAULT 1,
    canal TEXT NOT NULL DEFAULT 'Web' CHECK (canal IN ('Web','WhatsApp','Llamada')),
    estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente','Confirmada','Cancelada')),
    total INTEGER NOT NULL DEFAULT 0, creado_en TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL, cliente_nombre TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente','Confirmada','Entregado','Cancelada')),
    total INTEGER NOT NULL DEFAULT 0, creado_en TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS pedido_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    variante_id INTEGER REFERENCES producto_variantes(id) ON DELETE SET NULL,
    nombre TEXT NOT NULL, cantidad INTEGER NOT NULL, subtotal INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)`
];

/* ================= Utilidades ================= */
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = buf => { let s = ''; new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); }); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const toUrl = s => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromUrl = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return s; };

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
const fail = (error, status) => json({ error }, status);

/* Contraseñas: PBKDF2-SHA256 con sal aleatoria (Web Crypto, nativo en Workers) */
const ITER = 30000;
async function derive(pw, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await derive(pw, salt, ITER))}`;
}
async function verifyPassword(pw, stored) {
  const [alg, it, saltB64, hashB64] = String(stored || '').split('$');
  if (alg !== 'pbkdf2') return false;
  const got = await derive(pw, unb64(saltB64), Number(it));
  const exp = unb64(hashB64);
  if (got.length !== exp.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ exp[i];
  return diff === 0;
}

/* Tokens JWT HS256 */
const TTL = 8 * 3600;
const hmacKey = secret => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
async function signJwt(payload, secret) {
  const now = Math.floor(Date.now() / 1000);
  const head = toUrl(b64(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))));
  const body = toUrl(b64(enc.encode(JSON.stringify({ ...payload, iat: now, exp: now + TTL }))));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(head + '.' + body));
  return `${head}.${body}.${toUrl(b64(sig))}`;
}
async function verifyJwt(token, secret) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64(fromUrl(sig)), enc.encode(head + '.' + body));
    if (!ok) return null;
    const p = JSON.parse(dec.decode(unb64(fromUrl(body))));
    if (!p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch (e) { return null; }
}

/* ================= Inicialización (tablas + datos de ejemplo) ================= */
let ready = null;
function ensureDb(env) {
  if (!ready) ready = initDb(env).catch(e => { ready = null; throw e; });
  return ready;
}
async function initDb(env) {
  await env.DB.batch(SCHEMA.map(s => env.DB.prepare(s)));
  const row = await env.DB.prepare('SELECT COUNT(*) AS c FROM usuarios').first();
  if (row.c === 0) await seed(env.DB);
}
async function seed(db) {
  const [admin, cliente] = await Promise.all([hashPassword('admin123'), hashPassword('cliente123')]);
  const s = [
    db.prepare("INSERT OR IGNORE INTO usuarios (nombre,email,password_hash,rol,telefono) VALUES (?,?,?,'admin',?)")
      .bind('Administrador Tamesina', 'admin@tamesina.com', admin, '3205311483'),
    db.prepare("INSERT OR IGNORE INTO usuarios (nombre,email,password_hash,rol,telefono) VALUES (?,?,?,'cliente',?)")
      .bind('Cliente Demo', 'cliente@tamesina.com', cliente, '3001234567')
  ];
  const servicios = [
    ['Habitación Doble', 'Espacio acogedor con vista al jardín, ideal para parejas.', 120000, 0, 'hospedaje'],
    ['Suite Familiar', 'Amplia habitación con capacidad para cuatro personas.', 200000, 0, 'hospedaje'],
    ['Tour del café', 'Recorrido por el proceso del café, con show de barismo.', 45000, 1, 'experiencia'],
    ['Avistamiento de aves', 'Senderos con guías expertos y especies endémicas.', 60000, 1, 'experiencia']
  ];
  servicios.forEach(v => s.push(db.prepare('INSERT INTO servicios (nombre,descripcion,precio,por_persona,tipo) VALUES (?,?,?,?,?)').bind(...v)));
  const productos = [
    ['Café Honey', 'Café especial con dulzura natural y aroma intenso.', [['500 g', 42000, 30], ['250 g', 23000, 40], ['125 g', 12000, 50]]],
    ['Café Lavado', 'Sabor limpio y fresco, ideal para paladares exigentes.', [['500 g', 38000, 30], ['250 g', 20000, 40], ['125 g', 10000, 50]]],
    ['Café Natural', 'Frutal y dulce, con cuerpo y notas intensas.', [['500 g', 45000, 25], ['250 g', 30000, 35], ['125 g', 15000, 45]]],
    ['Miel Pura de Abejas', 'Miel pura producida en la finca.', [['500 ml', 25000, 40]]],
    ['Arequipe de Café', 'Arequipe artesanal con el café de la casa.', [['150 g', 12000, 60]]]
  ];
  productos.forEach(([nombre, desc, vars]) => {
    s.push(db.prepare('INSERT INTO productos (nombre,descripcion) VALUES (?,?)').bind(nombre, desc));
    vars.forEach(([pres, precio, stock]) => s.push(db.prepare(
      'INSERT INTO producto_variantes (producto_id,presentacion,precio,stock) VALUES ((SELECT id FROM productos WHERE nombre=?),?,?,?)'
    ).bind(nombre, pres, precio, stock)));
  });
  await db.batch(s);
}

/* Clave para firmar los tokens: usa JWT_SECRET si existe; si no, la crea una vez y la guarda en D1 */
let secretCache = null;
async function getSecret(env) {
  if (env.JWT_SECRET) return env.JWT_SECRET;
  if (secretCache) return secretCache;
  await env.DB.prepare("INSERT OR IGNORE INTO config (clave, valor) VALUES ('jwt_secret', ?)")
    .bind(b64(crypto.getRandomValues(new Uint8Array(32)))).run();
  const r = await env.DB.prepare("SELECT valor FROM config WHERE clave = 'jwt_secret'").first();
  return (secretCache = r.valor);
}

/* ================= API ================= */
async function nextCode(db, table, prefix) {
  const r = await db.prepare(
    `SELECT COALESCE(MAX(CAST(substr(codigo, ${prefix.length + 1}) AS INTEGER)),0)+1 AS n FROM ${table}`).first();
  return prefix + String(r.n).padStart(4, '0');
}
const n = v => (v === undefined || v === '' ? null : v);

async function handleApi(request, env, url) {
  const db = env.DB;
  const method = request.method;
  const path = url.pathname.replace(/\/+$/, '');
  const SECRET = await getSecret(env);
  const body = (method === 'POST' || method === 'PATCH') ? await request.json().catch(() => ({})) : {};

  const header = request.headers.get('Authorization') || '';
  const user = header.startsWith('Bearer ') ? await verifyJwt(header.slice(7), SECRET) : null;
  const needUser = () => (user ? null : fail('No autenticado', 401));
  const needAdmin = () => (!user ? fail('No autenticado', 401) : user.rol !== 'admin' ? fail('No tienes permisos para esta acción', 403) : null);
  let m;

  /* ----- salud ----- */
  if (method === 'GET' && path === '/api/health') return json({ ok: true });

  /* ----- autenticación ----- */
  if (method === 'POST' && path === '/api/auth/register') {
    const { nombre, email, password, telefono } = body;
    if (!nombre || !email || !password) return fail('Nombre, correo y contraseña son obligatorios', 400);
    try {
      const r = await db.prepare("INSERT INTO usuarios (nombre,email,password_hash,rol,telefono) VALUES (?,?,?,'cliente',?)")
        .bind(nombre, email, await hashPassword(password), n(telefono)).run();
      const u = { id: r.meta.last_row_id, nombre, rol: 'cliente' };
      return json({ token: await signJwt(u, SECRET), user: u }, 201);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return fail('Ese correo ya está registrado', 409);
      throw e;
    }
  }
  if (method === 'POST' && path === '/api/auth/login') {
    const { email, password } = body;
    if (!email || !password) return fail('Correo y contraseña son obligatorios', 400);
    const u = await db.prepare('SELECT * FROM usuarios WHERE email = ?').bind(email).first();
    if (!u || !(await verifyPassword(password, u.password_hash))) return fail('Credenciales incorrectas', 401);
    const pub = { id: u.id, nombre: u.nombre, rol: u.rol };
    return json({ token: await signJwt(pub, SECRET), user: pub });
  }
  if (method === 'GET' && path === '/api/auth/me') return needUser() || json({ user });

  /* ----- catálogo (lectura pública) ----- */
  if (method === 'GET' && path === '/api/servicios') {
    const { results } = await db.prepare('SELECT * FROM servicios ORDER BY id').all();
    return json(results);
  }
  if (method === 'GET' && path === '/api/productos') {
    const [p, v] = await db.batch([
      db.prepare('SELECT * FROM productos ORDER BY id'),
      db.prepare('SELECT * FROM producto_variantes ORDER BY id')
    ]);
    return json(p.results.map(x => ({ ...x, variantes: v.results.filter(y => y.producto_id === x.id) })));
  }

  /* ----- catálogo (gestión, solo admin) ----- */
  if (method === 'PATCH' && (m = path.match(/^\/api\/servicios\/(\d+)$/))) {
    const no = needAdmin(); if (no) return no;
    const { nombre, descripcion, precio, por_persona } = body;
    await db.prepare(`UPDATE servicios SET nombre=COALESCE(?,nombre), descripcion=COALESCE(?,descripcion),
      precio=COALESCE(?,precio), por_persona=COALESCE(?,por_persona) WHERE id=?`)
      .bind(n(nombre), n(descripcion), n(precio), typeof por_persona === 'boolean' ? (por_persona ? 1 : 0) : null, m[1]).run();
    return json({ ok: true });
  }
  if (method === 'POST' && path === '/api/productos') {
    const no = needAdmin(); if (no) return no;
    if (!body.nombre) return fail('El nombre es obligatorio', 400);
    const r = await db.prepare('INSERT INTO productos (nombre,descripcion) VALUES (?,?)').bind(body.nombre, n(body.descripcion)).run();
    return json({ id: r.meta.last_row_id }, 201);
  }
  if (method === 'PATCH' && (m = path.match(/^\/api\/productos\/(\d+)$/))) {
    const no = needAdmin(); if (no) return no;
    await db.prepare('UPDATE productos SET nombre=COALESCE(?,nombre), descripcion=COALESCE(?,descripcion) WHERE id=?')
      .bind(n(body.nombre), n(body.descripcion), m[1]).run();
    return json({ ok: true });
  }
  if (method === 'DELETE' && (m = path.match(/^\/api\/productos\/(\d+)$/))) {
    const no = needAdmin(); if (no) return no;
    await db.batch([
      db.prepare('DELETE FROM producto_variantes WHERE producto_id=?').bind(m[1]),
      db.prepare('DELETE FROM productos WHERE id=?').bind(m[1])
    ]);
    return json({ ok: true });
  }
  if (method === 'POST' && (m = path.match(/^\/api\/productos\/(\d+)\/variantes$/))) {
    const no = needAdmin(); if (no) return no;
    const { presentacion, precio, stock } = body;
    if (!presentacion || precio == null || precio === '') return fail('Presentación y precio son obligatorios', 400);
    const r = await db.prepare('INSERT INTO producto_variantes (producto_id,presentacion,precio,stock) VALUES (?,?,?,?)')
      .bind(m[1], presentacion, precio, stock || 0).run();
    return json({ id: r.meta.last_row_id }, 201);
  }
  if (method === 'PATCH' && (m = path.match(/^\/api\/variantes\/(\d+)$/))) {
    const no = needAdmin(); if (no) return no;
    await db.prepare('UPDATE producto_variantes SET presentacion=COALESCE(?,presentacion), precio=COALESCE(?,precio), stock=COALESCE(?,stock) WHERE id=?')
      .bind(n(body.presentacion), n(body.precio), n(body.stock), m[1]).run();
    return json({ ok: true });
  }
  if (method === 'DELETE' && (m = path.match(/^\/api\/variantes\/(\d+)$/))) {
    const no = needAdmin(); if (no) return no;
    await db.prepare('DELETE FROM producto_variantes WHERE id=?').bind(m[1]).run();
    return json({ ok: true });
  }

  /* ----- reservas ----- */
  if (method === 'POST' && path === '/api/reservas') {
    const no = needUser(); if (no) return no;
    const { servicio_id, fecha, personas, canal, tel, correo } = body;
    if (!servicio_id || !fecha) return fail('Servicio y fecha son obligatorios', 400);
    const serv = await db.prepare('SELECT * FROM servicios WHERE id = ?').bind(servicio_id).first();
    if (!serv) return fail('Servicio no encontrado', 404);
    const pers = Math.max(1, parseInt(personas, 10) || 1);
    const total = serv.precio * (serv.por_persona ? pers : 1);
    const codigo = await nextCode(db, 'reservas', 'R-');
    const r = await db.prepare(`INSERT INTO reservas (codigo,usuario_id,cliente_nombre,cliente_tel,cliente_correo,servicio_id,fecha,personas,canal,estado,total)
      VALUES (?,?,?,?,?,?,?,?,?,'Pendiente',?)`)
      .bind(codigo, user.id, user.nombre, n(tel), n(correo), servicio_id, fecha, pers,
        ['Web', 'WhatsApp', 'Llamada'].includes(canal) ? canal : 'Web', total).run();
    return json({ id: r.meta.last_row_id, codigo, estado: 'Pendiente', total }, 201);
  }
  if (method === 'GET' && path === '/api/reservas/mias') {
    const no = needUser(); if (no) return no;
    const { results } = await db.prepare(`SELECT r.*, s.nombre AS servicio FROM reservas r
      LEFT JOIN servicios s ON s.id = r.servicio_id WHERE r.usuario_id = ? ORDER BY r.id DESC`).bind(user.id).all();
    return json(results);
  }
  if (method === 'GET' && path === '/api/reservas') {
    const no = needAdmin(); if (no) return no;
    const estado = url.searchParams.get('estado');
    let sql = 'SELECT r.*, s.nombre AS servicio FROM reservas r LEFT JOIN servicios s ON s.id = r.servicio_id';
    const args = [];
    if (estado && estado !== 'Todas') { sql += ' WHERE r.estado = ?'; args.push(estado); }
    const { results } = await db.prepare(sql + ' ORDER BY r.id DESC').bind(...args).all();
    return json(results);
  }
  if (method === 'PATCH' && (m = path.match(/^\/api\/reservas\/(\d+)\/estado$/))) {
    const no = needAdmin(); if (no) return no;
    if (!['Pendiente', 'Confirmada', 'Cancelada'].includes(body.estado)) return fail('Estado inválido', 400);
    await db.prepare('UPDATE reservas SET estado = ? WHERE id = ?').bind(body.estado, m[1]).run();
    return json({ ok: true });
  }
  if (method === 'DELETE' && (m = path.match(/^\/api\/reservas\/(\d+)$/))) {
    const no = needAdmin(); if (no) return no;
    await db.prepare('DELETE FROM reservas WHERE id = ?').bind(m[1]).run();
    return json({ ok: true });
  }

  /* ----- pedidos ----- */
  if (method === 'POST' && path === '/api/pedidos') {
    const no = needUser(); if (no) return no;
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return fail('El pedido no tiene productos', 400);
    let total = 0;
    const detalle = [];
    for (const it of items) {
      const v = await db.prepare(`SELECT pv.*, p.nombre AS producto FROM producto_variantes pv
        JOIN productos p ON p.id = pv.producto_id WHERE pv.id = ?`).bind(it.variante_id).first();
      if (!v) return fail('Uno de los productos ya no existe', 400);
      const cant = Math.max(1, parseInt(it.cantidad, 10) || 1);
      total += v.precio * cant;
      detalle.push([v.id, `${v.producto} ${v.presentacion}`, cant, v.precio * cant]);
    }
    const codigo = await nextCode(db, 'pedidos', 'PE-');
    const stmts = [db.prepare("INSERT INTO pedidos (codigo,usuario_id,cliente_nombre,estado,total) VALUES (?,?,?,'Pendiente',?)")
      .bind(codigo, user.id, user.nombre, total)];
    detalle.forEach(d => stmts.push(db.prepare(
      'INSERT INTO pedido_items (pedido_id,variante_id,nombre,cantidad,subtotal) VALUES ((SELECT id FROM pedidos WHERE codigo=?),?,?,?,?)'
    ).bind(codigo, ...d)));
    await db.batch(stmts);
    const row = await db.prepare('SELECT id FROM pedidos WHERE codigo = ?').bind(codigo).first();
    return json({ id: row.id, codigo, total, estado: 'Pendiente' }, 201);
  }
  if (method === 'GET' && path === '/api/pedidos/mios') {
    const no = needUser(); if (no) return no;
    const { results } = await db.prepare('SELECT * FROM pedidos WHERE usuario_id = ? ORDER BY id DESC').bind(user.id).all();
    return json(results);
  }
  if (method === 'GET' && path === '/api/pedidos') {
    const no = needAdmin(); if (no) return no;
    const { results } = await db.prepare('SELECT * FROM pedidos ORDER BY id DESC').all();
    return json(results);
  }
  if (method === 'PATCH' && (m = path.match(/^\/api\/pedidos\/(\d+)\/estado$/))) {
    const no = needAdmin(); if (no) return no;
    if (!['Pendiente', 'Confirmada', 'Entregado', 'Cancelada'].includes(body.estado)) return fail('Estado inválido', 400);
    await db.prepare('UPDATE pedidos SET estado = ? WHERE id = ?').bind(body.estado, m[1]).run();
    return json({ ok: true });
  }

  /* ----- estadísticas (solo admin) ----- */
  if (method === 'GET' && path === '/api/stats') {
    const no = needAdmin(); if (no) return no;
    const [a, b, c] = await db.batch([
      db.prepare(`SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN estado='Pendiente' THEN 1 ELSE 0 END),0) AS pendientes,
        COALESCE(SUM(CASE WHEN estado='Confirmada' THEN 1 ELSE 0 END),0) AS confirmadas,
        COALESCE(SUM(CASE WHEN estado='Cancelada' THEN 1 ELSE 0 END),0) AS canceladas,
        COALESCE(SUM(CASE WHEN estado='Confirmada' THEN total ELSE 0 END),0) AS ingresos FROM reservas`),
      db.prepare('SELECT COUNT(*) AS pedidos FROM pedidos'),
      db.prepare(`SELECT s.nombre AS servicio, COUNT(r.id) AS n FROM servicios s
        LEFT JOIN reservas r ON r.servicio_id = s.id GROUP BY s.id ORDER BY n DESC`)
    ]);
    const r = a.results[0];
    return json({
      reservas_total: r.total, pendientes: r.pendientes, confirmadas: r.confirmadas, canceladas: r.canceladas,
      ingresos: r.ingresos, pedidos_total: b.results[0].pedidos, por_servicio: c.results
    });
  }

  return fail('Ruta no encontrada', 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      await ensureDb(env);
      return await handleApi(request, env, url);
    } catch (e) {
      console.error(e);
      return fail('Error del servidor', 500);
    }
  }
};
