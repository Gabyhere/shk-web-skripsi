const express = require('express');
const pool = require('../db');
const router = express.Router();

function getJamPelajaran(kelas, jamKe) {
  const jamMulai = [
    '07.00-08.45', // Jam 1
    '09.00-10.45', // Jam 2 (setelah istirahat 1)
    '11.00-12.00', // Jam 3 (setelah istirahat 2)
    '12.00-13.00', // Jam 4
  ];
  return jamKe >= 0 && jamKe < jamMulai.length ? jamMulai[jamKe] : null;
}

// PENTING: Route spesifik HARUS di atas route dengan parameter
// Route: /calendar/events (paling spesifik)
router.get('/calendar/events', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT tanggal, judul, deskripsi
      FROM acara_sekolah
      WHERE tanggal >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY tanggal
    `);

    const events = {};
    result.rows.forEach((event) => {
      const dateKey = event.tanggal.toISOString().split('T')[0];
      events[dateKey] = {
        type: 'acara',
        title: event.judul,
      };
    });

    res.json(events);
  } catch (error) {
    console.error('Get calendar events error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Route: /detail/:kelasId (spesifik)
router.get('/detail/:kelasId', async (req, res) => {
  try {
    const kelasId = parseInt(req.params.kelasId);

    // Validasi parameter
    if (isNaN(kelasId)) {
      return res.status(400).json({ error: 'ID kelas harus berupa angka' });
    }

    const result = await pool.query(
      `SELECT 
        jp.jadwalid, 
        jp.hari, 
        jp.pelajaranid, 
        COALESCE(p.namapelajaran, 'Mata Pelajaran Tidak Ditemukan') as namapelajaran,
        jp.guru_id, 
        COALESCE(g.nama, 'Guru Tidak Ditemukan') as nama_guru, 
        jp.tanggal
       FROM jadwalpelajaran jp
       LEFT JOIN pelajaran p ON jp.pelajaranid = p.pelajaranid
       LEFT JOIN guru g ON jp.guru_id = g.id
       WHERE jp.kelasid = $1
       ORDER BY 
         CASE jp.hari 
           WHEN 'Senin' THEN 1
           WHEN 'Selasa' THEN 2
           WHEN 'Rabu' THEN 3
           WHEN 'Kamis' THEN 4
           WHEN 'Jumat' THEN 5
           ELSE 6
         END, 
         jp.tanggal, 
         jp.jadwalid`,
      [kelasId]
    );

    // Jika tidak ada data, return array kosong
    if (result.rows.length === 0) {
      return res.json([]); // HARUS RETURN ARRAY KOSONG, BUKAN OBJECT
    }

    // Group by hari dan assign jam
    const scheduleByDay = {};
    result.rows.forEach((row) => {
      if (!scheduleByDay[row.hari]) {
        scheduleByDay[row.hari] = [];
      }
      scheduleByDay[row.hari].push(row);
    });

    const jamLabels = ['07.00-08.45', '09.00-10.45', '11.00-12.00', '12.00-13.00'];
    const resultWithTime = [];

    Object.keys(scheduleByDay).forEach((hari) => {
      scheduleByDay[hari].forEach((row, index) => {
        resultWithTime.push({
          ...row,
          jamke: index, // Index 0-3 untuk matching dengan frontend
          jam: jamLabels[index] || '-',
        });
      });
    });

    res.json(resultWithTime);
  } catch (error) {
    console.error('Get schedule detail error:', error);
    res.status(500).json({
      error: 'Terjadi kesalahan server',
      details: error.message,
    });
  }
});

// Route: /last-update/:kelasId (spesifik)
router.get('/last-update/:kelasId', async (req, res) => {
  try {
    const kelasId = parseInt(req.params.kelasId);

    if (isNaN(kelasId)) {
      return res.status(400).json({ error: 'ID kelas harus berupa angka' });
    }

    const result = await pool.query(
      `SELECT MAX(COALESCE(jp.tanggal, CURRENT_TIMESTAMP)) as last_updated
       FROM jadwalpelajaran jp
       WHERE jp.kelasid = $1`,
      [kelasId]
    );

    res.json({
      last_updated: result.rows[0]?.last_updated || new Date(),
      kelasId,
    });
  } catch (error) {
    console.error('Get last update error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Route: /:kelasId PUT (update jadwal)
router.put('/:kelasId', async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const kelasId = parseInt(req.params.kelasId);
    const { schedules } = req.body;

    // Validasi kelasId
    if (isNaN(kelasId)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'ID kelas harus berupa angka' });
    }

    // Validasi schedules
    if (!schedules || !Array.isArray(schedules)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Data jadwal tidak valid' });
    }

    // Hapus jadwal lama
    await client.query(
      `
  DELETE FROM jadwalpelajaran 
  WHERE kelasid = $1 
  AND jadwalid NOT IN (
    SELECT DISTINCT jadwal_id FROM nilai WHERE jadwal_id IS NOT NULL
  )
`,
      [kelasId]
    );

    // Untuk jadwal yang sudah ada nilai, kita UPDATE aja (jangan DELETE)
    // Tapi untuk sederhananya, kita hapus relasi nilai dulu
    await client.query(
      `
  UPDATE nilai 
  SET jadwal_id = NULL 
  WHERE jadwal_id IN (
    SELECT jadwalid FROM jadwalpelajaran WHERE kelasid = $1
  )
`,
      [kelasId]
    );

    // Sekarang baru hapus semua jadwal lama
    await client.query('DELETE FROM jadwalpelajaran WHERE kelasid = $1', [kelasId]);

    // Insert jadwal baru
    for (const schedule of schedules) {
      const { hari, pelajaran_id, guru_id, tanggal } = schedule;

      // Validasi data required
      if (hari && pelajaran_id && guru_id && tanggal) {
        await client.query(
          `INSERT INTO jadwalpelajaran (kelasid, hari, pelajaranid, guru_id, tanggal) 
           VALUES ($1, $2, $3, $4, $5)`,
          [kelasId, hari, pelajaran_id, guru_id, tanggal]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Jadwal berhasil diupdate' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update schedule error:', error);
    res.status(500).json({
      error: 'Gagal mengupdate jadwal',
      details: error.message,
    });
  } finally {
    client.release();
  }
});

module.exports = router;
module.exports.getJamPelajaran = getJamPelajaran;
