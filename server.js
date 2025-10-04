// server.js
import cors from "cors";
import "dotenv/config";
import express from "express";
import fs from "fs";
import helmet from "helmet";
import mongoose from "mongoose";
import morgan from "morgan";
import path from "path";

// initialize express app
const app = express();
const port = process.env.PORT || 3000;

// middlewares
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(morgan('env'));

// ensure uploads directory exists
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}


// upload pdf
import multer from "multer";
import { exportNote } from "./controllers/exportController.js";
import followUpContent from "./controllers/followUpController.js";
import generateContent from "./controllers/llmController.js";
import { uploadFile } from './controllers/uploadController.js';

// Configure Multer to store files on disk in ./uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    // unique filename: timestamp-originalname
    const name = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
    cb(null, name);
  }
});

app.use('/uploads', express.static(UPLOAD_DIR));

const upload = multer({ storage: storage });


// POST /api/upload expects form-data with key "pdfFile" and a file
app.post('/api/upload', upload.single('pdfFile'), uploadFile);


//generate contents
app.get('/api/generate', generateContent);
//followup contents
app.post('/api/follow-up', followUpContent);
//export pdf
app.get('/api/export', exportNote);
// connecting to the mongodb
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch((error) => {
    console.log(error);
  });

//save for revision routes
import saveRoute from './routes/save.js';
app.use('/api/save', saveRoute);
//delete from revision routes
import deleteRoute from './routes/delete.js';
app.use('/api/delete', deleteRoute);
//fetch from revision routes
import fetchRoute from './routes/fetch.js';
app.use('/api/fetch', fetchRoute);
//load single content from revision routes
import loadRoute from './routes/load.js';
app.use('/api/load', loadRoute);
// optional graceful shutdown: call terminateOcr() from your uploadController if implemented
process.on('SIGINT', () => {
  console.log('Shutting down...');
  process.exit(0);
});
