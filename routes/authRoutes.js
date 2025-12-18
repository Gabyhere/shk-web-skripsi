const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  const { role } = req.body;

  try {
    // ===== Register class_account (kelas 1-3) =====
    if (role === 'class_account') {
      const { kelas, username, password, wali_kelas, tahun_ajaran_id } = req.body;

      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await pool.query(
        'INSERT INTO siswa_kelas_rendah (kelas, username, password, wali_kelas, tahun_ajaran_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [kelas, username, hashedPassword, wali_kelas || null, tahun_ajaran_id]
      );

      return res.status(201).json({
        message: 'Akun kelas berhasil dibuat',
        user: result.rows[0],
      });
    }

    // ===== Register siswa (kelas 4-6) =====
    if (role === 'siswa') {
      const { nis, nama, email, password, kelas, jenis_kelamin, tahun_ajaran_id } = req.body;

      if (!nis || !kelas) {
        return res.status(400).json({ error: 'NIS dan kelas wajib diisi untuk siswa' });
      }
      const kelasResult = await pool.query('SELECT id FROM kelas WHERE nama = $1', [kelas]);

      if (kelasResult.rows.length === 0) {
        return res.status(400).json({ error: 'Kelas tidak ditemukan' });
      }

      const kelasID = kelasResult.rows[0].id;

      const existingSiswa = await pool.query('SELECT id FROM siswa_kelas_tinggi WHERE nis = $1', [
        nis,
      ]);

      if (existingSiswa.rows.length > 0) {
        return res.status(400).json({ error: 'NIS sudah terdaftar' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await pool.query(
        `INSERT INTO siswa_kelas_tinggi (nis, nama, email, password, kelasid, jenis_kelamin, role, account_type, tahun_ajaran_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
         RETURNING id, nis, nama, email, role`,
        [
          nis,
          nama,
          email,
          hashedPassword,
          kelasID,
          jenis_kelamin,
          'siswa',
          'individual',
          tahun_ajaran_id,
        ]
      );

      return res.status(201).json({
        message: 'Akun siswa berhasil dibuat',
        user: result.rows[0],
      });
    }

    // ===== Register guru =====
    if (role === 'guru') {
      const { nama, email, password, spesialisasi, tahun_ajaran_id } = req.body;

      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await pool.query(
        'INSERT INTO guru (nama, email, password, spesialisasi) VALUES ($1, $2, $3, $4) RETURNING *',
        [nama, email, hashedPassword, spesialisasi || null]
      );

      return res.status(201).json({
        message: 'Register berhasil',
        user: result.rows[0],
      });
    }

    return res.status(400).json({ error: 'Role tidak valid' });
  } catch (err) {
    console.error('Register error:', err);

    // Handle duplicate email/NIS/username
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Email, NIS, atau Username sudah terdaftar' });
    }

    res.status(500).json({ error: 'Gagal register', detail: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { role, email, password, username } = req.body; // Tambah username

  try {
    let user;

    if (role === 'siswa') {
      const result = await pool.query('SELECT * FROM siswa_kelas_tinggi WHERE email = $1', [email]);
      user = result.rows[0];
    } else if (role === 'guru') {
      const result = await pool.query('SELECT * FROM guru WHERE email = $1', [email]);
      user = result.rows[0];
    } else if (role === 'admin') {
      const result = await pool.query('SELECT * FROM admin WHERE email = $1', [email]);
      user = result.rows[0];
    } else if (role === 'class_account') {
      const result = await pool.query('SELECT * FROM siswa_kelas_rendah WHERE username = $1', [
        username,
      ]);
      user = result.rows[0];
    } else {
      return res.status(400).json({ error: 'Role tidak valid' });
    }

    if (!user) return res.status(400).json({ error: 'Username/Email tidak ditemukan' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Password salah' });

    delete user.password;

    res.json({ message: 'Login berhasil', user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Gagal login', detail: err.message });
  }
});

module.exports = router;
