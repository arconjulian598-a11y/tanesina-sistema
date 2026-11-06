const express = require('express');
const pool = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const router = express.Router();
const admin = [auth, requireRole('admin')];

/* ----- lectura pública ----- */
router.get('/servicios', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM servicios ORDER BY id');
  res.json(rows);
});

router.get('/productos', async (req, res) => {
  const { rows: prods } = await pool.query('SELECT * FROM productos ORDER BY id');
  const { rows: vars } = await pool.query('SELECT * FROM producto_variantes ORDER BY id');
  res.json(prods.map(p => ({ ...p, variantes: vars.filter(v => v.producto_id === p.id) })));
});

/* ----- gestión del catálogo (solo admin) ----- */
// Servicios: reservas y habitaciones
router.patch('/servicios/:id', admin, async (req, res) => {
  const { nombre, descripcion, precio, por_persona } = req.body || {};
  await pool.query(
    `UPDATE servicios SET nombre=COALESCE($1,nombre), descripcion=COALESCE($2,descripcion),
     precio=COALESCE($3,precio), por_persona=COALESCE($4,por_persona) WHERE id=$5`,
    [nombre ?? null, descripcion ?? null, precio ?? null, typeof por_persona === 'boolean' ? por_persona : null, req.params.id]);
  res.json({ ok: true });
});

// Productos
router.post('/productos', admin, async (req, res) => {
  const { nombre, descripcion } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const { rows } = await pool.query('INSERT INTO productos (nombre,descripcion) VALUES ($1,$2) RETURNING id', [nombre, descripcion || null]);
  res.status(201).json({ id: rows[0].id });
});
router.patch('/productos/:id', admin, async (req, res) => {
  const { nombre, descripcion } = req.body || {};
  await pool.query('UPDATE productos SET nombre=COALESCE($1,nombre), descripcion=COALESCE($2,descripcion) WHERE id=$3',
    [nombre ?? null, descripcion ?? null, req.params.id]);
  res.json({ ok: true });
});
router.delete('/productos/:id', admin, async (req, res) => {
  await pool.query('DELETE FROM productos WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// Presentaciones (variantes) de cada producto
router.post('/productos/:id/variantes', admin, async (req, res) => {
  const { presentacion, precio, stock } = req.body || {};
  if (!presentacion || precio == null) return res.status(400).json({ error: 'Presentación y precio son obligatorios' });
  const { rows } = await pool.query('INSERT INTO producto_variantes (producto_id,presentacion,precio,stock) VALUES ($1,$2,$3,$4) RETURNING id',
    [req.params.id, presentacion, precio, stock || 0]);
  res.status(201).json({ id: rows[0].id });
});
router.patch('/variantes/:id', admin, async (req, res) => {
  const { presentacion, precio, stock } = req.body || {};
  await pool.query('UPDATE producto_variantes SET presentacion=COALESCE($1,presentacion), precio=COALESCE($2,precio), stock=COALESCE($3,stock) WHERE id=$4',
    [presentacion ?? null, precio ?? null, stock ?? null, req.params.id]);
  res.json({ ok: true });
});
router.delete('/variantes/:id', admin, async (req, res) => {
  await pool.query('DELETE FROM producto_variantes WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
