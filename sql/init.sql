-- Drop tables
DROP TABLE IF EXISTS nilai CASCADE;
DROP TABLE IF EXISTS rapor CASCADE;
DROP TABLE IF EXISTS jadwalpelajaran CASCADE;
DROP TABLE IF EXISTS acara_sekolah CASCADE;
DROP TABLE IF EXISTS foto_acara_sekolah CASCADE;
DROP TABLE IF EXISTS pengumuman CASCADE;
DROP TABLE IF EXISTS berita CASCADE;
DROP TABLE IF EXISTS foto_berita CASCADE;
DROP TABLE IF EXISTS siswa_kelas_rendah CASCADE;
DROP TABLE IF EXISTS siswa_kelas_tinggi CASCADE;
DROP TABLE IF EXISTS guru CASCADE;
DROP TABLE IF EXISTS pelajaran CASCADE;
DROP TABLE IF EXISTS kelas CASCADE;
DROP TABLE IF EXISTS admin CASCADE;
DROP TABLE IF EXISTS komentar_berita CASCADE;
DROP TABLE IF EXISTS tahun_ajaran CASCADE;
DROP TABLE IF EXISTS chat CASCADE;
DROP TABLE IF EXISTS sumber_berita CASCADE;

CREATE TABLE admin (
  id SERIAL PRIMARY KEY,
  nama VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE guru (
  id SERIAL PRIMARY KEY,
  nama VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  spesialisasi VARCHAR(100)
);

CREATE TABLE kelas (
  id SERIAL PRIMARY KEY,
  guru_id INT REFERENCES guru(id) ON DELETE SET NULL,
  nama VARCHAR(100) NOT NULL
);

CREATE TABLE tahun_ajaran (
  id SERIAL PRIMARY KEY,
  tahun_mulai INT NOT NULL,
  tahun_akhir INT NOT NULL,
  is_Active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE siswa_kelas_tinggi (
  id SERIAL PRIMARY KEY,
  kelasid INT REFERENCES kelas(id) ON DELETE CASCADE,
  nama VARCHAR(100) NOT NULL,
  nis VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100),
  password VARCHAR(255),
  jenis_kelamin VARCHAR(10),
  role VARCHAR(20) DEFAULT 'siswa',
  account_type VARCHAR(20) DEFAULT 'individual',
  tahun_ajaran_id INT REFERENCES tahun_ajaran(id) ON DELETE CASCADE
);

CREATE TABLE siswa_kelas_rendah (
  id SERIAL PRIMARY KEY,
  tahun_ajaran_id INT REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
  kelas VARCHAR(50),
  username VARCHAR(100),
  password VARCHAR(255),
  wali_kelas VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rapor (
  id SERIAL PRIMARY KEY,
  siswa_id INT REFERENCES siswa_kelas_tinggi(id) ON DELETE CASCADE,
  semester VARCHAR(20) NOT NULL,
  tahun_ajaran_id INT REFERENCES tahun_ajaran(id),
  komentar TEXT
);

CREATE TABLE pelajaran (
  pelajaranid SERIAL PRIMARY KEY,
  namapelajaran VARCHAR(100) NOT NULL,
  deskripsi TEXT
);

CREATE TABLE jadwalpelajaran (
  jadwalid SERIAL PRIMARY KEY,
  kelasid INT REFERENCES kelas(id) ON DELETE CASCADE,
  pelajaranid INT REFERENCES pelajaran(pelajaranid) ON DELETE CASCADE,
  guru_id INT REFERENCES guru(id) ON DELETE CASCADE,
  tanggal TIMESTAMP,
  waktu INT,
  hari VARCHAR(20)
);

CREATE TABLE nilai (
  id SERIAL PRIMARY KEY,
  rapor_id INT REFERENCES rapor(id) ON DELETE CASCADE,
  siswa_id INT REFERENCES siswa_kelas_tinggi(id) ON DELETE CASCADE,
  jadwal_id INT REFERENCES jadwalpelajaran(jadwalid) ON DELETE SET NULL,
  nilai NUMERIC(5,2),
  keterangan TEXT,
  nama_mata_pelajaran VARCHAR(100)
);

CREATE TABLE acara_sekolah (
  acaraid SERIAL PRIMARY KEY,
  judul VARCHAR(100),
  deskripsi TEXT,
  tanggal DATE
);

CREATE TABLE foto_acara_sekolah (
  fotoacaraid SERIAL PRIMARY KEY,
  acaraid INT REFERENCES acara_sekolah(acaraid) ON DELETE CASCADE,
  urlfoto TEXT,
  deskripsi TEXT
);

CREATE TABLE berita (
  id SERIAL PRIMARY KEY,
  judul VARCHAR(200),
  konten TEXT,
  tanggal DATE,
);

CREATE TABLE foto_berita (
  fotoberitaid SERIAL PRIMARY KEY,
  beritaid INT REFERENCES berita(id) ON DELETE CASCADE,
  urlfoto TEXT,
  deskripsi TEXT
);

CREATE TABLE sumber_berita (
  sumberid SERIAL PRIMARY KEY,
  beritaid INT REFERENCES berita(id) ON DELETE CASCADE,
  namasumber VARCHAR(100),
  url TEXT
);

CREATE TABLE komentar_berita (
  id SERIAL PRIMARY KEY,
  siswa_id INT REFERENCES siswa_kelas_tinggi(id) ON DELETE CASCADE,
  berita_id INT REFERENCES berita(id) ON DELETE CASCADE,
  komentar TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pengumuman (
  id SERIAL PRIMARY KEY,
  judul VARCHAR(150),
  pesan TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- CHAT (dengan penerima bisa chatbot atau guru)
CREATE TABLE chat (
  id SERIAL PRIMARY KEY,
  siswa_id INT REFERENCES siswa_kelas_tinggi(id) ON DELETE CASCADE,
  guru_id INT REFERENCES guru(id) ON DELETE SET NULL,
  pesan TEXT NOT NULL,
  waktu TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tipe_penerima VARCHAR(20) DEFAULT 'chatbot', 
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);