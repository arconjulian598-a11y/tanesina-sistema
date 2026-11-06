-- Esquema PostgreSQL del sistema de informacion de Tamesina S.A.S.
-- Se ejecuta automáticamente al iniciar el servidor (db-init.js).

CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  nombre        VARCHAR(120) NOT NULL,
  email         VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol           VARCHAR(20) NOT NULL DEFAULT 'cliente' CHECK (rol IN ('admin','cliente')),
  telefono      VARCHAR(40),
  creado_en     TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS servicios (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(120) NOT NULL,
  descripcion TEXT,
  precio      INTEGER NOT NULL,
  por_persona BOOLEAN NOT NULL DEFAULT false,
  tipo        VARCHAR(20) NOT NULL DEFAULT 'experiencia' CHECK (tipo IN ('hospedaje','experiencia'))
);

CREATE TABLE IF NOT EXISTS productos (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(120) NOT NULL,
  descripcion TEXT
);

CREATE TABLE IF NOT EXISTS producto_variantes (
  id           SERIAL PRIMARY KEY,
  producto_id  INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  presentacion VARCHAR(60) NOT NULL,
  precio       INTEGER NOT NULL,
  stock        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reservas (
  id             SERIAL PRIMARY KEY,
  codigo         VARCHAR(20) NOT NULL UNIQUE,
  usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  cliente_nombre VARCHAR(120) NOT NULL,
  cliente_tel    VARCHAR(40),
  cliente_correo VARCHAR(160),
  servicio_id    INTEGER REFERENCES servicios(id) ON DELETE SET NULL,
  fecha          DATE,
  personas       INTEGER NOT NULL DEFAULT 1,
  canal          VARCHAR(20) NOT NULL DEFAULT 'Web' CHECK (canal IN ('Web','WhatsApp','Llamada')),
  estado         VARCHAR(20) NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente','Confirmada','Cancelada')),
  total          INTEGER NOT NULL DEFAULT 0,
  creado_en      TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pedidos (
  id             SERIAL PRIMARY KEY,
  codigo         VARCHAR(20) NOT NULL UNIQUE,
  usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  cliente_nombre VARCHAR(120) NOT NULL,
  estado         VARCHAR(20) NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente','Confirmada','Entregado','Cancelada')),
  total          INTEGER NOT NULL DEFAULT 0,
  creado_en      TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pedido_items (
  id          SERIAL PRIMARY KEY,
  pedido_id   INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  variante_id INTEGER REFERENCES producto_variantes(id) ON DELETE SET NULL,
  nombre      VARCHAR(160) NOT NULL,
  cantidad    INTEGER NOT NULL,
  subtotal    INTEGER NOT NULL
);
