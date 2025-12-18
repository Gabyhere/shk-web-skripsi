const express = require('express');
const pool = require('../db');
const router = express.Router();

// Get analytics data for dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const [
      siswaCount,
      guruCount,
      beritaCount,
      pengumumanCount,
      kelasDistribution,
      genderDistribution,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as total FROM siswa_kelas_tinggi'),
      pool.query('SELECT COUNT(*) as total FROM guru'),
      pool.query('SELECT COUNT(*) as total FROM berita'),
      pool.query('SELECT COUNT(*) as total FROM pengumuman'),
      pool.query(`
        SELECT k.nama as kelas, COUNT(s.id) as jumlah
        FROM kelas k
        LEFT JOIN siswa_kelas_tinggi s ON k.id = s.kelasid
        GROUP BY k.id, k.nama
        ORDER BY k.nama
      `),
      pool.query(`
        SELECT jenis_kelamin, COUNT(*) as jumlah
        FROM siswa_kelas_tinggi
        GROUP BY jenis_kelamin
      `),
    ]);

    const analytics = {
      totalStudents: parseInt(siswaCount.rows[0].total),
      totalTeachers: parseInt(guruCount.rows[0].total),
      totalNews: parseInt(beritaCount.rows[0].total),
      totalAnnouncements: parseInt(pengumumanCount.rows[0].total),
      classDistribution: kelasDistribution.rows.reduce((acc, row) => {
        acc[row.kelas] = parseInt(row.jumlah);
        return acc;
      }, {}),
      genderDistribution: genderDistribution.rows.reduce((acc, row) => {
        acc[row.jenis_kelamin] = parseInt(row.jumlah);
        return acc;
      }, {}),
    };

    res.json(analytics);
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

module.exports = router;
