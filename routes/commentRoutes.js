const express = require('express');
const pool = require('../db');
const router = express.Router();

// Get comments by berita with replies
router.get('/berita/:beritaId', async (req, res) => {
  try {
    const { beritaId } = req.params;

    // Get all comments - PERBAIKAN query untuk siswa_kelas_tinggi
    const result = await pool.query(
      `SELECT k.*, s.nama as nama_siswa, k.parent_id
       FROM komentar_berita k 
       JOIN siswa_kelas_tinggi s ON k.siswa_id = s.id 
       WHERE k.berita_id = $1 
       ORDER BY k.created_at ASC`,
      [beritaId]
    );

    // Organize comments into threads
    const comments = result.rows;
    const commentMap = {};
    const rootComments = [];

    comments.forEach((comment) => {
      comment.replies = [];
      commentMap[comment.id] = comment;
    });

    comments.forEach((comment) => {
      if (comment.parent_id) {
        if (commentMap[comment.parent_id]) {
          commentMap[comment.parent_id].replies.push(comment);
        }
      } else {
        rootComments.push(comment);
      }
    });

    res.json(rootComments);
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Add comment or reply
router.post('/', async (req, res) => {
  try {
    const { berita_id, siswa_id, komentar, parent_id } = req.body;
    const result = await pool.query(
      `INSERT INTO komentar_berita (berita_id, siswa_id, komentar, parent_id) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [berita_id, siswa_id, komentar, parent_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Delete comment
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Hapus semua replies dulu
    await pool.query('DELETE FROM komentar_berita WHERE parent_id = $1', [id]);

    // Hapus comment utama
    const result = await pool.query('DELETE FROM komentar_berita WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Komentar tidak ditemukan' });
    }

    res.json({ message: 'Komentar berhasil dihapus' });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

module.exports = router;
