const express = require('express');
const pool = require('../db');
const router = express.Router();

router.get('/servicios', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM servicios ORDER BY id');
  res.json(rows);
});

router.get('/productos', async (req, res) => {
  const { rows: prods } = await pool.query('SELECT * FROM productos ORDER BY id');
  const { rows: vars } = await pool.query('SELECT * FROM producto_variantes ORDER BY id');
  res.json(prods.map(p => ({ ...p, variantes: vars.filter(v => v.producto_id === p.id) })));
});

module.exports = router;
