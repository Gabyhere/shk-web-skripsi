const express = require('express');
const pool = require('../db');
const router = express.Router();

// Get all tahun ajaran
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tahun_ajaran ORDER BY tahun_mulai DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Get tahun ajaran error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Get active tahun ajaran
router.get('/active', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tahun_ajaran WHERE is_active = TRUE LIMIT 1');
    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Get active tahun ajaran error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Create tahun ajaran
router.post('/', async (req, res) => {
  try {
    const { tahun_mulai, tahun_akhir } = req.body;
    const result = await pool.query(
      'INSERT INTO tahun_ajaran (tahun_mulai, tahun_akhir, is_active) VALUES ($1, $2, FALSE) RETURNING *',
      [tahun_mulai, tahun_akhir]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Create tahun ajaran error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Set active tahun ajaran
router.put('/:id/activate', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE tahun_ajaran SET is_active = FALSE');
    const result = await pool.query(
      'UPDATE tahun_ajaran SET is_active = TRUE WHERE id = $1 RETURNING *',
      [id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Activate tahun ajaran error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

module.exports = router;
