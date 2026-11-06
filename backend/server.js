require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { init } = require('./db-init');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/catalogo'));
app.use('/api/reservas', require('./routes/reservas'));
app.use('/api/pedidos', require('./routes/pedidos'));
app.use('/api/stats', require('./routes/stats'));
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
init()
  .then(() => app.listen(PORT, () => console.log(`Tamesina corriendo en http://localhost:${PORT}`)))
  .catch(err => { console.error('No se pudo inicializar la base de datos:', err.message); process.exit(1); });
