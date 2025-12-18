const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads');
const galleryDir = path.join(__dirname, '..', 'uploads', 'gallery');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(galleryDir)) {
  fs.mkdirSync(galleryDir, { recursive: true });
}

// Helper to delete old files
function deleteOldFile(oldPath) {
  if (oldPath && fs.existsSync(oldPath)) {
    try {
      fs.unlinkSync(oldPath);
      console.log('Deleted old file:', oldPath);
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  }
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const isGallery = req.baseUrl && req.baseUrl.includes('gallery');
    cb(null, isGallery ? galleryDir : uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  cb(mimetype && extname ? null : new Error('Hanya file gambar!'), mimetype && extname);
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter,
});

module.exports = upload;
module.exports.deleteOldFile = deleteOldFile;
