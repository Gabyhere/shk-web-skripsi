const express = require('express');
const pool = require('../db');
const router = express.Router();

// Get all students
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        s.id,
        s.nama,
        s.nis,
        s.email,
        s.jenis_kelamin,
        s.kelasid,
        s.role,
        s.account_type,
        k.nama as kelas
      FROM siswa_kelas_tinggi s
      LEFT JOIN kelas k ON s.kelasid = k.id
      ORDER BY s.nama
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Get student by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `
      SELECT 
        s.id,
        s.nama,
        s.nis,
        s.email,
        s.jenis_kelamin,
        s.kelasid,
        s.role,
        s.account_type,
        k.nama as kelas
      FROM siswa_kelas_tinggi s
      LEFT JOIN kelas k ON s.kelasid = k.id
      WHERE s.id = $1
    `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get student error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Add new student (tanpa akun login)
router.post('/', async (req, res) => {
  try {
    const { nis, nama, kelas, jenis_kelamin, email, tahun_ajaran_id } = req.body;

    console.log('📥 Received data:', { nis, nama, kelas, jenis_kelamin, email, tahun_ajaran_id });

    // Validasi input
    if (!nis || !nama || !kelas || !jenis_kelamin) {
      return res.status(400).json({ error: 'NIS, nama, kelas, dan jenis kelamin wajib diisi' });
    }

    // Get kelas ID
    const kelasResult = await pool.query('SELECT id FROM kelas WHERE nama = $1', [kelas]);

    console.log('🔍 Kelas query result:', kelasResult.rows);

    if (kelasResult.rows.length === 0) {
      return res.status(400).json({ error: `Kelas ${kelas} tidak ditemukan di database` });
    }

    const kelasID = kelasResult.rows[0].id;

    // Check if NIS already exists
    const existingSiswa = await pool.query('SELECT id FROM siswa_kelas_tinggi WHERE nis = $1', [
      nis,
    ]);

    if (existingSiswa.rows.length > 0) {
      return res.status(400).json({ error: 'NIS sudah terdaftar' });
    }

    let emailFinal = null;
    if (email && email.trim() !== '') {
      emailFinal = email;
    }

    console.log('📧 Email final:', emailFinal);

    // Insert siswa - email dan password bisa NULL
    const result = await pool.query(
      `INSERT INTO siswa_kelas_tinggi (nis, nama, email, kelasid, jenis_kelamin, tahun_ajaran_id) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, nis, nama, email, jenis_kelamin`,
      [nis, nama, emailFinal, kelasID, jenis_kelamin, tahun_ajaran_id]
    );

    console.log('Insert result:', result.rows[0]);

    res.status(201).json({
      message: 'Data siswa berhasil ditambahkan',
      siswa: result.rows[0],
    });
  } catch (error) {
    console.error('Add student error:', error);
    console.error('Error code:', error.code);

    // Handle specific errors
    if (error.code === '23505') {
      return res.status(400).json({ error: 'NIS atau email sudah terdaftar' });
    }

    if (error.code === '23502') {
      return res.status(400).json({
        error: 'Field wajib kosong',
        detail: `Kolom ${error.column} tidak boleh kosong. Silakan jalankan: ALTER TABLE siswa ALTER COLUMN ${error.column} DROP NOT NULL;`,
      });
    }

    res.status(500).json({
      error: 'Terjadi kesalahan server',
      detail: error.message,
      code: error.code,
    });
  }
});

// Update student
router.put('/:id', async (req, res) => {
  try {
    const siswaId = parseInt(req.params.id);
    const { nama, email, kelas, jenis_kelamin } = req.body;

    console.log('Update data:', { siswaId, nama, email, kelas, jenis_kelamin }); // DEBUG

    // Get current student data first
    const currentData = await pool.query('SELECT * FROM siswa_kelas_tinggi WHERE id = $1', [
      siswaId,
    ]);

    if (currentData.rows.length === 0) {
      return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    }

    const current = currentData.rows[0];

    // Use provided values or keep current values
    const finalNama = nama || current.nama;
    const finalJenisKelamin = jenis_kelamin || current.jenis_kelamin;
    const finalKelas = kelas || current.kelas;

    // Handle email - bisa NULL atau empty string
    let emailFinal = null;
    if (email !== undefined) {
      emailFinal = email && email.trim() !== '' ? email : null;
    } else {
      emailFinal = current.email;
    }

    // Get kelas ID if kelas name is provided
    let kelasID = current.kelasid;
    if (kelas) {
      const kelasResult = await pool.query('SELECT id FROM kelas WHERE nama = $1', [finalKelas]);
      if (kelasResult.rows.length === 0) {
        return res.status(400).json({ error: 'Kelas tidak ditemukan' });
      }
      kelasID = kelasResult.rows[0].id;
    }

    const result = await pool.query(
      `UPDATE siswa_kelas_tinggi
       SET nama = $1, email = $2, kelasid = $3, jenis_kelamin = $4 
       WHERE id = $5 
       RETURNING id, nis, nama, email, jenis_kelamin`,
      [finalNama, emailFinal, kelasID, finalJenisKelamin, siswaId]
    );

    res.json({
      message: 'Data siswa berhasil diupdate',
      siswa: result.rows[0],
    });
  } catch (error) {
    console.error('Update student error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server', detail: error.message });
  }
});

// Delete student
router.delete('/:id', async (req, res) => {
  try {
    const siswaId = parseInt(req.params.id);

    const result = await pool.query(
      'DELETE FROM siswa_kelas_tinggi WHERE id = $1 RETURNING id, nis, nama',
      [siswaId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    }

    res.json({
      message: 'Siswa berhasil dihapus',
      siswa: result.rows[0],
    });
  } catch (error) {
    console.error('Delete student error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Reset password siswa
router.put('/:id/reset-password', async (req, res) => {
  try {
    const siswaId = parseInt(req.params.id);
    const { password } = req.body;

    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'UPDATE siswa_kelas_tinggi SET password = $1 WHERE id = $2 RETURNING id, nama',
      [hashedPassword, siswaId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    }

    res.json({ message: 'Password berhasil direset' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Delete account only (keep student data)
router.delete('/:id/delete-account', async (req, res) => {
  try {
    const siswaId = parseInt(req.params.id);

    const result = await pool.query(
      'UPDATE siswa_kelas_tinggi SET email = NULL, password = NULL WHERE id = $1 RETURNING id, nama',
      [siswaId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    }

    res.json({ message: 'Akun siswa berhasil dihapus' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

module.exports = router;
