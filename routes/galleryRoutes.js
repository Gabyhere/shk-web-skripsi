const express = require('express');
const pool = require('../db');
const upload = require('../middleware/upload');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.fotoacaraid as id, a.judul, 
       a.deskripsi as deskripsi_acara, 
       f.deskripsi as deskripsi_foto,
       f.urlfoto as gambar_url, 
       TO_CHAR(a.tanggal, 'YYYY-MM-DD') as tanggal
      FROM foto_acara_sekolah f
      JOIN acara_sekolah a ON f.acaraid = a.acaraid
      ORDER BY a.tanggal DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get gallery error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

router.post('/acara', async (req, res) => {
  try {
    const { judul, deskripsi, tanggal } = req.body;

    const result = await pool.query(
      `INSERT INTO acara_sekolah (judul, deskripsi, tanggal) 
       VALUES ($1, $2, $3) 
       RETURNING acaraid`,
      [judul, deskripsi, tanggal]
    );

    res.status(201).json({ acara_id: result.rows[0].acaraid });
  } catch (error) {
    console.error('Create acara error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Step 2: Add Foto to Acara
router.post('/foto', upload.single('foto'), async (req, res) => {
  try {
    const { acara_id, deskripsi } = req.body;
    const gambar_url = req.file ? `/uploads/gallery/${req.file.filename}` : '📸';

    const result = await pool.query(
      `INSERT INTO foto_acara_sekolah (acaraid, urlfoto, deskripsi) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [acara_id, gambar_url, deskripsi]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add foto error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Add gallery dengan upload foto
router.post('/', upload.single('foto'), async (req, res) => {
  try {
    const { judul, deskripsi, tanggal } = req.body;
    const gambar_url = req.file ? `/uploads/gallery/${req.file.filename}` : '📸';

    const acaraResult = await pool.query(
      `INSERT INTO acara_sekolah (judul, deskripsi, tanggal) 
       VALUES ($1, $2, $3) 
       RETURNING acaraid`,
      [judul, deskripsi, tanggal]
    );

    const acaraId = acaraResult.rows[0].acaraid;

    const fotoResult = await pool.query(
      `INSERT INTO foto_acara_sekolah (acaraid, urlfoto, deskripsi) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [acaraId, gambar_url, deskripsi]
    );

    res.status(201).json(fotoResult.rows[0]);
  } catch (error) {
    console.error('Add gallery error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Update gallery
router.put('/:id', upload.single('foto'), async (req, res) => {
  try {
    const { id } = req.params;
    const { judul, deskripsi } = req.body;
    const gambar_url = req.file ? `/uploads/gallery/${req.file.filename}` : req.body.gambar_url;

    const fotoResult = await pool.query(
      `UPDATE foto_acara_sekolah 
       SET urlfoto = $1, deskripsi = $2
       WHERE fotoacaraid = $3 
       RETURNING acaraid`,
      [gambar_url, deskripsi, id]
    );

    if (fotoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Gallery tidak ditemukan' });
    }
    if (judul) {
      await pool.query(`UPDATE acara_sekolah SET judul = $1 WHERE acaraid = $2`, [
        judul,
        fotoResult.rows[0].acaraid,
      ]);
    }

    res.json({ message: 'Gallery berhasil diupdate' });
  } catch (error) {
    console.error('Update gallery error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Delete gallery
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fotoResult = await pool.query(
      'SELECT acaraid FROM foto_acara_sekolah WHERE fotoacaraid = $1',
      [id]
    );

    if (fotoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Gallery tidak ditemukan' });
    }

    const acaraId = fotoResult.rows[0].acaraid;

    await pool.query('DELETE FROM foto_acara_sekolah WHERE fotoacaraid = $1', [id]);

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM foto_acara_sekolah WHERE acaraid = $1',
      [acaraId]
    );

    if (parseInt(countResult.rows[0].count) === 0) {
      await pool.query('DELETE FROM acara_sekolah WHERE acaraid = $1', [acaraId]);
    }

    res.json({ message: 'Gallery berhasil dihapus' });
  } catch (error) {
    console.error('Delete gallery error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

module.exports = router;
