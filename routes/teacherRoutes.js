const express = require('express');
const pool = require('../db');
const router = express.Router();

// Get all teachers
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nama, email, spesialisasi FROM guru ORDER BY nama');
    res.json(result.rows);
  } catch (error) {
    console.error('Get guru error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Get single teacher
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, nama, email, spesialisasi FROM guru WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Guru tidak ditemukan' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get guru error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Update teacher
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, email, spesialisasi, password } = req.body;

    let query = 'UPDATE guru SET nama = $1, email = $2, spesialisasi = $3';
    const params = [nama, email, spesialisasi || null];

    if (password) {
      const bcrypt = require('bcrypt');
      const hashedPassword = await bcrypt.hash(password, 10);
      query += ', password = $4 WHERE id = $5';
      params.push(hashedPassword, id);
    } else {
      query += ' WHERE id = $4';
      params.push(id);
    }

    query += ' RETURNING id, nama, email, spesialisasi';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Guru tidak ditemukan' });
    }

    res.json({ message: 'Guru berhasil diupdate', guru: result.rows[0] });
  } catch (error) {
    console.error('Update guru error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Delete teacher
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM guru WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Guru tidak ditemukan' });
    }

    res.json({ message: 'Guru berhasil dihapus', guru: result.rows[0] });
  } catch (error) {
    console.error('Delete guru error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

module.exports = router;
