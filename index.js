const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');

// 60 Secciones Electorales Oficiales de Cunduacán, Tabasco
// (0609 a 0653, 0655 a 0667, más 1202 y 1203 por división de la 0654)
const SECCIONES_CUNDUACAN = [
  ...Array.from({ length: 59 }, (_, i) => String(609 + i).padStart(4, '0')).filter(s => s !== '0654'),
  '1202',
  '1203'
];

// Normaliza y valida una o varias secciones (acepta arreglo o cadena separada por comas)
function normalizarSeccionesInput(input) {
  if (!input) return [];
  const lista = Array.isArray(input) ? input : String(input).split(',');
  const limpias = lista
    .map(s => String(s).trim().padStart(4, '0'))
    .filter(s => s && s !== '0000');
  return [...new Set(limpias)].sort();
}

// ==========================================
// POOL DE CONEXIONES OPTIMIZADO (400 USUARIOS)
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: false
});

pool.on('error', (err) => {
  console.error('⚠️ Error inesperado en cliente inactivo de PostgreSQL:', err.message);
});

app.use(express.json({ limit: '10mb' }));

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  etag: true
}));

// ==========================================
// INICIALIZAR TABLAS E ÍNDICES EN POSTGRESQL
// ==========================================
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

    // 4. Tabla Estructura Principal (20 Zonas, 37 Rutas, 60 Secciones)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS estructura_principal (
        id SERIAL PRIMARY KEY,
        rol VARCHAR(50) NOT NULL,
        zona INTEGER,
        ruta INTEGER,
        seccion TEXT,
        nombres VARCHAR(100) NOT NULL,
        apellidos VARCHAR(100) NOT NULL,
        telefono VARCHAR(20),
        localidad VARCHAR(100),
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ampliar columna seccion a TEXT si la tabla ya existía con VARCHAR(20)
    try {
      await pool.query("ALTER TABLE estructura_principal ALTER COLUMN seccion TYPE TEXT;");
    } catch (e) { /* Ya es TEXT */ }

    // 5. ÍNDICES DE ALTO RENDIMIENTO
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_simpatizantes_seccion_nombre 
      ON simpatizantes (seccion, nombre);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_simpatizantes_asistio 
      ON simpatizantes (asistio);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_promotores_seccion_nombre 
      ON promotores (seccion, nombre);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_usuarios_login 
      ON usuarios (usuario, password);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_estructura_rol_zona_ruta 
      ON estructura_principal (rol, zona, ruta);
    `);

    // Crear admin por defecto si no existe
    const adminCheck = await pool.query("SELECT id FROM usuarios WHERE rol = 'admin' LIMIT 1");
    if (adminCheck.rows.length === 0) {
      await pool.query(
        "INSERT INTO usuarios (usuario, password, rol, requiere_cambio) VALUES ($1, $2, $3, $4)",
        ['admin', 'admin123', 'admin', false]
      );
    }
    console.log('✅ Base de datos, pool de conexiones e índices optimizados listos.');
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
      'SELECT id, nombre, telefono, seccion, localidad, referencia, asistio FROM simpatizantes WHERE seccion = $1 ORDER BY nombre ASC',
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
    const todos = await pool.query(
      'SELECT id, nombre, telefono, seccion, localidad, referencia, asistio FROM simpatizantes ORDER BY seccion ASC, nombre ASC'
    );
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
    const resultado = await pool.query(
      'SELECT id, nombre, telefono, seccion, localidad FROM promotores ORDER BY seccion ASC, nombre ASC'
    );
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

// ==========================================
// 13. RUTAS DE ESTRUCTURA PRINCIPAL (20 ZONAS, 37 RUTAS, 60 SECCIONES)
// ==========================================
app.get('/api/estructura', async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT id, rol, zona, ruta, seccion, nombres, apellidos, telefono, localidad
      FROM estructura_principal
      ORDER BY 
        zona ASC NULLS LAST,
        CASE rol
          WHEN 'Coordinador de Zona' THEN 1
          WHEN 'Coordinador de Ruta' THEN 2
          WHEN 'Jefe de Sección' THEN 3
          ELSE 4
        END ASC,
        ruta ASC NULLS LAST,
        seccion ASC NULLS LAST
    `);
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error al consultar estructura principal:', error);
    res.status(500).json({ error: 'Error al consultar la estructura principal.' });
  }
});

app.post('/api/estructura', async (req, res) => {
  const { rol, zona, ruta, secciones, seccion, nombres, apellidos, telefono, localidad } = req.body;

  if (!rol || !nombres || !apellidos) {
    return res.status(400).json({ error: 'Rol, nombre(s) y apellidos son obligatorios.' });
  }

  const zonaNum = zona ? parseInt(zona, 10) : null;
  const rutaNum = ruta ? parseInt(ruta, 10) : null;
  const seccionesArr = normalizarSeccionesInput(secciones || seccion);

  if (seccionesArr.length === 0) {
    return res.status(400).json({ error: 'Debes asignar al menos una sección electoral.' });
  }
  const invalidas = seccionesArr.filter(s => !SECCIONES_CUNDUACAN.includes(s));
  if (invalidas.length > 0) {
    return res.status(400).json({ error: `Sección(es) no válida(s) para Cunduacán: ${invalidas.join(', ')}` });
  }

  const seccionGuardada = seccionesArr.join(', ');

  try {
    if (rol === 'Coordinador de Zona') {
      if (!zonaNum || zonaNum < 1 || zonaNum > 20) {
        return res.status(400).json({ error: 'La Zona debe estar entre 1 y 20.' });
      }
      const existeZona = await pool.query(
        "SELECT id FROM estructura_principal WHERE rol = 'Coordinador de Zona' AND zona = $1",
        [zonaNum]
      );
      if (existeZona.rows.length > 0) {
        return res.status(400).json({ error: `La Zona ${zonaNum} ya tiene un Coordinador de Zona asignado.` });
      }
      const totalZonas = await pool.query(
        "SELECT COUNT(*) FROM estructura_principal WHERE rol = 'Coordinador de Zona'"
      );
      if (parseInt(totalZonas.rows[0].count, 10) >= 20) {
        return res.status(400).json({ error: 'Ya se alcanzó el límite máximo de 20 Coordinadores de Zona.' });
      }
    } else if (rol === 'Coordinador de Ruta') {
      if (!zonaNum || zonaNum < 1 || zonaNum > 20) {
        return res.status(400).json({ error: 'Debes seleccionar una Zona válida (1 a 20).' });
      }
      if (!rutaNum || rutaNum < 1 || rutaNum > 37) {
        return res.status(400).json({ error: 'La Ruta debe estar entre 1 y 37.' });
      }
      const existeRuta = await pool.query(
        "SELECT id FROM estructura_principal WHERE rol = 'Coordinador de Ruta' AND ruta = $1",
        [rutaNum]
      );
      if (existeRuta.rows.length > 0) {
        return res.status(400).json({ error: `La Ruta ${rutaNum} ya tiene un Coordinador de Ruta asignado.` });
      }
      const totalRutas = await pool.query(
        "SELECT COUNT(*) FROM estructura_principal WHERE rol = 'Coordinador de Ruta'"
      );
      if (parseInt(totalRutas.rows[0].count, 10) >= 37) {
        return res.status(400).json({ error: 'Ya se alcanzó el límite máximo de 37 Coordinadores de Ruta.' });
      }
    } else if (rol === 'Jefe de Sección') {
      if (!zonaNum || zonaNum < 1 || zonaNum > 20) {
        return res.status(400).json({ error: 'Debes seleccionar una Zona válida (1 a 20).' });
      }
      if (!rutaNum || rutaNum < 1 || rutaNum > 37) {
        return res.status(400).json({ error: 'Debes seleccionar una Ruta válida (1 a 37).' });
      }
      if (seccionesArr.length !== 1) {
        return res.status(400).json({ error: 'El Jefe de Sección solo puede tener asignada 1 sección electoral.' });
      }
      const seccionUnica = seccionesArr[0];
      const existeSeccion = await pool.query(
        "SELECT id FROM estructura_principal WHERE rol = 'Jefe de Sección' AND seccion = $1",
        [seccionUnica]
      );
      if (existeSeccion.rows.length > 0) {
        return res.status(400).json({ error: `La Sección ${seccionUnica} ya tiene un Jefe de Sección asignado.` });
      }
      const totalSecciones = await pool.query(
        "SELECT COUNT(*) FROM estructura_principal WHERE rol = 'Jefe de Sección'"
      );
      if (parseInt(totalSecciones.rows[0].count, 10) >= 60) {
        return res.status(400).json({ error: 'Ya se alcanzó el límite máximo de 60 Jefes de Sección.' });
      }
    } else {
      return res.status(400).json({ error: 'Rol no válido en la estructura principal.' });
    }

    await pool.query(
      `INSERT INTO estructura_principal (rol, zona, ruta, seccion, nombres, apellidos, telefono, localidad)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        rol,
        zonaNum,
        rol === 'Coordinador de Zona' ? null : rutaNum,
        seccionGuardada,
        String(nombres).trim().toUpperCase(),
        String(apellidos).trim().toUpperCase(),
        telefono ? String(telefono).trim() : '',
        localidad ? String(localidad).trim().toUpperCase() : ''
      ]
    );

    res.status(201).json({ mensaje: 'Integrante registrado en la Estructura Principal.' });
  } catch (error) {
    console.error('Error al guardar en estructura principal:', error);
    res.status(500).json({ error: 'Error al guardar en la estructura principal.' });
  }
});

app.patch('/api/estructura/:id/editar', async (req, res) => {
  const { id } = req.params;
  const { rol, zona, ruta, secciones, seccion, nombres, apellidos, telefono, localidad } = req.body;

  const zonaNum = zona ? parseInt(zona, 10) : null;
  const rutaNum = ruta ? parseInt(ruta, 10) : null;
  const seccionesArr = normalizarSeccionesInput(secciones || seccion);

  if (seccionesArr.length === 0) {
    return res.status(400).json({ error: 'Debes asignar al menos una sección electoral.' });
  }
  const invalidas = seccionesArr.filter(s => !SECCIONES_CUNDUACAN.includes(s));
  if (invalidas.length > 0) {
    return res.status(400).json({ error: `Sección(es) no válida(s) para Cunduacán: ${invalidas.join(', ')}` });
  }

  const seccionGuardada = seccionesArr.join(', ');

  try {
    if (rol === 'Coordinador de Zona') {
      const dup = await pool.query(
        "SELECT id FROM estructura_principal WHERE rol = 'Coordinador de Zona' AND zona = $1 AND id != $2",
        [zonaNum, id]
      );
      if (dup.rows.length > 0) {
        return res.status(400).json({ error: `La Zona ${zonaNum} ya está asignada a otro coordinador.` });
      }
    } else if (rol === 'Coordinador de Ruta') {
      const dup = await pool.query(
        "SELECT id FROM estructura_principal WHERE rol = 'Coordinador de Ruta' AND ruta = $1 AND id != $2",
        [rutaNum, id]
      );
      if (dup.rows.length > 0) {
        return res.status(400).json({ error: `La Ruta ${rutaNum} ya está asignada a otro coordinador.` });
      }
    } else if (rol === 'Jefe de Sección') {
      if (seccionesArr.length !== 1) {
        return res.status(400).json({ error: 'El Jefe de Sección solo puede tener asignada 1 sección electoral.' });
      }
      const dup = await pool.query(
        "SELECT id FROM estructura_principal WHERE rol = 'Jefe de Sección' AND seccion = $1 AND id != $2",
        [seccionesArr[0], id]
      );
      if (dup.rows.length > 0) {
        return res.status(400).json({ error: `La Sección ${seccionesArr[0]} ya está asignada a otro jefe de sección.` });
      }
    }

    await pool.query(
      `UPDATE estructura_principal
       SET rol = $1, zona = $2, ruta = $3, seccion = $4, nombres = $5, apellidos = $6, telefono = $7, localidad = $8
       WHERE id = $9`,
      [
        rol,
        zonaNum,
        rol === 'Coordinador de Zona' ? null : rutaNum,
        seccionGuardada,
        String(nombres).trim().toUpperCase(),
        String(apellidos).trim().toUpperCase(),
        telefono ? String(telefono).trim() : '',
        localidad ? String(localidad).trim().toUpperCase() : '',
        id
      ]
    );
    res.json({ mensaje: 'Registro actualizado correctamente.' });
  } catch (error) {
    console.error('Error al editar estructura:', error);
    res.status(500).json({ error: 'Error al actualizar el registro.' });
  }
});

app.delete('/api/estructura/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM estructura_principal WHERE id = $1', [req.params.id]);
    res.json({ mensaje: 'Registro eliminado correctamente.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar el registro.' });
  }
});

// ==========================================
// ARRANQUE DEL SERVIDOR Y TIMEOUTS PARA RENDER
// ==========================================
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en el puerto ${PORT}`);
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;