const express = require("express");
const multer = require("multer");
const fs = require("fs-extra");
const path = require("path");
const cors = require("cors");
const archiver = require("archiver");
const sharp = require("sharp");

const app = express();
const PORT = 3000;
const BACKUP_PIN = "020608";

app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use("/produk", express.static(path.join(__dirname, "produk")));

const BASE_PATH = path.join(__dirname, "produk");
const MENTAH_PATH = path.join(BASE_PATH, "mentah");
const TEXT_PATH = path.join(BASE_PATH, "text");
const PRODUK_UP_PATH = path.join(BASE_PATH, "produk up");
const ACTIVITY_LOG = path.join(BASE_PATH, ".activity.txt");

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(__dirname, "temp");
    fs.ensureDirSync(tempDir);
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// Init
async function initFolders() {
  const dirs = [
    path.join(MENTAH_PATH, "panjang"),
    path.join(MENTAH_PATH, "pendek"),
    path.join(TEXT_PATH, "prompt"),
    path.join(TEXT_PATH, "template text"),
    PRODUK_UP_PATH,
  ];
  for (const dir of dirs) await fs.ensureDir(dir);
  if (!(await fs.pathExists(ACTIVITY_LOG)))
    await fs.writeFile(ACTIVITY_LOG, "", "utf-8");
}

async function logActivity(message) {
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const logLine = `[${timestamp}] ${message}\n`;
  await fs.appendFile(ACTIVITY_LOG, logLine, "utf-8");
}

// ==================== THUMBNAIL ====================
app.get("/api/thumbnail", async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: "Path required" });

    const fullPath = path.join(__dirname, filePath);
    if (!(await fs.pathExists(fullPath)))
      return res.status(404).json({ error: "File not found" });

    const ext = path.extname(fullPath).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) {
      return res.sendFile(fullPath);
    }

    const cacheDir = path.join(__dirname, "temp", "thumbnails");
    await fs.ensureDir(cacheDir);
    const cacheKey = filePath.replace(/[^a-zA-Z0-9]/g, "_") + "_thumb.jpg";
    const cachePath = path.join(cacheDir, cacheKey);

    if (await fs.pathExists(cachePath)) {
      const stat = await fs.stat(cachePath);
      if (Date.now() - stat.mtimeMs < 7 * 24 * 60 * 60 * 1000) {
        return res.sendFile(cachePath);
      }
    }

    await sharp(fullPath)
      .resize(300, 300, { fit: "cover" })
      .jpeg({ quality: 70 })
      .toFile(cachePath);
    res.sendFile(cachePath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== PROMPT ====================
app.get("/api/prompts", async (req, res) => {
  try {
    const files = await fs.readdir(path.join(TEXT_PATH, "prompt"));
    const search = req.query.search || "";
    res.json(
      files.filter(
        (f) =>
          f.endsWith(".txt") && f.toLowerCase().includes(search.toLowerCase()),
      ),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/prompts/:filename", async (req, res) => {
  try {
    const content = await fs.readFile(
      path.join(TEXT_PATH, "prompt", req.params.filename),
      "utf-8",
    );
    res.json({ filename: req.params.filename, content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/prompts", async (req, res) => {
  try {
    const sanitized = req.body.filename.replace(/[^a-zA-Z0-9\s-_]/g, "").trim();
    if (!sanitized) return res.status(400).json({ error: "Invalid filename" });
    await fs.writeFile(
      path.join(TEXT_PATH, "prompt", sanitized + ".txt"),
      req.body.content,
      "utf-8",
    );
    await logActivity(`Prompt created: ${sanitized}.txt`);
    res.json({ success: true, filename: sanitized + ".txt" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/prompts/:filename", async (req, res) => {
  try {
    await fs.writeFile(
      path.join(TEXT_PATH, "prompt", req.params.filename),
      req.body.content,
      "utf-8",
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/prompts/:filename", async (req, res) => {
  try {
    await fs.remove(path.join(TEXT_PATH, "prompt", req.params.filename));
    await logActivity(`Prompt deleted: ${req.params.filename}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/prompts-rename/:filename", async (req, res) => {
  try {
    const oldPath = path.join(TEXT_PATH, "prompt", req.params.filename);
    const newName =
      req.body.newName.replace(/[^a-zA-Z0-9\s-_]/g, "").trim() + ".txt";
    await fs.move(oldPath, path.join(TEXT_PATH, "prompt", newName));
    res.json({ success: true, newName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== TEMPLATE TEXT ====================
app.get("/api/templates", async (req, res) => {
  try {
    const files = await fs.readdir(path.join(TEXT_PATH, "template text"));
    const search = req.query.search || "";
    res.json(
      files.filter(
        (f) =>
          f.endsWith(".txt") && f.toLowerCase().includes(search.toLowerCase()),
      ),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/templates/:filename", async (req, res) => {
  try {
    const content = await fs.readFile(
      path.join(TEXT_PATH, "template text", req.params.filename),
      "utf-8",
    );
    res.json({ filename: req.params.filename, content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/templates", async (req, res) => {
  try {
    const sanitized = req.body.filename.replace(/[^a-zA-Z0-9\s-_]/g, "").trim();
    if (!sanitized) return res.status(400).json({ error: "Invalid filename" });
    await fs.writeFile(
      path.join(TEXT_PATH, "template text", sanitized + ".txt"),
      req.body.content,
      "utf-8",
    );
    await logActivity(`Template created: ${sanitized}.txt`);
    res.json({ success: true, filename: sanitized + ".txt" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/templates/:filename", async (req, res) => {
  try {
    await fs.writeFile(
      path.join(TEXT_PATH, "template text", req.params.filename),
      req.body.content,
      "utf-8",
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/templates/:filename", async (req, res) => {
  try {
    await fs.remove(path.join(TEXT_PATH, "template text", req.params.filename));
    await logActivity(`Template deleted: ${req.params.filename}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/templates-rename/:filename", async (req, res) => {
  try {
    const oldPath = path.join(TEXT_PATH, "template text", req.params.filename);
    const newName =
      req.body.newName.replace(/[^a-zA-Z0-9\s-_]/g, "").trim() + ".txt";
    await fs.move(oldPath, path.join(TEXT_PATH, "template text", newName));
    res.json({ success: true, newName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== MENTAH ====================
app.get("/api/mentah/folders", async (req, res) => {
  try {
    const items = await fs.readdir(MENTAH_PATH);
    const folders = [];
    for (const item of items) {
      if ((await fs.stat(path.join(MENTAH_PATH, item))).isDirectory())
        folders.push(item);
    }
    res.json(folders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/mentah/folders", async (req, res) => {
  try {
    const sanitized = req.body.folderName
      .replace(/[^a-zA-Z0-9\s-_]/g, "")
      .trim();
    if (!sanitized)
      return res.status(400).json({ error: "Invalid folder name" });
    await fs.ensureDir(path.join(MENTAH_PATH, sanitized));
    await logActivity(`Folder created: mentah/${sanitized}`);
    res.json({ success: true, folder: sanitized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/mentah/folders/:folder", async (req, res) => {
  try {
    const folderName = decodeURIComponent(req.params.folder);
    if (["panjang", "pendek"].includes(folderName)) {
      return res
        .status(400)
        .json({ error: "Folder default tidak bisa dihapus" });
    }
    await fs.remove(path.join(MENTAH_PATH, folderName));
    await logActivity(`Folder deleted: mentah/${folderName}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/mentah/folders-rename/:folder", async (req, res) => {
  try {
    if (["panjang", "pendek"].includes(req.params.folder)) {
      return res
        .status(400)
        .json({ error: "Folder default tidak bisa direname" });
    }
    const oldPath = path.join(MENTAH_PATH, req.params.folder);
    const newName = req.body.newName.replace(/[^a-zA-Z0-9\s-_]/g, "").trim();
    await fs.move(oldPath, path.join(MENTAH_PATH, newName));
    res.json({ success: true, newName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/mentah/files/:folder", async (req, res) => {
  try {
    const folderPath = path.join(MENTAH_PATH, req.params.folder);
    if (!(await fs.pathExists(folderPath))) return res.json([]);
    const files = await fs.readdir(folderPath);
    const fileList = [];
    for (const f of files) {
      const stat = await fs.stat(path.join(folderPath, f));
      if (stat.isFile())
        fileList.push({
          name: f,
          size: stat.size,
          ext: path.extname(f).toLowerCase(),
        });
    }
    res.json(fileList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(
  "/api/mentah/upload/:folder",
  upload.single("file"),
  async (req, res) => {
    try {
      const folderPath = path.join(MENTAH_PATH, req.params.folder);
      await fs.ensureDir(folderPath);
      await fs.move(
        req.file.path,
        path.join(folderPath, req.file.originalname),
        { overwrite: true },
      );
      await logActivity(
        `File uploaded: mentah/${req.params.folder}/${req.file.originalname}`,
      );
      res.json({ success: true, filename: req.file.originalname });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

app.delete("/api/mentah/files/:folder/:filename", async (req, res) => {
  try {
    await fs.remove(
      path.join(MENTAH_PATH, req.params.folder, req.params.filename),
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/mentah/files-rename/:folder/:filename", async (req, res) => {
  try {
    const oldPath = path.join(
      MENTAH_PATH,
      req.params.folder,
      req.params.filename,
    );
    const newPath = path.join(MENTAH_PATH, req.params.folder, req.body.newName);
    await fs.move(oldPath, newPath);
    res.json({ success: true, newName: req.body.newName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== KATEGORI ====================
app.get("/api/kategori", async (req, res) => {
  try {
    await fs.ensureDir(PRODUK_UP_PATH);
    const items = await fs.readdir(PRODUK_UP_PATH);
    const kategori = [];
    for (const item of items) {
      if ((await fs.stat(path.join(PRODUK_UP_PATH, item))).isDirectory())
        kategori.push(item);
    }
    res.json(kategori);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/kategori", async (req, res) => {
  try {
    const sanitized = req.body.nama.replace(/[^a-zA-Z0-9\s-_]/g, "").trim();
    if (!sanitized) return res.status(400).json({ error: "Invalid name" });
    await fs.ensureDir(path.join(PRODUK_UP_PATH, sanitized));
    await logActivity(`Category created: ${sanitized}`);
    res.json({ success: true, kategori: sanitized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/kategori-rename/:nama", async (req, res) => {
  try {
    const oldPath = path.join(PRODUK_UP_PATH, req.params.nama);
    const newName = req.body.newName.replace(/[^a-zA-Z0-9\s-_]/g, "").trim();
    const newPath = path.join(PRODUK_UP_PATH, newName);
    await fs.move(oldPath, newPath);
    await logActivity(`Category renamed: ${req.params.nama} -> ${newName}`);
    res.json({ success: true, newName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/kategori/:nama", async (req, res) => {
  try {
    const katPath = path.join(PRODUK_UP_PATH, req.params.nama);
    if (!(await fs.pathExists(katPath)))
      return res.status(404).json({ error: "Not found" });
    const files = await fs.readdir(katPath);
    if (files.length > 0)
      return res.status(400).json({ error: "Kategori masih berisi produk" });
    await fs.remove(katPath);
    await logActivity(`Category deleted: ${req.params.nama}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== PRODUK ====================
app.get("/api/produk/:kategori", async (req, res) => {
  try {
    const katPath = path.join(PRODUK_UP_PATH, req.params.kategori);
    if (!(await fs.pathExists(katPath))) return res.json([]);

    const items = await fs.readdir(katPath);
    const produkList = [];

    for (const item of items) {
      const itemPath = path.join(katPath, item);
      const stat = await fs.stat(itemPath);
      if (!stat.isDirectory()) continue;

      let metadata = {};
      try {
        if (await fs.pathExists(path.join(itemPath, "data.json")))
          metadata = await fs.readJson(path.join(itemPath, "data.json"));
      } catch (e) {}

      const fotoFolder = path.join(itemPath, "foto");
      const designFolder = path.join(itemPath, "design");

      let fotos = [],
        designs = [],
        fotoOrder = metadata.fotoOrder || [];

      if (await fs.pathExists(fotoFolder)) {
        let allFotos = (await fs.readdir(fotoFolder)).filter(
          (f) => !f.startsWith("."),
        );
        if (fotoOrder.length > 0) {
          fotos = fotoOrder.filter((f) => allFotos.includes(f));
          fotos = [...fotos, ...allFotos.filter((f) => !fotoOrder.includes(f))];
        } else {
          fotos = allFotos;
        }
      }
      if (await fs.pathExists(designFolder))
        designs = (await fs.readdir(designFolder)).filter(
          (f) => !f.startsWith("."),
        );

      produkList.push({
        nama: item,
        judul: metadata.judul || item,
        fotos,
        designs,
        fotoOrder,
      });
    }

    const search = req.query.search || "";
    const filtered = produkList.filter((p) =>
      p.judul.toLowerCase().includes(search.toLowerCase()),
    );

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const end = start + limit;

    res.json({ products: filtered.slice(start, end), total, page, totalPages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(
  "/api/produk",
  upload.fields([
    { name: "fotos", maxCount: 15 },
    { name: "designs", maxCount: 5 },
  ]),
  async (req, res) => {
    try {
      const { kategori, judul } = req.body;
      const sanitizedKat = kategori.replace(/[^a-zA-Z0-9\s-_]/g, "").trim();
      const sanitizedJudul = judul.replace(/[^a-zA-Z0-9\s-_]/g, "").trim();

      if (!sanitizedKat || !sanitizedJudul)
        return res
          .status(400)
          .json({ error: "Kategori dan judul wajib diisi" });

      const produkPath = path.join(
        PRODUK_UP_PATH,
        sanitizedKat,
        sanitizedJudul,
      );
      const fotoPath = path.join(produkPath, "foto");
      const designPath = path.join(produkPath, "design");

      await fs.ensureDir(fotoPath);
      await fs.ensureDir(designPath);

      const fotoOrder = [];
      if (req.files?.fotos) {
        for (const file of req.files.fotos) {
          await fs.move(file.path, path.join(fotoPath, file.originalname), {
            overwrite: true,
          });
          fotoOrder.push(file.originalname);
        }
      }
      if (req.files?.designs) {
        for (const file of req.files.designs) {
          await fs.move(file.path, path.join(designPath, file.originalname), {
            overwrite: true,
          });
        }
      }

      await fs.writeJson(
        path.join(produkPath, "data.json"),
        { judul: sanitizedJudul, fotoOrder, created: new Date().toISOString() },
        { spaces: 2 },
      );
      await logActivity(`Product created: ${sanitizedKat}/${sanitizedJudul}`);
      res.json({
        success: true,
        message: `Produk "${sanitizedJudul}" berhasil dibuat!`,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

app.put("/api/produk/:kategori/:produk", async (req, res) => {
  try {
    const produkPath = path.join(
      PRODUK_UP_PATH,
      req.params.kategori,
      req.params.produk,
    );
    const dataPath = path.join(produkPath, "data.json");
    let metadata = {};
    if (await fs.pathExists(dataPath)) metadata = await fs.readJson(dataPath);
    metadata.judul = req.body.judul || metadata.judul;
    await fs.writeJson(dataPath, metadata, { spaces: 2 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/produk/:kategori/:produk/reorder-foto", async (req, res) => {
  try {
    const dataPath = path.join(
      PRODUK_UP_PATH,
      req.params.kategori,
      req.params.produk,
      "data.json",
    );
    let metadata = {};
    if (await fs.pathExists(dataPath)) metadata = await fs.readJson(dataPath);
    metadata.fotoOrder = req.body.fotoOrder;
    await fs.writeJson(dataPath, metadata, { spaces: 2 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/produk/:kategori/:produk", async (req, res) => {
  try {
    await fs.remove(
      path.join(PRODUK_UP_PATH, req.params.kategori, req.params.produk),
    );
    await logActivity(
      `Product deleted: ${req.params.kategori}/${req.params.produk}`,
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(
  "/api/produk/:kategori/:produk/:type/:filename",
  async (req, res) => {
    try {
      const { kategori, produk, type, filename } = req.params;
      await fs.remove(
        path.join(PRODUK_UP_PATH, kategori, produk, type, filename),
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

app.post(
  "/api/produk/:kategori/:produk/upload/:type",
  upload.single("file"),
  async (req, res) => {
    try {
      const { kategori, produk, type } = req.params;
      const targetPath = path.join(PRODUK_UP_PATH, kategori, produk, type);
      await fs.ensureDir(targetPath);

      // Check limit
      const existingFiles = await fs.readdir(targetPath);
      const limit = type === "foto" ? 15 : 5;
      if (existingFiles.length >= limit)
        return res
          .status(400)
          .json({ error: `Maksimal ${limit} file ${type}` });

      await fs.move(
        req.file.path,
        path.join(targetPath, req.file.originalname),
        { overwrite: true },
      );
      await logActivity(
        `File added to product: ${kategori}/${produk}/${type}/${req.file.originalname}`,
      );
      res.json({ success: true, filename: req.file.originalname });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ==================== BACKUP ====================
app.post("/api/backup", async (req, res) => {
  const { pin } = req.body;
  if (pin !== BACKUP_PIN) return res.status(401).json({ error: "PIN salah!" });

  try {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const zipFileName = `backup-produk-${timestamp}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${zipFileName}"`,
    );

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      res.status(500).end();
    });
    archive.pipe(res);
    archive.directory(BASE_PATH, "produk");
    archive.finalize();

    await logActivity(`Backup created: ${zipFileName}`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== OPEN FOLDER ====================
app.get("/api/open-folder", (req, res) => {
  const folderPath = req.query.path;
  if (!folderPath) return res.status(400).json({ error: "Path required" });
  const fullPath = path.join(__dirname, folderPath);
  require("child_process").exec(`explorer "${fullPath}"`);
  res.json({ success: true });
});

// ==================== ACTIVITY LOG ====================
app.get("/api/activity", async (req, res) => {
  try {
    const content = await fs.readFile(ACTIVITY_LOG, "utf-8");
    const lines = content
      .trim()
      .split("\n")
      .filter((l) => l)
      .reverse()
      .slice(0, 50);
    res.json({ activities: lines });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== GENERATOR ====================
app.get("/api/generator-templates", async (req, res) => {
  res.json([
    {
      id: "kaos-pendek",
      name: "Template Kaos Lengan Pendek",
      template:
        "ZYNHOPE Kaos T-Shirt Lengan Pendek [TULIS TEMA GAMBAR DI SINI] Baju Atasan Pria Wanita Unisex Oversize Oversized Jumbo Big Size Distro Premium M L XL XXL 3XL 4XL 5XL 6XL 7XL",
      placeholders: ["TULIS TEMA GAMBAR DI SINI"],
    },
    {
      id: "kaos-panjang",
      name: "Template Kaos Lengan Panjang",
      template:
        "ZYNHOPE Kaos Lengan Panjang Long Sleeve [TULIS TEMA GAMBAR DI SINI] Baju Atasan Pria Wanita Unisex Oversize Oversized Jumbo Big Size Distro Premium M L XL XXL 3XL 4XL 5XL 6XL 7XL",
      placeholders: ["TULIS TEMA GAMBAR DI SINI"],
    },
    {
      id: "prompt-typography",
      name: "Prompt Typography AI",
      template:
        'Recreate the uploaded typography artwork into a brand-new custom lettering logo...\n\nMain Text:\n"[YOUR MAIN TEXT]"\n\nTagline:\n"[YOUR TAGLINE]"',
      placeholders: ["YOUR MAIN TEXT", "YOUR TAGLINE"],
    },
    {
      id: "deskripsi",
      name: "Deskripsi Produk",
      template:
        "ZYNHOPE — Zero Yearning Hope\nDi ZYNHOPE, kami hadir dengan filosofi Zero Yearning Hope...\nKoleksi Kaos [TULIS TEMA GAMBAR DI SINI] hadir sebagai esensi utama gaya harianmu...",
      placeholders: ["TULIS TEMA GAMBAR DI SINI"],
    },
  ]);
});

// ==================== ANALYTICS ====================
app.get("/api/analytics", async (req, res) => {
  try {
    let produkCount = 0;
    const categories = await fs.readdir(PRODUK_UP_PATH);
    for (const cat of categories) {
      const catPath = path.join(PRODUK_UP_PATH, cat);
      if ((await fs.stat(catPath)).isDirectory()) {
        produkCount += (await fs.readdir(catPath)).filter((p) =>
          fs.statSync(path.join(catPath, p)).isDirectory(),
        ).length;
      }
    }
    const activityContent = await fs.readFile(ACTIVITY_LOG, "utf-8");
    const activityLines = activityContent
      .trim()
      .split("\n")
      .filter((l) => l).length;

    res.json({
      totalProducts: produkCount,
      totalCategories: categories.length,
      totalActivities: activityLines,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start
async function start() {
  await initFolders();
  app.listen(PORT, () =>
    console.log(
      `\n🚀 Server: http://localhost:${PORT}\n🔐 Backup PIN: ${BACKUP_PIN}\n`,
    ),
  );
}
start().catch(console.error);
