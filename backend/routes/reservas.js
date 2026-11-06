const express = require('express');
const pool = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const router = express.Router();

async function nextCode() {
  const { rows } = await pool.query(
    "SELECT COALESCE(MAX(CAST(SUBSTRING(codigo FROM 3) AS INTEGER)),0)+1 AS n FROM reservas");
  return 'R-' + String(rows[0].n).padStart(4, '0');
}

// Crear reserva (cliente o admin autenticado)
router.post('/', auth, async (req, res) => {
  const { servicio_id, fecha, personas, canal, tel, correo } = req.body || {};
  if (!servicio_id || !fecha) return res.status(400).json({ error: 'Servicio y fecha son obligatorios' });
  try {
    const { rows: sv } = await pool.query('SELECT * FROM servicios WHERE id = $1', [servicio_id]);
    const serv = sv[0];
    if (!serv) return res.status(404).json({ error: 'Servicio no encontrado' });
    const pers = Math.max(1, parseInt(personas, 10) || 1);
    const total = serv.precio * (serv.por_persona ? pers : 1);
    const codigo = await nextCode();
    const { rows } = await pool.query(
      `INSERT INTO reservas (codigo,usuario_id,cliente_nombre,cliente_tel,cliente_correo,servicio_id,fecha,personas,canal,estado,total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Pendiente',$10) RETURNING id`,
      [codigo, req.user.id, req.user.nombre, tel || null, correo || null, servicio_id, fecha, pers, canal || 'Web', total]
    );
    res.status(201).json({ id: rows[0].id, codigo, estado: 'Pendiente', total });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo crear la reserva' });
  }
});

// Mis reservas (cliente)
router.get('/mias', auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.*, to_char(r.fecha,'YYYY-MM-DD') AS fecha, s.nombre AS servicio
     FROM reservas r LEFT JOIN servicios s ON s.id = r.servicio_id
     WHERE r.usuario_id = $1 ORDER BY r.id DESC`, [req.user.id]);
  res.json(rows);
});

// Todas (solo admin)
router.get('/', auth, requireRole('admin'), async (req, res) => {
  const { estado } = req.query;
  let sql = `SELECT r.*, to_char(r.fecha,'YYYY-MM-DD') AS fecha, s.nombre AS servicio
             FROM reservas r LEFT JOIN servicios s ON s.id = r.servicio_id`;
  const params = [];
  if (estado && estado !== 'Todas') { sql += ' WHERE r.estado = $1'; params.push(estado); }
  sql += ' ORDER BY r.id DESC';
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

router.patch('/:id/estado', auth, requireRole('admin'), async (req, res) => {
  const { estado } = req.body || {};
  if (!['Pendiente', 'Confirmada', 'Cancelada'].includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
  await pool.query('UPDATE reservas SET estado = $1 WHERE id = $2', [estado, req.params.id]);
  res.json({ ok: true });
});

router.delete('/:id', auth, requireRole('admin'), async (req, res) => {
  await pool.query('DELETE FROM reservas WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
