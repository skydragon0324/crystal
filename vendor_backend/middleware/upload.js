const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getLangText } = require('../lang/lang');

// Define storage configuration for multer
const storage = (uploadType) => multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = `uploads/${uploadType}`; // Use the dynamic upload type

    // Ensure the directory exists, otherwise create it
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir); // Use the dynamic directory
  },
  filename: function (req, file, cb) {
    // Set the file name with a timestamp to prevent overwriting
    if (["temp", "patches"].includes(uploadType)) {
      cb(null, path.basename(file.originalname));
    } else {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname)); // Keep the file extension
    }
  }
});

// Only allow specific image and document types (jpg, jpeg, png, pdf, zip)
const fileFilter = (req, file, cb) => {
  allowedTypes = /jpg|jpeg|png|webp|pdf|zip|rar|doc|docx|csv|xls|xlsx|txt|octet-stream/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error(getLangText("FILE_FORMAT_ERROR")), false);
  }
};

// Create upload middleware that accepts uploadType
const upload = (uploadType) => multer({
  storage: storage(uploadType), // Pass uploadType to storage
  fileFilter: fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB file size limit
});

const unlink = (url) => {
  // Check if the file exists before attempting to delete it
  fs.stat(url, (err, stats) => {
    if (err) {
      console.error(err.message);
    }

    // Proceed to delete the file
    fs.unlink(url, (err) => {
      if (err) {
        console.error(err);
      }
    });
  });
}

module.exports = {
  upload,
  unlink,
};
