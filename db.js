const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres', // ganti sesuai user PostgreSQL kamu
  host: 'localhost',
  database: 'shk_portal', // pastikan sama persis dengan nama DB di PostgreSQL
  password: 'Gaby2803', // ganti dengan password PostgreSQL kamu
  port: 5432,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to database:', err.stack);
  } else {
    console.log('Database connected successfully');
    release();
  }
});

module.exports = pool;
