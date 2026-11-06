const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { auth, SECRET } = require('../middleware/auth');

const router = express.Router();
const EXPIRES = process.env.JWT_EXPIRES || '8h';
const tokenFor = u => jwt.sign({ id: u.id, nombre: u.nombre, rol: u.rol }, SECRET, { expiresIn: EXPIRES });

router.post('/register', async (req, res) => {
  const { nombre, email, password, telefono } = req.body || {};
  if (!nombre || !email || !password) return res.status(400).json({ error: 'Nombre, correo y contraseña son obligatorios' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nombre,email,password_hash,rol,telefono) VALUES ($1,$2,$3,'cliente',$4) RETURNING id`,
      [nombre, email, hash, telefono || null]
    );
    const user = { id: rows[0].id, nombre, rol: 'cliente' };
    res.status(201).json({ token: tokenFor(user), user });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ese correo ya está registrado' });
    res.status(500).json({ error: 'No se pudo registrar' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Correo y contraseña son obligatorios' });
  try {
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    const u = rows[0];
    if (!u || !(await bcrypt.compare(password, u.password_hash))) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const user = { id: u.id, nombre: u.nombre, rol: u.rol };
    res.json({ token: tokenFor(user), user });
  } catch (e) {
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

router.get('/me', auth, (req, res) => res.json({ user: req.user }));

module.exports = router;
