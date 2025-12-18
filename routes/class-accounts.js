const express = require('express');
const pool = require('../db');
const bcrypt = require('bcrypt');
const router = express.Router();

// Get all class accounts
router.get('/', async (req, res) => {
  try {
    const { tahun_ajaran_id } = req.query;

    let query = 'SELECT * FROM siswa_kelas_rendah';
    const params = [];

    if (tahun_ajaran_id) {
      query += ' WHERE id = $1';
      params.push(tahun_ajaran_id);
    }

    query += ' ORDER BY kelas';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get class accounts error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Get class account by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM siswa_kelas_rendah WHERE id = $1', [
      req.params.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Akun kelas tidak ditemukan' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get class account error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Get class account password (untuk admin saja - gunakan dengan hati-hati)
router.get('/:id/password', async (req, res) => {
  try {
    const result = await pool.query('SELECT password FROM siswa_kelas_rendah WHERE id = $1', [
      req.params.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Akun kelas tidak ditemukan' });
    }

    // CATATAN: Ini tidak aman karena mengirim hash password
    // Lebih baik tidak implementasi ini di production
    res.json({
      message: 'Password dalam bentuk hash (tidak bisa ditampilkan)',
      hasPassword: !!result.rows[0].password,
    });
  } catch (error) {
    console.error('Get password error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Update class account
router.put('/:id', async (req, res) => {
  try {
    const { wali_kelas, password } = req.body;

    let query = 'UPDATE siswa_kelas_rendah SET wali_kelas = $1';
    const params = [wali_kelas];

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query += ', password = $2 WHERE id = $3';
      params.push(hashedPassword, req.params.id);
    } else {
      query += ' WHERE id = $2';
      params.push(req.params.id);
    }

    query += ' RETURNING *';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Akun kelas tidak ditemukan' });
    }

    res.json({ message: 'Akun kelas berhasil diupdate' });
  } catch (error) {
    console.error('Update class account error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Delete class account
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM siswa_kelas_rendah WHERE id = $1 RETURNING *', [
      req.params.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Akun kelas tidak ditemukan' });
    }

    res.json({ message: 'Akun kelas berhasil dihapus' });
  } catch (error) {
    console.error('Delete class account error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

module.exports = router;
