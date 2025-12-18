const express = require('express');
const pool = require('../db');
const router = express.Router();

router.get('/nilai/:siswaId', async (req, res) => {
  try {
    const siswaId = parseInt(req.params.siswaId);

    const result = await pool.query(
      `
      SELECT 
        n.id, 
        COALESCE(n.nama_mata_pelajaran, p.namapelajaran) as nama_pelajaran, 
        n.nilai, 
        r.semester, 
        ta.tahun_mulai || '/' || ta.tahun_akhir as tahun_ajaran,
        n.keterangan,
        n.rapor_id,
        n.siswa_id,
        jp.pelajaranid
      FROM nilai n
      LEFT JOIN jadwalpelajaran jp ON n.jadwal_id = jp.jadwalid
      LEFT JOIN pelajaran p ON jp.pelajaranid = p.pelajaranid
      JOIN rapor r ON n.rapor_id = r.id
      LEFT JOIN tahun_ajaran ta ON r.tahun_ajaran_id = ta.id
      WHERE n.siswa_id = $1
      ORDER BY ta.tahun_mulai DESC, r.semester DESC, COALESCE(n.nama_mata_pelajaran, p.namapelajaran)
    `,
      [siswaId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get grades error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

router.get('/rapor/:siswaId', async (req, res) => {
  try {
    const siswaId = parseInt(req.params.siswaId);

    const result = await pool.query(
      `
      SELECT r.id, r.semester, 
             ta.tahun_mulai || '/' || ta.tahun_akhir as tahun_ajaran, 
             r.komentar
      FROM rapor r
      LEFT JOIN tahun_ajaran ta ON r.tahun_ajaran_id = ta.id
      WHERE r.siswa_id = $1
      ORDER BY ta.tahun_mulai DESC, r.semester DESC
    `,
      [siswaId]
    );

    const raporWithNilai = await Promise.all(
      result.rows.map(async (rapor) => {
        const nilaiResult = await pool.query(
          `
          SELECT p.namapelajaran as mata_pelajaran, n.nilai
          FROM nilai n
          JOIN jadwalpelajaran jp ON n.jadwal_id = jp.jadwalid
          JOIN pelajaran p ON jp.pelajaranid = p.pelajaranid
          WHERE n.rapor_id = $1
        `,
          [rapor.id]
        );

        const nilai = {};
        nilaiResult.rows.forEach((item) => {
          nilai[item.mata_pelajaran.toLowerCase().replace(' ', '_')] = item.nilai;
        });

        return {
          ...rapor,
          nilai,
        };
      })
    );

    res.json(raporWithNilai);
  } catch (error) {
    console.error('Get report cards error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

router.get('/rapor/all', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT r.id, s.nama as nama_siswa, k.nama as kelas, r.semester,
             ta.tahun_mulai || '/' || ta.tahun_akhir as tahun_ajaran, 
             r.komentar
      FROM rapor r
      JOIN siswa_kelas_tinggi s ON r.siswa_id = s.id
      LEFT JOIN kelas k ON s.kelasid = k.id
      LEFT JOIN tahun_ajaran ta ON r.tahun_ajaran_id = ta.id
      ORDER BY ta.tahun_mulai DESC, r.semester DESC, s.nama
    `
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get all rapor error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

router.post('/nilai', async (req, res) => {
  try {
    const { siswa_id, jadwal_id, nilai, rapor_id, nama_mata_pelajaran } = req.body;

    const existing = await pool.query(
      `SELECT id FROM nilai 
       WHERE siswa_id = $1 AND jadwal_id = $2 AND rapor_id = $3`,
      [siswa_id, jadwal_id, rapor_id]
    );

    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(
        `UPDATE nilai SET nilai = $1, nama_mata_pelajaran = $2
         WHERE siswa_id = $3 AND jadwal_id = $4 AND rapor_id = $5
         RETURNING *`,
        [nilai, nama_mata_pelajaran, siswa_id, jadwal_id, rapor_id]
      );
    } else {
      result = await pool.query(
        `INSERT INTO nilai (siswa_id, jadwal_id, rapor_id, nilai, nama_mata_pelajaran) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [siswa_id, jadwal_id, rapor_id, nilai, nama_mata_pelajaran]
      );
    }

    res.status(201).json({
      message: 'Nilai berhasil disimpan',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Save grades error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

router.post('/nilai/single', async (req, res) => {
  try {
    const { siswa_id, pelajaran_id, nilai, semester, tahun_ajaran_id, keterangan } = req.body;

    console.log('Saving nilai with keterangan:', keterangan);

    let raporResult = await pool.query(
      'SELECT id FROM rapor WHERE siswa_id = $1 AND semester = $2 AND tahun_ajaran_id = $3',
      [siswa_id, semester, tahun_ajaran_id]
    );

    let rapor_id;
    if (raporResult.rows.length === 0) {
      const newRapor = await pool.query(
        'INSERT INTO rapor (siswa_id, semester, tahun_ajaran_id) VALUES ($1, $2, $3) RETURNING id',
        [siswa_id, semester, tahun_ajaran_id]
      );
      rapor_id = newRapor.rows[0].id;
    } else {
      rapor_id = raporResult.rows[0].id;
    }

    let jadwalResult = await pool.query(
      `SELECT jp.jadwalid 
       FROM jadwalpelajaran jp
       JOIN siswa_kelas_tinggi s ON jp.kelasid = s.kelasid
       WHERE s.id = $1 AND jp.pelajaranid = $2
       LIMIT 1`,
      [siswa_id, pelajaran_id]
    );

    let jadwal_id;

    if (jadwalResult.rows.length === 0) {
      const siswaResult = await pool.query('SELECT kelasid FROM siswa_kelas_tinggi WHERE id = $1', [
        siswa_id,
      ]);

      if (siswaResult.rows.length === 0) {
        return res.status(400).json({ error: 'Siswa tidak ditemukan' });
      }

      const kelasid = siswaResult.rows[0].kelasid;

      const newJadwal = await pool.query(
        `INSERT INTO jadwalpelajaran (kelasid, pelajaranid, hari) 
         VALUES ($1, $2, 'Senin') 
         RETURNING jadwalid`,
        [kelasid, pelajaran_id]
      );

      jadwal_id = newJadwal.rows[0].jadwalid;
    } else {
      jadwal_id = jadwalResult.rows[0].jadwalid;
    }

    const pelajaranResult = await pool.query(
      'SELECT namapelajaran FROM pelajaran WHERE pelajaranid = $1',
      [pelajaran_id]
    );
    const nama_mata_pelajaran = pelajaranResult.rows[0].namapelajaran;

    // âœ… NILAI INI ADALAH NILAI TUGAS (bukan rata-rata untuk rapor!)
    let finalNilai = parseFloat(nilai);

    // âœ… Format keterangan sesuai semester
    let keterangan_final = keterangan || '';

    console.log(
      `Saving ${nama_mata_pelajaran}: Nilai Tugas=${finalNilai}, Keterangan=${keterangan_final}`
    );

    const existingNilai = await pool.query(
      'SELECT id FROM nilai WHERE siswa_id = $1 AND jadwal_id = $2 AND rapor_id = $3',
      [siswa_id, jadwal_id, rapor_id]
    );

    let result;
    if (existingNilai.rows.length > 0) {
      result = await pool.query(
        `UPDATE nilai 
         SET nilai = $1, keterangan = $2, nama_mata_pelajaran = $3
         WHERE siswa_id = $4 AND jadwal_id = $5 AND rapor_id = $6
         RETURNING *`,
        [finalNilai, keterangan_final, nama_mata_pelajaran, siswa_id, jadwal_id, rapor_id]
      );
    } else {
      result = await pool.query(
        `INSERT INTO nilai (siswa_id, jadwal_id, rapor_id, nilai, keterangan, nama_mata_pelajaran)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [siswa_id, jadwal_id, rapor_id, finalNilai, keterangan_final, nama_mata_pelajaran]
      );
    }

    res.status(201).json({
      message: 'Nilai berhasil disimpan',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Save single nilai error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server', detail: error.message });
  }
});

router.get('/nilai-individual/:siswaId', async (req, res) => {
  try {
    const siswaId = parseInt(req.params.siswaId);

    const result = await pool.query(
      `
      SELECT 
        n.id,
        COALESCE(p.namapelajaran, n.nama_mata_pelajaran) as nama_pelajaran,
        p.pelajaranid,
        n.nilai,
        r.semester,
        ta.tahun_mulai || '/' || ta.tahun_akhir as tahun_ajaran,
        n.keterangan,
        n.siswa_id
      FROM nilai n
      JOIN rapor r ON n.rapor_id = r.id
      JOIN tahun_ajaran ta ON r.tahun_ajaran_id = ta.id
      LEFT JOIN jadwalpelajaran jp ON n.jadwal_id = jp.jadwalid
      LEFT JOIN pelajaran p ON jp.pelajaranid = p.pelajaranid
      WHERE n.siswa_id = $1 
      AND (
        n.keterangan IS NULL 
        OR n.keterangan = '' 
        OR n.keterangan = 'manual_input'
        OR (
          n.keterangan NOT LIKE '%uh1:%' 
          AND n.keterangan NOT LIKE '%uh2:%' 
          AND n.keterangan NOT LIKE '%uts:%' 
          AND n.keterangan NOT LIKE '%uas:%'
        )
      )
      ORDER BY ta.tahun_mulai DESC, r.semester DESC, p.namapelajaran
      `,
      [siswaId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get individual nilai error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

router.get('/nilai-individual', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT 
        n.id,
        s.nama as nama_siswa,
        s.kelasid,
        s.id as siswa_id,
        k.nama as kelas_nama,
        COALESCE(p.namapelajaran, n.nama_mata_pelajaran) as nama_pelajaran,
        p.pelajaranid,
        n.nilai,
        r.semester,
        ta.tahun_mulai || '/' || ta.tahun_akhir as tahun_ajaran,
        n.keterangan
      FROM nilai n
      JOIN rapor r ON n.rapor_id = r.id
      JOIN tahun_ajaran ta ON r.tahun_ajaran_id = ta.id
      JOIN siswa_kelas_tinggi s ON n.siswa_id = s.id
      LEFT JOIN kelas k ON s.kelasid = k.id
      LEFT JOIN jadwalpelajaran jp ON n.jadwal_id = jp.jadwalid
      LEFT JOIN pelajaran p ON jp.pelajaranid = p.pelajaranid
      WHERE (
        n.keterangan IS NULL 
        OR n.keterangan = '' 
        OR n.keterangan = 'manual_input'
        OR (
          n.keterangan NOT LIKE '%uh1:%' 
          AND n.keterangan NOT LIKE '%uh2:%' 
          AND n.keterangan NOT LIKE '%uts:%' 
          AND n.keterangan NOT LIKE '%uas:%'
        )
      )
      ORDER BY s.nama, ta.tahun_mulai DESC, r.semester DESC
      `
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get all manual nilai error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

router.post('/nilai-individual', async (req, res) => {
  try {
    const { siswa_id, pelajaran_id, nilai, semester, tahun_ajaran_id } = req.body;

    console.log('📝 Saving MANUAL nilai:', { siswa_id, pelajaran_id, nilai, semester });

    // 1. Cari atau buat rapor
    let raporResult = await pool.query(
      'SELECT id FROM rapor WHERE siswa_id = $1 AND semester = $2 AND tahun_ajaran_id = $3',
      [siswa_id, semester, tahun_ajaran_id]
    );

    let rapor_id;
    if (raporResult.rows.length === 0) {
      const newRapor = await pool.query(
        'INSERT INTO rapor (siswa_id, semester, tahun_ajaran_id) VALUES ($1, $2, $3) RETURNING id',
        [siswa_id, semester, tahun_ajaran_id]
      );
      rapor_id = newRapor.rows[0].id;
    } else {
      rapor_id = raporResult.rows[0].id;
    }

    // 2. Cari atau buat jadwal
    let jadwalResult = await pool.query(
      `SELECT jp.jadwalid 
       FROM jadwalpelajaran jp
       JOIN siswa_kelas_tinggi s ON jp.kelasid = s.kelasid
       WHERE s.id = $1 AND jp.pelajaranid = $2
       LIMIT 1`,
      [siswa_id, pelajaran_id]
    );

    let jadwal_id;
    if (jadwalResult.rows.length === 0) {
      const siswaResult = await pool.query('SELECT kelasid FROM siswa_kelas_tinggi WHERE id = $1', [
        siswa_id,
      ]);
      if (siswaResult.rows.length === 0) {
        return res.status(400).json({ error: 'Siswa tidak ditemukan' });
      }

      const kelasid = siswaResult.rows[0].kelasid;
      const newJadwal = await pool.query(
        `INSERT INTO jadwalpelajaran (kelasid, pelajaranid, hari) 
         VALUES ($1, $2, 'Senin') 
         RETURNING jadwalid`,
        [kelasid, pelajaran_id]
      );
      jadwal_id = newJadwal.rows[0].jadwalid;
    } else {
      jadwal_id = jadwalResult.rows[0].jadwalid;
    }

    // 3. Get nama pelajaran
    const pelajaranResult = await pool.query(
      'SELECT namapelajaran FROM pelajaran WHERE pelajaranid = $1',
      [pelajaran_id]
    );
    const nama_mata_pelajaran = pelajaranResult.rows[0].namapelajaran;

    const existingNilai = await pool.query(
      `SELECT id FROM nilai 
       WHERE siswa_id = $1 
       AND jadwal_id = $2 
       AND rapor_id = $3
       AND (
         keterangan IS NULL 
         OR keterangan = '' 
         OR keterangan = 'manual_input'
       )`,
      [siswa_id, jadwal_id, rapor_id]
    );

    let result;
    if (existingNilai.rows.length > 0) {
      // Update existing manual nilai
      result = await pool.query(
        `UPDATE nilai 
         SET nilai = $1
         WHERE id = $2
         RETURNING *`,
        [nilai, existingNilai.rows[0].id]
      );
      console.log('✅ Updated existing manual nilai:', result.rows[0].id);
    } else {
      // Insert new manual nilai dengan keterangan kosong
      result = await pool.query(
        `INSERT INTO nilai (siswa_id, jadwal_id, rapor_id, nilai, keterangan, nama_mata_pelajaran)
         VALUES ($1, $2, $3, $4, '', $5)
         RETURNING *`,
        [siswa_id, jadwal_id, rapor_id, nilai, nama_mata_pelajaran]
      );
      console.log('✅ Inserted new manual nilai:', result.rows[0].id);
    }

    res.status(201).json({
      message: 'Nilai manual berhasil disimpan',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Save manual nilai error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server', detail: error.message });
  }
});

// Get ALL nilai individual (untuk manajemen nilai)
router.get('/nilai-individual', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT 
        n.id,
        s.nama as nama_siswa,
        s.kelasid,
        k.nama as kelas_nama,
        COALESCE(p.namapelajaran, n.nama_mata_pelajaran) as nama_pelajaran,
        p.pelajaranid,
        n.nilai,
        r.semester,
        ta.tahun_mulai || '/' || ta.tahun_akhir as tahun_ajaran,
        n.keterangan
      FROM nilai n
      JOIN rapor r ON n.rapor_id = r.id
      JOIN tahun_ajaran ta ON r.tahun_ajaran_id = ta.id
      JOIN siswa_kelas_tinggi s ON n.siswa_id = s.id
      LEFT JOIN kelas k ON s.kelasid = k.id
      LEFT JOIN jadwalpelajaran jp ON n.jadwal_id = jp.jadwalid
      LEFT JOIN pelajaran p ON jp.pelajaranid = p.pelajaranid
      WHERE n.keterangan = 'manual_input'
      ORDER BY s.nama, ta.tahun_mulai DESC, r.semester DESC
      `
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get all manual nilai error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

router.post('/nilai-individual', async (req, res) => {
  try {
    const { siswa_id, pelajaran_id, nilai, semester, tahun_ajaran_id, tipe_nilai } = req.body;

    console.log('Saving MANUAL nilai:', { siswa_id, pelajaran_id, nilai, semester });

    // 1. Cari atau buat rapor
    let raporResult = await pool.query(
      'SELECT id FROM rapor WHERE siswa_id = $1 AND semester = $2 AND tahun_ajaran_id = $3',
      [siswa_id, semester, tahun_ajaran_id]
    );

    let rapor_id;
    if (raporResult.rows.length === 0) {
      const newRapor = await pool.query(
        'INSERT INTO rapor (siswa_id, semester, tahun_ajaran_id) VALUES ($1, $2, $3) RETURNING id',
        [siswa_id, semester, tahun_ajaran_id]
      );
      rapor_id = newRapor.rows[0].id;
    } else {
      rapor_id = raporResult.rows[0].id;
    }

    // 2. Cari atau buat jadwal
    let jadwalResult = await pool.query(
      `SELECT jp.jadwalid 
       FROM jadwalpelajaran jp
       JOIN siswa_kelas_tinggi s ON jp.kelasid = s.kelasid
       WHERE s.id = $1 AND jp.pelajaranid = $2
       LIMIT 1`,
      [siswa_id, pelajaran_id]
    );

    let jadwal_id;
    if (jadwalResult.rows.length === 0) {
      const siswaResult = await pool.query('SELECT kelasid FROM siswa_kelas_tinggi WHERE id = $1', [
        siswa_id,
      ]);
      if (siswaResult.rows.length === 0) {
        return res.status(400).json({ error: 'Siswa tidak ditemukan' });
      }

      const kelasid = siswaResult.rows[0].kelasid;
      const newJadwal = await pool.query(
        `INSERT INTO jadwalpelajaran (kelasid, pelajaranid, hari) 
         VALUES ($1, $2, 'Senin') 
         RETURNING jadwalid`,
        [kelasid, pelajaran_id]
      );
      jadwal_id = newJadwal.rows[0].jadwalid;
    } else {
      jadwal_id = jadwalResult.rows[0].jadwalid;
    }

    // 3. Get nama pelajaran
    const pelajaranResult = await pool.query(
      'SELECT namapelajaran FROM pelajaran WHERE pelajaranid = $1',
      [pelajaran_id]
    );
    const nama_mata_pelajaran = pelajaranResult.rows[0].namapelajaran;

    // âœ… 4. CEK APAKAH SUDAH ADA NILAI MANUAL (keterangan='manual_input')
    const existingNilai = await pool.query(
      `SELECT id FROM nilai 
       WHERE siswa_id = $1 
       AND jadwal_id = $2 
       AND rapor_id = $3
       AND keterangan = 'manual_input'`,
      [siswa_id, jadwal_id, rapor_id]
    );

    let result;
    if (existingNilai.rows.length > 0) {
      // Update existing manual nilai
      result = await pool.query(
        `UPDATE nilai 
         SET nilai = $1
         WHERE id = $2
         RETURNING *`,
        [nilai, existingNilai.rows[0].id]
      );
    } else {
      // Insert new manual nilai dengan keterangan='manual_input'
      result = await pool.query(
        `INSERT INTO nilai (siswa_id, jadwal_id, rapor_id, nilai, keterangan, nama_mata_pelajaran)
         VALUES ($1, $2, $3, $4, 'manual_input', $5)
         RETURNING *`,
        [siswa_id, jadwal_id, rapor_id, nilai, nama_mata_pelajaran]
      );
    }

    res.status(201).json({
      message: 'Nilai manual berhasil disimpan',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Save manual nilai error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server', detail: error.message });
  }
});

router.put('/nilai/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nilai, keterangan } = req.body;

    const result = await pool.query(
      'UPDATE nilai SET nilai = $1, keterangan = $2 WHERE id = $3 RETURNING *',
      [nilai, keterangan, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Nilai tidak ditemukan' });
    }

    res.json({
      message: 'Nilai berhasil diupdate',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update nilai error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

router.delete('/nilai/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // âœ… CEK DULU APAKAH NILAI ADA
    const checkNilai = await client.query('SELECT * FROM nilai WHERE id = $1', [id]);

    if (checkNilai.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Nilai tidak ditemukan' });
    }

    // âœ… HAPUS NILAI
    await client.query('DELETE FROM nilai WHERE id = $1', [id]);

    await client.query('COMMIT');

    res.json({
      message: 'Nilai berhasil dihapus',
      deleted: checkNilai.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete nilai error:', error);
    res.status(500).json({
      error: 'Terjadi kesalahan server',
      detail: error.message,
    });
  } finally {
    client.release();
  }
});

router.get('/pelajaran', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pelajaran ORDER BY namapelajaran');
    res.json(result.rows);
  } catch (error) {
    console.error('Get pelajaran error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

router.post('/rapor', async (req, res) => {
  try {
    const { siswa_id, semester, tahun_ajaran_id, komentar } = req.body;

    const existing = await pool.query(
      'SELECT id FROM rapor WHERE siswa_id = $1 AND semester = $2 AND tahun_ajaran_id = $3',
      [siswa_id, semester, tahun_ajaran_id]
    );

    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(
        `UPDATE rapor SET komentar = $1 
         WHERE siswa_id = $2 AND semester = $3 AND tahun_ajaran_id = $4
         RETURNING *`,
        [komentar, siswa_id, semester, tahun_ajaran_id]
      );
    } else {
      result = await pool.query(
        `INSERT INTO rapor (siswa_id, semester, tahun_ajaran_id, komentar) 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
        [siswa_id, semester, tahun_ajaran_id, komentar]
      );
    }

    res.status(201).json({
      message: 'Rapor berhasil disimpan',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Save report card error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

router.post('/rapor/nilai', async (req, res) => {
  try {
    const { siswa_id, pelajaran_id, nilai_rata, semester, tahun_ajaran_id, keterangan } = req.body;

    console.log('Saving rapor nilai:', { siswa_id, nilai_rata, keterangan });

    // 1. Cari atau buat rapor
    let raporResult = await pool.query(
      'SELECT id FROM rapor WHERE siswa_id = $1 AND semester = $2 AND tahun_ajaran_id = $3',
      [siswa_id, semester, tahun_ajaran_id]
    );

    let rapor_id;
    if (raporResult.rows.length === 0) {
      const newRapor = await pool.query(
        'INSERT INTO rapor (siswa_id, semester, tahun_ajaran_id) VALUES ($1, $2, $3) RETURNING id',
        [siswa_id, semester, tahun_ajaran_id]
      );
      rapor_id = newRapor.rows[0].id;
    } else {
      rapor_id = raporResult.rows[0].id;
    }

    // 2. Cari atau buat jadwal
    let jadwalResult = await pool.query(
      `SELECT jp.jadwalid 
       FROM jadwalpelajaran jp
       JOIN siswa_kelas_tinggi s ON jp.kelasid = s.kelasid
       WHERE s.id = $1 AND jp.pelajaranid = $2
       LIMIT 1`,
      [siswa_id, pelajaran_id]
    );

    let jadwal_id;
    if (jadwalResult.rows.length === 0) {
      const siswaResult = await pool.query('SELECT kelasid FROM siswa_kelas_tinggi WHERE id = $1', [
        siswa_id,
      ]);
      if (siswaResult.rows.length === 0) {
        return res.status(400).json({ error: 'Siswa tidak ditemukan' });
      }

      const kelasid = siswaResult.rows[0].kelasid;
      const newJadwal = await pool.query(
        `INSERT INTO jadwalpelajaran (kelasid, pelajaranid, hari) 
         VALUES ($1, $2, 'Senin') 
         RETURNING jadwalid`,
        [kelasid, pelajaran_id]
      );
      jadwal_id = newJadwal.rows[0].jadwalid;
    } else {
      jadwal_id = jadwalResult.rows[0].jadwalid;
    }

    // 3. Get nama pelajaran
    const pelajaranResult = await pool.query(
      'SELECT namapelajaran FROM pelajaran WHERE pelajaranid = $1',
      [pelajaran_id]
    );
    const nama_mata_pelajaran = pelajaranResult.rows[0].namapelajaran;

    // âœ… 4. Cek apakah sudah ada nilai RAPOR (bukan manual_input)
    const existingNilai = await pool.query(
      'SELECT id FROM nilai WHERE siswa_id = $1 AND jadwal_id = $2 AND rapor_id = $3 AND keterangan != $4',
      [siswa_id, jadwal_id, rapor_id, 'manual_input']
    );

    let result;
    if (existingNilai.rows.length > 0) {
      // Update existing
      result = await pool.query(
        `UPDATE nilai 
         SET nilai = $1, keterangan = $2
         WHERE siswa_id = $3 AND jadwal_id = $4 AND rapor_id = $5
         RETURNING *`,
        [nilai_rata, keterangan, siswa_id, jadwal_id, rapor_id]
      );
    } else {
      // Insert new
      result = await pool.query(
        `INSERT INTO nilai (siswa_id, jadwal_id, rapor_id, nilai, keterangan, nama_mata_pelajaran)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [siswa_id, jadwal_id, rapor_id, nilai_rata, keterangan, nama_mata_pelajaran]
      );
    }

    res.status(201).json({
      message: 'Nilai rapor berhasil disimpan',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Save rapor nilai error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server', detail: error.message });
  }
});

router.put('/rapor/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { komentar } = req.body;

    const result = await pool.query('UPDATE rapor SET komentar = $1 WHERE id = $2 RETURNING *', [
      komentar,
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rapor tidak ditemukan' });
    }

    res.json({
      message: 'Rapor berhasil diupdate',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update rapor error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

router.delete('/rapor/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query('DELETE FROM nilai WHERE rapor_id = $1', [id]);
    const result = await pool.query('DELETE FROM rapor WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rapor tidak ditemukan' });
    }

    res.json({ message: 'Rapor berhasil dihapus' });
  } catch (error) {
    console.error('Delete rapor error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

module.exports = router;
