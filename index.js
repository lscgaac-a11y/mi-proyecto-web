require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://proceso2027_user:xFv2qxkP4NRwuv7Fh4hxL3W0aJboVQVI@dpg-dbno1atg1s2s73d7k9tg-a.oregon-postgres.render.com/proceso2027?sslmode=verify-full',
  ssl: { rejectUnauthorized: false }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inicializar Tablas y Usuario Admin por defecto
async function iniciarBaseDeDatos() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        usuario VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(50) NOT NULL,
        rol VARCHAR(20) NOT NULL,
        seccion_asignada VARCHAR(50)
      );
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS simpatizantes (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(150) NOT NULL,
        telefono VARCHAR(20),
        seccion VARCHAR(50) NOT NULL,
        localidad VARCHAR(100),
        referencia TEXT,
        asistio BOOLEAN DEFAULT FALSE,
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Crear admin por defecto si no existe
    const adminCheck = await pool.query("SELECT * FROM usuarios WHERE rol = 'admin'");
    if (adminCheck.rows.length === 0) {
      await pool.query(
        "INSERT INTO usuarios (usuario, password, rol) VALUES ($1, $2, $3)",
        ['admin', 'admin123', 'admin']
      );
      console.log('✅ Creado usuario administrador por defecto (admin / admin123)');
    }
    console.log('✅ Base de datos de simpatizantes lista.');
  } catch (error) {
    console.error('❌ Error al inicializar tablas:', error.message);
  }
}
iniciarBaseDeDatos();

// --- RUTAS DE LA API ---

// 1. Login
app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    const user = await pool.query('SELECT id, usuario, rol, seccion_asignada FROM usuarios WHERE usuario = $1 AND password = $2', [usuario, password]);
    if (user.rows.length === 0) return res.status(401).json({ error: 'Credenciales incorrectas' });
    res.json(user.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// 2. Administrador: Crear usuarios (Capturistas o Pase de Lista)
app.post('/api/usuarios', async (req, res) => {
  const { usuario, password, rol, seccion_asignada } = req.body;
  try {
    await pool.query(
      'INSERT INTO usuarios (usuario, password, rol, seccion_asignada) VALUES ($1, $2, $3, $4)',
      [usuario, password, rol, seccion_asignada || null]
    );
    res.status(201).json({ mensaje: 'Usuario creado' });
  } catch (error) {
    res.status(400).json({ error: 'El usuario ya existe o hubo un error' });
  }
});

// 3. Capturista: Registrar simpatizante
app.post('/api/simpatizantes', async (req, res) => {
  const { nombre, telefono, seccion, localidad, referencia } = req.body;
  try {
    await pool.query(
      'INSERT INTO simpatizantes (nombre, telefono, seccion, localidad, referencia) VALUES ($1, $2, $3, $4, $5)',
      [nombre, telefono, seccion, localidad, referencia]
    );
    res.status(201).json({ mensaje: 'Simpatizante registrado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar' });
  }
});

// 4. Pase de Lista: Obtener simpatizantes por sección
app.get('/api/simpatizantes/:seccion', async (req, res) => {
  try {
    const { seccion } = req.params;
    const resultado = await pool.query('SELECT * FROM simpatizantes WHERE seccion = $1 ORDER BY nombre ASC', [seccion]);
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener lista' });
  }
});

// 5. Pase de Lista: Marcar asistencia
app.patch('/api/simpatizantes/:id/asistencia', async (req, res) => {
  try {
    const { id } = req.params;
    const { asistio } = req.body;
    await pool.query('UPDATE simpatizantes SET asistio = $1 WHERE id = $2', [asistio, id]);
    res.json({ mensaje: 'Asistencia actualizada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

// 6. Administrador: Ver avances por sección
app.get('/api/avances', async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT seccion, 
             COUNT(*) as total_registrados, 
             SUM(CASE WHEN asistio = TRUE THEN 1 ELSE 0 END) as total_asistieron
      FROM simpatizantes 
      GROUP BY seccion 
      ORDER BY seccion ASC
    `);
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener avances' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});