const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de conexión a PostgreSQL
// Reemplaza la cadena con tu URL de conexión de Render o Neon
const connectionString = process.env.DATABASE_URL || 'postgresql://proceso2027_user:xFv2qxkP4NRwuv7Fh4hxL3W0aJboVQVI@dpg-dbno1atg1s2s73d7k9tg-a.oregon-postgres.render.com/proceso2027?sslmode=verify-full';
const pool = new Pool({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inicializar tabla en la base de datos si no existe
async function iniciarBaseDeDatos() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS registros (
        id SERIAL PRIMARY KEY,
        item VARCHAR(255) NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Tabla "registros" verificada y lista en PostgreSQL.');
  } catch (error) {
    console.error('Error al conectar con la base de datos:', error.message);
  }
}

iniciarBaseDeDatos();

// Ruta para obtener todos los registros desde PostgreSQL
app.get('/api/registros', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM registros ORDER BY id DESC');
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar la base de datos' });
  }
});

// Ruta para guardar un registro en PostgreSQL
app.post('/api/registros', async (req, res) => {
  const { item } = req.body;
  if (!item) {
    return res.status(400).json({ error: 'El campo item es obligatorio' });
  }

  try {
    const resultado = await pool.query(
      'INSERT INTO registros (item) VALUES ($1) RETURNING *',
      [item]
    );
    res.status(201).json({ mensaje: 'Guardado con éxito', registro: resultado.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Error al insertar en la base de datos' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});