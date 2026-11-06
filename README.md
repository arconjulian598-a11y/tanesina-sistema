# Sistema de información web — Tamesina S.A.S.

Sistema de información para la finca de café especial y turismo rural **Tamesina S.A.S.** (Támesis, Antioquia).
Permite reservar servicios (hospedaje, tour del café, avistamiento de aves), pedir productos (café, miel, arequipe)
y gestionar todo desde un panel. Incluye **cuentas por rol**: el **cliente** usa el catálogo, reserva y ve
solo lo suyo; el **administrador** es el único que ve el **panel con las estadísticas** y gestiona reservas y pedidos.

## Tecnologías
- **Backend:** Node.js + Express
- **Base de datos:** PostgreSQL
- **Autenticación:** JWT + bcrypt (contraseñas cifradas)
- **Frontend:** HTML, CSS y JavaScript (sin framework), servido por el backend

## Cuentas de prueba
| Rol | Correo | Contraseña |
|-----|--------|-----------|
| Administrador | admin@tamesina.com | admin123 |
| Cliente | cliente@tamesina.com | cliente123 |

> La base se **crea e inicializa sola** la primera vez que arranca el servidor (tablas + datos de ejemplo).

---

## Ejecutar en local

Requisitos: Node.js 18+ y PostgreSQL.

```bash
cd backend
npm install
cp .env.example .env      # pon tus datos de PostgreSQL local
createdb tamesina         # crea la base vacía
npm start                 # crea las tablas, carga ejemplos y levanta el servidor
```
Abre **http://localhost:3000**

---

## Subir a GitHub

1. Crea un repositorio vacío en github.com (por ejemplo `tamesina-sistema`).
2. Desde la carpeta del proyecto:
```bash
git init
git add .
git commit -m "Sistema de información Tamesina S.A.S."
git branch -M main
git remote add origin https://github.com/TU_USUARIO/tamesina-sistema.git
git push -u origin main
```
`node_modules` y `.env` no se suben (están en `.gitignore`).

---

## Desplegar en Render (gratis)

El archivo `render.yaml` ya deja todo configurado (base PostgreSQL + servicio web).

1. Entra a **render.com** e inicia sesión con GitHub.
2. **New + → Blueprint** y selecciona el repositorio `tamesina-sistema`.
3. Render leerá `render.yaml` y creará:
   - la base de datos **tamesina-db** (PostgreSQL, plan free),
   - el servicio web **tamesina**, con `DATABASE_URL` y `JWT_SECRET` ya conectados.
4. Pulsa **Apply**. Al terminar, tu sistema queda en una URL como
   `https://tamesina.onrender.com` — esa es la que le muestras a la empresa.

Al primer arranque se crean las tablas y los datos de ejemplo automáticamente.

> Nota: en el plan gratuito el servicio se "duerme" tras un rato sin uso; la primera visita
> después puede tardar ~30 segundos en responder. Es normal.

---

## Roles y permisos
- **cliente:** registrarse/iniciar sesión, reservar, pedir productos, ver *Mis reservas y pedidos*.
- **admin:** todo lo anterior más el panel con estadísticas, cambiar el estado de reservas/pedidos y eliminar reservas.
- El control se hace en el backend con `auth` y `requireRole('admin')`; el endpoint `/api/stats` es **solo admin**.

## Estructura
```
tamesina-sistema/
  render.yaml            # configuración de despliegue en Render
  backend/
    server.js            # servidor Express (inicializa la base al arrancar)
    db.js                # conexión PostgreSQL
    db-init.js           # crea tablas y carga datos de ejemplo
    schema.sql           # tablas
    middleware/auth.js   # JWT + roles
    routes/              # auth, catalogo, reservas, pedidos, stats
    public/              # frontend (index.html, app.js, styles.css, img/)
```

## Seguridad
- Cambia `JWT_SECRET` por una cadena larga (en Render se genera sola).
- Las contraseñas se guardan cifradas con bcrypt.
- Para producción, usa HTTPS (Render ya lo da) y restringe CORS al dominio real.
