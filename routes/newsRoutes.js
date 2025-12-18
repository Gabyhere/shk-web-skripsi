const express = require('express');
const pool = require('../db');
const upload = require('../middleware/upload');
const router = express.Router();

function formatDateSimple(date) {
  if (!date) return new Date().toISOString().split('T')[0];
  if (date instanceof Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof date === 'string') {
    return date.split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

// Get all news and announcements
router.get('/', async (req, res) => {
  try {
    const [beritaResult, pengumumanResult] = await Promise.all([
      pool.query(`
        SELECT 
          b.id,
          b.judul,
          b.konten,
          TO_CHAR(b.tanggal, 'YYYY-MM-DD') as tanggal,
          COALESCE(
            (SELECT urlfoto FROM foto_berita WHERE beritaid = b.id ORDER BY fotoberitaid DESC LIMIT 1),
            '📰'
          ) as gambar
        FROM berita b
        ORDER BY b.tanggal DESC
      `),
      pool.query('SELECT *, created_at as tanggal FROM pengumuman ORDER BY created_at DESC'),
    ]);

    const allItems = [
      ...beritaResult.rows.map((item) => ({
        ...item,
        type: 'berita',
      })),
      ...pengumumanResult.rows.map((item) => ({
        ...item,
        type: 'pengumuman',
        tanggal: formatDateSimple(item.created_at || item.tanggal),
      })),
    ].sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));

    res.json(allItems);
  } catch (error) {
    console.error('Get news error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Get news only
router.get('/berita', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        b.id,
        b.judul,
        b.konten,
        TO_CHAR(b.tanggal, 'YYYY-MM-DD') as tanggal,
        COALESCE(
          (SELECT urlfoto FROM foto_berita WHERE beritaid = b.id ORDER BY fotoberitaid DESC LIMIT 1),
          '📰'
        ) as gambar
      FROM berita b
      ORDER BY b.tanggal DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Get berita error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Get announcements only
router.get('/pengumuman', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pengumuman ORDER BY created_at DESC');
    const formatted = result.rows.map((item) => ({
      ...item,
      tanggal: formatDateSimple(item.created_at),
    }));
    res.json(formatted);
  } catch (error) {
    console.error('Get pengumuman error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Get news only
router.get('/berita', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        b.*,
        COALESCE(
          (SELECT urlfoto FROM foto_berita WHERE beritaid = b.id LIMIT 1),
          '📰'
        ) as gambar,
        TO_CHAR(b.tanggal, 'YYYY-MM-DD') as tanggal
      FROM berita b
      ORDER BY b.tanggal DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get berita error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Add pengumuman
router.post('/pengumuman', async (req, res) => {
  try {
    const { judul, pesan } = req.body;
    const result = await pool.query(
      `INSERT INTO pengumuman (judul, pesan) 
       VALUES ($1, $2) 
       RETURNING *`,
      [judul, pesan]
    );
    res.status(201).json({
      message: 'Pengumuman berhasil ditambahkan',
      pengumuman: result.rows[0],
    });
  } catch (error) {
    console.error('Add announcement error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// STEP 1: Add berita (tanpa foto)
router.post('/berita', async (req, res) => {
  try {
    const { judul, konten, tanggal } = req.body;
    const result = await pool.query(
      `INSERT INTO berita (judul, konten, tanggal) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [judul, konten, tanggal || new Date().toISOString().split('T')[0]]
    );
    res.status(201).json({
      message: 'Berita berhasil ditambahkan',
      berita_id: result.rows[0].id,
      berita: result.rows[0],
    });
  } catch (error) {
    console.error('Add news error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// STEP 2: Add foto ke berita
router.post('/berita/:id/foto', upload.single('foto'), async (req, res) => {
  try {
    const beritaId = parseInt(req.params.id);
    const { deskripsi } = req.body;
    const urlfoto = req.file ? `/uploads/${req.file.filename}` : '📰';

    await pool.query(
      `INSERT INTO foto_berita (beritaid, urlfoto, deskripsi) 
       VALUES ($1, $2, $3)`,
      [beritaId, urlfoto, deskripsi || '']
    );

    res.status(201).json({ message: 'Foto berhasil ditambahkan' });
  } catch (error) {
    console.error('Add foto error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// STEP 3: Add sumber berita
router.post('/berita/:id/sumber', async (req, res) => {
  try {
    const beritaId = parseInt(req.params.id);
    const { nama_sumber, link_sumber } = req.body;

    await pool.query(
      `INSERT INTO sumber_berita (beritaid, namasumber, url) 
       VALUES ($1, $2, $3)`,
      [beritaId, nama_sumber, link_sumber]
    );

    res.status(201).json({ message: 'Sumber berhasil ditambahkan' });
  } catch (error) {
    console.error('Add sumber error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Update pengumuman
router.put('/pengumuman/:id', async (req, res) => {
  try {
    const pengumumanId = parseInt(req.params.id);
    const { judul, pesan } = req.body;
    const result = await pool.query(
      `UPDATE pengumuman 
       SET judul = $1, pesan = $2 
       WHERE id = $3 
       RETURNING *`,
      [judul, pesan, pengumumanId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pengumuman tidak ditemukan' });
    }
    res.json({
      message: 'Pengumuman berhasil diupdate',
      pengumuman: result.rows[0],
    });
  } catch (error) {
    console.error('Update pengumuman error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Update berita
router.put('/berita/:id', upload.single('foto'), async (req, res) => {
  try {
    const beritaId = parseInt(req.params.id);
    const { judul, konten, tanggal } = req.body;

    await pool.query(
      `UPDATE berita 
       SET judul = $1, konten = $2, tanggal = $3
       WHERE id = $4`,
      [judul, konten, tanggal, beritaId]
    );

    if (req.file) {
      const urlfoto = `/uploads/${req.file.filename}`;
      const existingFoto = await pool.query(
        'SELECT fotoberitaid FROM foto_berita WHERE beritaid = $1 LIMIT 1',
        [beritaId]
      );

      if (existingFoto.rows.length > 0) {
        await pool.query('UPDATE foto_berita SET urlfoto = $1 WHERE beritaid = $2', [
          urlfoto,
          beritaId,
        ]);
      } else {
        await pool.query('INSERT INTO foto_berita (beritaid, urlfoto) VALUES ($1, $2)', [
          beritaId,
          urlfoto,
        ]);
      }
    }

    res.json({ message: 'Berita berhasil diupdate' });
  } catch (error) {
    console.error('Update berita error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Delete berita
router.delete('/berita/:id', async (req, res) => {
  try {
    const beritaId = parseInt(req.params.id);
    const result = await pool.query('DELETE FROM berita WHERE id = $1 RETURNING *', [beritaId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Berita tidak ditemukan' });
    }
    res.json({
      message: 'Berita berhasil dihapus',
      berita: result.rows[0],
    });
  } catch (error) {
    console.error('Delete berita error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Delete pengumuman
router.delete('/pengumuman/:id', async (req, res) => {
  try {
    const pengumumanId = parseInt(req.params.id);
    const result = await pool.query('DELETE FROM pengumuman WHERE id = $1 RETURNING *', [
      pengumumanId,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pengumuman tidak ditemukan' });
    }
    res.json({
      message: 'Pengumuman berhasil dihapus',
      pengumuman: result.rows[0],
    });
  } catch (error) {
    console.error('Delete pengumuman error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

module.exports = router;
