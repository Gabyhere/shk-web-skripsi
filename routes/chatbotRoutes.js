const express = require('express');
const pool = require('../db');
const router = express.Router();

router.post('/message', async (req, res) => {
  try {
    const { message, siswa_id } = req.body;

    console.log('📨 Received message:', message);
    console.log('👤 Siswa ID:', siswa_id);

    // Get student data
    const siswaResult = await pool.query(
      'SELECT s.*, k.nama as kelas FROM siswa_kelas_tinggi s LEFT JOIN kelas k ON s.kelasid = k.id WHERE s.id = $1',
      [siswa_id]
    );

    if (siswaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    }

    const siswa = siswaResult.rows[0];
    const lowerMessage = message.toLowerCase();

    console.log('🎓 Siswa data:', siswa);
    console.log('📚 Kelas ID:', siswa.kelasid);

    // CHECK IF CURRENTLY IN "CHAT WITH GURU" MODE
    const lastChatResult = await pool.query(
      `SELECT * FROM chat 
       WHERE siswa_id = $1 
       AND guru_id IS NOT NULL 
       AND waktu >= NOW() - INTERVAL '30 minutes'
       ORDER BY waktu DESC 
       LIMIT 1`,
      [siswa_id]
    );

    const isConnectedToGuru = lastChatResult.rows.length > 0;

    // Save student message
    await pool.query(
      `INSERT INTO chat (siswa_id, pesan, tipe_penerima) 
       VALUES ($1, $2, $3)`,
      [siswa_id, message, isConnectedToGuru ? 'guru' : 'chatbot']
    );

    let response = '';
    let shouldForwardToGuru = false;

    if (isConnectedToGuru) {
      // Check if student wants to end chat
      if (
        lowerMessage.includes('sudah jelas') ||
        lowerMessage.includes('terima kasih') ||
        lowerMessage.includes('terimakasih') ||
        lowerMessage.includes('makasih') ||
        lowerMessage.includes('selesai') ||
        lowerMessage.includes('cukup') ||
        lowerMessage.includes('sampai jumpa') ||
        lowerMessage.includes('bye')
      ) {
        response =
          '😊 Terima kasih! Chat dengan guru selesai. Jika ada pertanyaan lagi, ketik "tanya guru" ya!';

        await pool.query(
          `INSERT INTO chat (siswa_id, pesan, tipe_penerima) 
           VALUES ($1, $2, 'chatbot')`,
          [siswa_id, response]
        );

        return res.json({
          response,
          forwarded_to_guru: false,
          connection_ended: true,
        });
      }

      // Still in guru chat session
      response =
        '📨 Pesan kamu sudah diteruskan ke guru. Mohon tunggu balasan ya!\n\nKetik "selesai" atau "terima kasih" untuk mengakhiri chat.';

      await pool.query(
        `INSERT INTO chat (siswa_id, pesan, tipe_penerima) 
         VALUES ($1, $2, 'chatbot')`,
        [siswa_id, response]
      );

      return res.json({
        response,
        forwarded_to_guru: true,
      });
    }

    if (lowerMessage.includes('jadwal')) {
      const isToday = lowerMessage.includes('hari ini') || lowerMessage.includes('sekarang');

      const today = new Date();
      const hariIni = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][
        today.getDay()
      ];

      console.log(' JADWAL REQUEST');
      console.log(' Kelas ID:', siswa.kelasid);
      console.log(' Hari Ini:', hariIni);
      console.log(' Filter Today?', isToday);

      try {
        let jadwalResult;

        if (isToday) {
          jadwalResult = await pool.query(
            `SELECT jp.hari, p.namapelajaran, g.nama as nama_guru
       FROM jadwalpelajaran jp
       JOIN pelajaran p ON jp.pelajaranid = p.pelajaranid
       JOIN guru g ON jp.guru_id = g.id
       WHERE jp.kelasid = $1 AND jp.hari = $2`,
            [siswa.kelasid, hariIni]
          );
        } else {
          jadwalResult = await pool.query(
            `SELECT jp.hari, p.namapelajaran, g.nama as nama_guru
       FROM jadwalpelajaran jp
       JOIN pelajaran p ON jp.pelajaranid = p.pelajaranid
       JOIN guru g ON jp.guru_id = g.id
       WHERE jp.kelasid = $1
       ORDER BY 
         CASE jp.hari
           WHEN 'Senin' THEN 1
           WHEN 'Selasa' THEN 2
           WHEN 'Rabu' THEN 3
           WHEN 'Kamis' THEN 4
           WHEN 'Jumat' THEN 5
         END`,
            [siswa.kelasid]
          );
        }

        if (jadwalResult.rows.length === 0) {
          response =
            '📅 Jadwal untuk kelas kamu belum tersedia.\n\n💬 Ketik "tanya guru" untuk bertanya langsung!';
        } else {
          response = isToday
            ? `📅 <strong>Jadwal Hari Ini (${hariIni}):</strong>\n\n`
            : '📅 <strong>Jadwal Pelajaran Kamu:</strong>\n\n';

          const grouped = {};
          jadwalResult.rows.forEach((j) => {
            if (!grouped[j.hari]) grouped[j.hari] = [];
            grouped[j.hari].push(j);
          });

          Object.keys(grouped).forEach((hari) => {
            response += `<strong>${hari}:</strong>\n`;
            grouped[hari].forEach((j, idx) => {
              response += `${idx + 1}. ${j.namapelajaran} (${j.nama_guru})\n`;
            });
            response += '\n';
          });

          response += '💡 Ketik "jadwal hari ini" untuk jadwal hari ini saja!';
        }
      } catch (error) {
        console.error('❌ Jadwal Error:', error);
        response =
          '⚠️ Terjadi kesalahan saat mengambil jadwal.\n\n💬 Ketik "tanya guru" untuk bantuan!';
      }
    }
    else if (lowerMessage.includes('nilai') && !lowerMessage.includes('rapor')) {
      response =
        '📊 Untuk melihat nilai kamu, silakan buka menu <strong>"Nilai"</strong> di sidebar.\n\nDi sana kamu bisa lihat:\n✅ Nilai tugas\n✅ Nilai harian\n\n💡 Untuk nilai rapor lengkap (UH, UTS, UAS), buka menu <strong>"Rapor"</strong>.\n\n💬 Ada pertanyaan? Ketik "tanya guru"!';
    }
    else if (lowerMessage.includes('rapor')) {
      response =
        '📋 Untuk melihat rapor lengkap kamu, silakan buka menu <strong>"Rapor"</strong> di sidebar.\n\nDi sana kamu bisa lihat:\n✅ Nilai UH1, UH2, UH3, UH4\n✅ Nilai UTS & UAS\n✅ Rata-rata semester\n✅ Komentar wali kelas\n✅ Status kenaikan kelas\n\n📥 Kamu juga bisa download rapor dalam format PDF!\n\n💬 Ada pertanyaan? Ketik "tanya guru"!';
    }
    else if (lowerMessage.includes('berita')) {
      response =
        '📰 Untuk membaca berita terbaru, silakan buka menu <strong>"Berita & Pengumuman"</strong> di sidebar.\n\nDi sana kamu bisa:\n✅ Baca berita sekolah terbaru\n✅ Lihat foto berita\n✅ Beri komentar & balas komentar\n\n📱 Semua berita sekolah ada di sana!\n\n💬 Ada pertanyaan? Ketik "tanya guru"!';
    }
    else if (lowerMessage.includes('pengumuman') || lowerMessage.includes('info')) {
      response =
        '📢 Untuk melihat pengumuman terbaru, silakan buka menu <strong>"Berita & Pengumuman"</strong> di sidebar.\n\nDi sana kamu bisa:\n✅ Lihat pengumuman penting\n✅ Lihat foto pengumuman\n✅ Info kegiatan sekolah\n\n📱 Semua pengumuman ada di sana!\n\n💬 Ada pertanyaan? Ketik "tanya guru"!';
    }
    else if (
      lowerMessage.includes('tanya guru') ||
      lowerMessage.includes('hubungi guru') ||
      lowerMessage.includes('bicara guru') ||
      lowerMessage.includes('chat guru')
    ) {
      response =
        '👨‍🏫 Pertanyaan kamu sudah diteruskan ke guru. Mohon tunggu balasan ya!\n\n💡 Ketik "selesai" atau "terima kasih" jika chat sudah selesai.';
      shouldForwardToGuru = true;

      // Update message type to 'guru'
      await pool.query(
        `UPDATE chat 
         SET tipe_penerima = 'guru' 
         WHERE siswa_id = $1 
         AND pesan = $2 
         AND tipe_penerima = 'chatbot'
         AND guru_id IS NULL`,
        [siswa_id, message]
      );
    }

    else if (
      lowerMessage.includes('halo') ||
      lowerMessage.includes('hai') ||
      lowerMessage.includes('hi') ||
      lowerMessage.includes('hello')
    ) {
      response = `Halo ${siswa.nama}! 👋 Ada yang bisa saya bantu?\n\n<strong>Coba tanya:</strong>\n📅 "jadwal" - Lihat jadwal pelajaran\n📊 "nilai" - Info tentang nilai\n📋 "rapor" - Lihat rapor\n📰 "berita" - Berita terbaru\n📢 "pengumuman" - Pengumuman sekolah\n👨‍🏫 "tanya guru" - Chat dengan guru`;
    } else if (lowerMessage.includes('bantuan') || lowerMessage.includes('help')) {
      response = `<strong>🤖 Panduan Chatbot SD Hati Kudus</strong>\n\n<strong>Saya bisa membantu:</strong>\n\n📅 <strong>Jadwal Pelajaran</strong>\n   Ketik: "jadwal" atau "jadwal hari ini"\n\n📊 <strong>Nilai</strong>\n   Ketik: "nilai" atau "cek nilai"\n\n📋 <strong>Rapor</strong>\n   Ketik: "rapor" atau "lihat rapor"\n\n📰 <strong>Berita</strong>\n   Ketik: "berita" atau "berita terbaru"\n\n📢 <strong>Pengumuman</strong>\n   Ketik: "pengumuman" atau "info"\n\n👨‍🏫 <strong>Chat dengan Guru</strong>\n   Ketik: "tanya guru" atau "hubungi guru"\n\n💡 Silakan tanya apa saja!`;
    } else {
      response = `Maaf, saya belum mengerti pertanyaan "${message}".\n\n<strong>Saya bisa bantu dengan:</strong>\n📅 Jadwal pelajaran\n📊 Nilai & Rapor\n📰 Berita\n📢 Pengumuman\n\n💬 Ketik "bantuan" untuk panduan lengkap\n👨‍🏫 Ketik "tanya guru" untuk chat dengan guru!`;
    }

    // Save bot response
    await pool.query(
      `INSERT INTO chat (siswa_id, pesan, tipe_penerima) 
       VALUES ($1, $2, 'chatbot')`,
      [siswa_id, response]
    );

    res.json({
      response,
      forwarded_to_guru: shouldForwardToGuru,
    });
  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

router.get('/history/:siswaId', async (req, res) => {
  try {
    const { siswaId } = req.params;

    const result = await pool.query(
      `SELECT c.*, g.nama as nama_guru, s.nama as nama_siswa
       FROM chat c
       LEFT JOIN guru g ON c.guru_id = g.id
       LEFT JOIN siswa_kelas_tinggi s ON c.siswa_id = s.id
       WHERE c.siswa_id = $1
       ORDER BY c.waktu ASC`,
      [siswaId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get chat history error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

router.post('/reply', async (req, res) => {
  try {
    const { siswa_id, guru_id, pesan } = req.body;

    const result = await pool.query(
      `INSERT INTO chat (siswa_id, guru_id, pesan, tipe_penerima) 
       VALUES ($1, $2, $3, 'siswa')
       RETURNING *`,
      [siswa_id, guru_id, pesan]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Reply message error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

router.get('/pending', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (c.siswa_id) 
         c.*, 
         s.nama as nama_siswa, 
         k.nama as kelas
       FROM chat c
       JOIN siswa_kelas_tinggi s ON c.siswa_id = s.id
       LEFT JOIN kelas k ON s.kelasid = k.id
       WHERE c.tipe_penerima = 'guru' 
       AND c.guru_id IS NULL
       ORDER BY c.siswa_id, c.waktu DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get pending messages error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

router.get('/guru/history/:siswaId', async (req, res) => {
  try {
    const { siswaId } = req.params;

    const result = await pool.query(
      `SELECT c.*, g.nama as nama_guru, s.nama as nama_siswa
       FROM chat c
       LEFT JOIN guru g ON c.guru_id = g.id
       LEFT JOIN siswa_kelas_tinggi s ON c.siswa_id = s.id
       WHERE c.siswa_id = $1
       ORDER BY c.waktu ASC`,
      [siswaId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get guru chat history error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

router.delete('/cleanup/:siswaId', async (req, res) => {
  try {
    const { siswaId } = req.params;
    const { tahun_ajaran } = req.body;

    // Delete chat history older than the specified academic year
    await pool.query(
      `DELETE FROM chat 
       WHERE siswa_id = $1 
       AND waktu < (
         SELECT MAX(created_at) 
         FROM rapor 
         WHERE siswa_id = $1 
         AND tahun_ajaran < $2
       )`,
      [siswaId, tahun_ajaran]
    );

    res.json({ message: 'Chat history cleaned up successfully' });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

router.post('/auto-cleanup', async (req, res) => {
  try {
    // Delete chat history older than 1 year
    const result = await pool.query(
      `DELETE FROM chat 
       WHERE waktu < NOW() - INTERVAL '1 year'
       RETURNING id`
    );

    res.json({
      message: 'Auto cleanup completed',
      deleted_count: result.rowCount,
    });
  } catch (error) {
    console.error('Auto cleanup error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

router.post('/cleanup-by-year', async (req, res) => {
  try {
    const { tahun_ajaran_lama } = req.body;

    // Hapus chat yang lebih lama dari tahun ajaran tertentu
    const result = await pool.query(
      `DELETE FROM chat 
       WHERE waktu < (
         SELECT MIN(created_at) 
         FROM rapor 
         WHERE tahun_ajaran = $1
       )
       RETURNING id`,
      [tahun_ajaran_lama]
    );

    res.json({
      message: 'Chat history cleaned up successfully',
      deleted_count: result.rowCount,
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

module.exports = router;
