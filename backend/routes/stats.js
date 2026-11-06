const express = require('express');
const pool = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const router = express.Router();

// Estadísticas del panel: SOLO administrador
router.get('/', auth, requireRole('admin'), async (req, res) => {
  try {
    const { rows: a } = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE estado='Pendiente')::int AS pendientes,
              COUNT(*) FILTER (WHERE estado='Confirmada')::int AS confirmadas,
              COUNT(*) FILTER (WHERE estado='Cancelada')::int AS canceladas,
              COALESCE(SUM(total) FILTER (WHERE estado='Confirmada'),0)::int AS ingresos
       FROM reservas`);
    const { rows: b } = await pool.query('SELECT COUNT(*)::int AS pedidos FROM pedidos');
    const { rows: porServicio } = await pool.query(
      `SELECT s.nombre AS servicio, COUNT(r.id)::int AS n
       FROM servicios s LEFT JOIN reservas r ON r.servicio_id = s.id
       GROUP BY s.id, s.nombre ORDER BY n DESC`);
    res.json({
      reservas_total: a[0].total, pendientes: a[0].pendientes, confirmadas: a[0].confirmadas,
      canceladas: a[0].canceladas, ingresos: a[0].ingresos, pedidos_total: b[0].pedidos,
      por_servicio: porServicio
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron cargar las estadísticas' });
  }
});

module.exports = router;
