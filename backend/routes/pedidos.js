const express = require('express');
const pool = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const router = express.Router();

async function nextCode(client) {
  const { rows } = await client.query(
    "SELECT COALESCE(MAX(CAST(SUBSTRING(codigo FROM 4) AS INTEGER)),0)+1 AS n FROM pedidos");
  return 'PE-' + String(rows[0].n).padStart(4, '0');
}

// Crear pedido con items. Body: { items:[{variante_id, cantidad}] }
router.post('/', auth, async (req, res) => {
  const items = (req.body && req.body.items) || [];
  if (!items.length) return res.status(400).json({ error: 'El pedido no tiene productos' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let total = 0;
    const detalle = [];
    for (const it of items) {
      const { rows } = await client.query(
        `SELECT pv.*, p.nombre AS producto FROM producto_variantes pv
         JOIN productos p ON p.id = pv.producto_id WHERE pv.id = $1`, [it.variante_id]);
      const v = rows[0];
      if (!v) throw new Error('Variante inexistente');
      const cant = Math.max(1, parseInt(it.cantidad, 10) || 1);
      const subtotal = v.precio * cant;
      total += subtotal;
      detalle.push({ variante_id: v.id, nombre: `${v.producto} ${v.presentacion}`, cantidad: cant, subtotal });
    }
    const codigo = await nextCode(client);
    const { rows: pr } = await client.query(
      `INSERT INTO pedidos (codigo,usuario_id,cliente_nombre,estado,total) VALUES ($1,$2,$3,'Pendiente',$4) RETURNING id`,
      [codigo, req.user.id, req.user.nombre, total]);
    const pid = pr[0].id;
    for (const d of detalle) {
      await client.query('INSERT INTO pedido_items (pedido_id,variante_id,nombre,cantidad,subtotal) VALUES ($1,$2,$3,$4,$5)',
        [pid, d.variante_id, d.nombre, d.cantidad, d.subtotal]);
    }
    await client.query('COMMIT');
    res.status(201).json({ id: pid, codigo, total, estado: 'Pendiente' });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'No se pudo crear el pedido' });
  } finally {
    client.release();
  }
});

router.get('/mios', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY id DESC', [req.user.id]);
  res.json(rows);
});

router.get('/', auth, requireRole('admin'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM pedidos ORDER BY id DESC');
  res.json(rows);
});

router.patch('/:id/estado', auth, requireRole('admin'), async (req, res) => {
  const { estado } = req.body || {};
  if (!['Pendiente', 'Confirmada', 'Entregado', 'Cancelada'].includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
  await pool.query('UPDATE pedidos SET estado = $1 WHERE id = $2', [estado, req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
