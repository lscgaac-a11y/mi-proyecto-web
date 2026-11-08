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
    
    // Agregar columna de cambio de password a tablas existentes (ignora el error si ya existe)
    try {
      await pool.query("ALTER TABLE usuarios ADD COLUMN requiere_cambio BOOLEAN DEFAULT TRUE;");
    } catch (e) { /* Columna ya existe */ }

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

    // Crear admin por defecto si no existe (al admin no le pedimos cambiarla por ahora)
    const adminCheck = await pool.query("SELECT * FROM usuarios WHERE rol = 'admin'");
    if (adminCheck.rows.length === 0) {
      await pool.query(
        "INSERT INTO usuarios (usuario, password, rol, requiere_cambio) VALUES ($1, $2, $3, $4)",
        ['admin', 'admin123', 'admin', false]
      );
    }
    console.log('✅ Base de datos lista.');
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
    const user = await pool.query('SELECT id, usuario, rol, seccion_asignada, requiere_cambio FROM usuarios WHERE usuario = $1 AND password = $2', [usuario, password]);
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
// 7. Administrador: Ver todos los simpatizantes (Lista Global)
app.get('/api/simpatizantes-todos', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM simpatizantes ORDER BY seccion ASC, nombre ASC');
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener lista global' });
  }
});
// 8. Actualizar contraseña (Primera entrada)
app.patch('/api/usuarios/:id/password', async (req, res) => {
  const { id } = req.params;
  const { nuevoPassword } = req.body;
  try {
    await pool.query('UPDATE usuarios SET password = $1, requiere_cambio = FALSE WHERE id = $2', [nuevoPassword, id]);
    res.json({ mensaje: 'Contraseña actualizada con éxito' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar contraseña' });
  }
});
// 9. Gestionar Staff (Ver y Eliminar)
app.get('/api/usuarios', async (req, res) => {
  try {
    const resultado = await pool.query("SELECT id, usuario, rol, seccion_asignada FROM usuarios WHERE rol != 'admin' ORDER BY id ASC");
    res.json(resultado.rows);
  } catch (error) { res.status(500).json({ error: 'Error' }); }
});

app.delete('/api/usuarios/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
    res.json({ mensaje: 'Eliminado' });
  } catch (error) { res.status(500).json({ error: 'Error' }); }
});

// 10. Gestionar Simpatizantes (Actualizar y Eliminar)
app.patch('/api/simpatizantes/:id/editar', async (req, res) => {
  const { id } = req.params;
  const { nombre, telefono, seccion, localidad, referencia } = req.body;
  try {
    await pool.query(
      'UPDATE simpatizantes SET nombre=$1, telefono=$2, seccion=$3, localidad=$4, referencia=$5 WHERE id=$6',
      [nombre, telefono, seccion, localidad, referencia, id]
    );
    res.json({ mensaje: 'Actualizado' });
  } catch (error) { res.status(500).json({ error: 'Error' }); }
});

app.delete('/api/simpatizantes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM simpatizantes WHERE id = $1', [req.params.id]);
    res.json({ mensaje: 'Eliminado' });
  } catch (error) { res.status(500).json({ error: 'Error' }); }
});
app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});