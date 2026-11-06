// Crea las tablas (si no existen) y carga datos iniciales si la base está vacía.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./db');

async function init() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM usuarios');
  if (rows[0].c === 0) {
    await seed();
    console.log('Base inicializada con datos de ejemplo.');
  }
}

async function seed() {
  const adminHash = await bcrypt.hash('admin123', 10);
  const cliHash = await bcrypt.hash('cliente123', 10);

  await pool.query('TRUNCATE pedido_items, pedidos, reservas, producto_variantes, productos, servicios, usuarios RESTART IDENTITY CASCADE');

  await pool.query(
    `INSERT INTO usuarios (nombre,email,password_hash,rol,telefono) VALUES
     ($1,$2,$3,'admin',$4),($5,$6,$7,'cliente',$8)`,
    ['Administrador Tamesina', 'admin@tamesina.com', adminHash, '3205311483',
     'Cliente Demo', 'cliente@tamesina.com', cliHash, '3001234567']
  );

  await pool.query(
    `INSERT INTO servicios (nombre,descripcion,precio,por_persona,tipo) VALUES
     ('Habitación Doble','Espacio acogedor con vista al jardín, ideal para parejas.',120000,false,'hospedaje'),
     ('Suite Familiar','Amplia habitación con capacidad para cuatro personas.',200000,false,'hospedaje'),
     ('Tour del café','Recorrido por el proceso del café, con show de barismo.',45000,true,'experiencia'),
     ('Avistamiento de aves','Senderos con guías expertos y especies endémicas.',60000,true,'experiencia')`
  );

  const productos = [
    ['Café Honey', 'Café especial con dulzura natural y aroma intenso.', [['500 g', 42000, 30], ['250 g', 23000, 40], ['125 g', 12000, 50]]],
    ['Café Lavado', 'Sabor limpio y fresco, ideal para paladares exigentes.', [['500 g', 38000, 30], ['250 g', 20000, 40], ['125 g', 10000, 50]]],
    ['Café Natural', 'Frutal y dulce, con cuerpo y notas intensas.', [['500 g', 45000, 25], ['250 g', 30000, 35], ['125 g', 15000, 45]]],
    ['Miel Pura de Abejas', 'Miel pura producida en la finca.', [['500 ml', 25000, 40]]],
    ['Arequipe de Café', 'Arequipe artesanal con el café de la casa.', [['150 g', 12000, 60]]]
  ];
  for (const [nombre, desc, vars] of productos) {
    const { rows } = await pool.query('INSERT INTO productos (nombre,descripcion) VALUES ($1,$2) RETURNING id', [nombre, desc]);
    const pid = rows[0].id;
    for (const [pres, precio, stock] of vars) {
      await pool.query('INSERT INTO producto_variantes (producto_id,presentacion,precio,stock) VALUES ($1,$2,$3,$4)', [pid, pres, precio, stock]);
    }
  }
}

module.exports = { init, seed };
