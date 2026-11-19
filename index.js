const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de la conexión a PostgreSQL (Render proporciona DATABASE_URL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Aumentar límite a 10MB para soportar importación masiva desde Excel
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Inicializar Tablas
async function iniciarBaseDeDatos() {
  try {
    // 1. Tabla Usuarios
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        usuario VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(50) NOT NULL,
        rol VARCHAR(20) NOT NULL,
        seccion_asignada VARCHAR(50),
        requiere_cambio BOOLEAN DEFAULT TRUE
      );
    `);

    try {
      await pool.query("ALTER TABLE usuarios ADD COLUMN requiere_cambio BOOLEAN DEFAULT TRUE;");
    } catch (e) { /* Columna ya existe */ }

    // 2. Tabla Simpatizantes
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

    // 3. Tabla Promotores
    await pool.query(`
      CREATE TABLE IF NOT EXISTS promotores (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(150) NOT NULL,
        telefono VARCHAR(20),
        seccion VARCHAR(50) NOT NULL,
        localidad VARCHAR(100),
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Crear admin por defecto si no existe
    const adminCheck = await pool.query("SELECT * FROM usuarios WHERE rol = 'admin'");
    if (adminCheck.rows.length === 0) {
      await pool.query(
        "INSERT INTO usuarios (usuario, password, rol, requiere_cambio) VALUES ($1, $2, $3, $4)",
        ['admin', 'admin123', 'admin', false]
      );
    }
    console.log('✅ Base de datos e inicialización completadas.');
  } catch (error) {
    console.error('❌ Error al inicializar base de datos:', error.message);
  }
}
iniciarBaseDeDatos();

// ==========================================
// RUTAS DE LA API
// ==========================================

// 1. Login
app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    const user = await pool.query(
      'SELECT id, usuario, rol, seccion_asignada, requiere_cambio FROM usuarios WHERE usuario = $1 AND password = $2',
      [usuario, password]
    );
    if (user.rows.length === 0) return res.status(401).json({ error: 'Credenciales incorrectas' });
    res.json(user.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// 2. Cambiar contraseña obligatoria
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

// 3. Crear Usuario (Staff / Coordinador)
app.post('/api/usuarios', async (req, res) => {
  const { usuario, password, rol, seccion_asignada } = req.body;
  try {
    await pool.query(
      'INSERT INTO usuarios (usuario, password, rol, seccion_asignada, requiere_cambio) VALUES ($1, $2, $3, $4, TRUE)',
      [usuario, password, rol, seccion_asignada || null]
    );
    res.status(201).json({ mensaje: 'Usuario creado exitosamente' });
  } catch (error) {
    res.status(400).json({ error: 'El usuario ya existe o hubo un problema.' });
  }
});

// 4. Registrar Simpatizante
app.post('/api/simpatizantes', async (req, res) => {
  const { nombre, telefono, seccion, localidad, referencia } = req.body;
  try {
    await pool.query(
      'INSERT INTO simpatizantes (nombre, telefono, seccion, localidad, referencia) VALUES ($1, $2, $3, $4, $5)',
      [nombre, telefono, seccion, localidad, referencia]
    );
    res.status(201).json({ mensaje: 'Simpatizante registrado exitosamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar simpatizante' });
  }
});

// 5. Obtener Simpatizantes por Sección
app.get('/api/simpatizantes/:seccion', async (req, res) => {
  try {
    const simpatizantes = await pool.query(
      'SELECT * FROM simpatizantes WHERE seccion = $1 ORDER BY nombre ASC',
      [req.params.seccion]
    );
    res.json(simpatizantes.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar datos' });
  }
});

// 6. Obtener Todos los Simpatizantes
app.get('/api/simpatizantes-todos', async (req, res) => {
  try {
    const todos = await pool.query('SELECT * FROM simpatizantes ORDER BY seccion ASC, nombre ASC');
    res.json(todos.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar todos los simpatizantes' });
  }
});

// 7. Marcar Asistencia (Check-in)
app.patch('/api/simpatizantes/:id/asistencia', async (req, res) => {
  const { id } = req.params;
  const { asistio } = req.body;
  try {
    await pool.query('UPDATE simpatizantes SET asistio = $1 WHERE id = $2', [asistio, id]);
    res.json({ mensaje: 'Asistencia actualizada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar asistencia' });
  }
});

// 8. Resumen de Avances por Sección
app.get('/api/avances', async (req, res) => {
  try {
    const avances = await pool.query(`
      SELECT 
        seccion, 
        COUNT(*) as total_registrados,
        COUNT(CASE WHEN asistio THEN 1 END) as total_asistieron
      FROM simpatizantes
      GROUP BY seccion
      ORDER BY seccion ASC
    `);
    res.json(avances.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al generar datos de avances' });
  }
});

// 9. Gestionar Staff (Ver y Eliminar)
app.get('/api/usuarios', async (req, res) => {
  try {
    const resultado = await pool.query("SELECT id, usuario, password, rol, seccion_asignada FROM usuarios WHERE rol != 'admin' ORDER BY id ASC");
    res.json(resultado.rows);
  } catch (error) { res.status(500).json({ error: 'Error' }); }
});

app.delete('/api/usuarios/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
    res.json({ mensaje: 'Eliminado' });
  } catch (error) { res.status(500).json({ error: 'Error' }); }
});

// 10. Editar y Eliminar Simpatizantes
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

// ==========================================
// 11. RUTAS PARA LA ENTIDAD: PROMOTORES
// ==========================================
app.get('/api/promotores', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM promotores ORDER BY seccion ASC, nombre ASC');
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar promotores' });
  }
});

app.post('/api/promotores', async (req, res) => {
  const { nombre, telefono, seccion, localidad } = req.body;
  try {
    await pool.query(
      'INSERT INTO promotores (nombre, telefono, seccion, localidad) VALUES ($1, $2, $3, $4)',
      [nombre, telefono, seccion, localidad]
    );
    res.status(201).json({ mensaje: 'Promotor guardado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar promotor' });
  }
});

app.patch('/api/promotores/:id/editar', async (req, res) => {
  const { id } = req.params;
  const { nombre, telefono, seccion, localidad } = req.body;
  try {
    await pool.query(
      'UPDATE promotores SET nombre=$1, telefono=$2, seccion=$3, localidad=$4 WHERE id=$5',
      [nombre, telefono, seccion, localidad, id]
    );
    res.json({ mensaje: 'Promotor actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al editar promotor' });
  }
});

app.delete('/api/promotores/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM promotores WHERE id = $1', [req.params.id]);
    res.json({ mensaje: 'Promotor eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar promotor' });
  }
});

// ==========================================
// 12. IMPORTACIÓN MASIVA DESDE EXCEL
// ==========================================
app.post('/api/simpatizantes/importar', async (req, res) => {
  const { registros } = req.body;
  if (!Array.isArray(registros) || registros.length === 0) {
    return res.status(400).json({ error: 'No se recibieron registros válidos.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let insertados = 0;

    for (const r of registros) {
      if (r.nombre && r.seccion) {
        await client.query(
          'INSERT INTO simpatizantes (nombre, telefono, seccion, localidad, referencia, asistio) VALUES ($1, $2, $3, $4, $5, $6)',
          [
            String(r.nombre).trim().toUpperCase(),
            r.telefono ? String(r.telefono).trim() : '',
            String(r.seccion).trim(),
            r.localidad ? String(r.localidad).trim().toUpperCase() : '',
            r.referencia ? String(r.referencia).trim().toUpperCase() : '',
            Boolean(r.asistio)
          ]
        );
        insertados++;
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ mensaje: `Se importaron ${insertados} simpatizantes correctamente.` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al importar simpatizantes:', error);
    res.status(500).json({ error: 'Error al procesar la importación en la base de datos.' });
  } finally {
    client.release();
  }
});

app.post('/api/promotores/importar', async (req, res) => {
  const { registros } = req.body;
  if (!Array.isArray(registros) || registros.length === 0) {
    return res.status(400).json({ error: 'No se recibieron registros válidos.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let insertados = 0;

    for (const r of registros) {
      if (r.nombre && r.seccion) {
        await client.query(
          'INSERT INTO promotores (nombre, telefono, seccion, localidad) VALUES ($1, $2, $3, $4)',
          [
            String(r.nombre).trim().toUpperCase(),
            r.telefono ? String(r.telefono).trim() : '',
            String(r.seccion).trim(),
            r.localidad ? String(r.localidad).trim().toUpperCase() : ''
          ]
        );
        insertados++;
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ mensaje: `Se importaron ${insertados} promotores correctamente.` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al importar promotores:', error);
    res.status(500).json({ error: 'Error al procesar la importación en la base de datos.' });
  } finally {
    client.release();
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en el puerto ${PORT}`);
});