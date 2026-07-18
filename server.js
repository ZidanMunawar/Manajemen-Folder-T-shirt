const express = require("express");
const multer = require("multer");
const fs = require("fs-extra");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use("/produk", express.static(path.join(__dirname, "produk")));

const BASE_PATH = path.join(__dirname, "produk");
const MENTAH_PATH = path.join(BASE_PATH, "mentah");
const TEXT_PATH = path.join(BASE_PATH, "text");
const PRODUK_UP_PATH = path.join(BASE_PATH, "produk up");

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

// Init folders
async function initFolders() {
  const dirs = [
    path.join(MENTAH_PATH, "panjang"),
    path.join(MENTAH_PATH, "pendek"),
    path.join(TEXT_PATH, "prompt"),
    path.join(TEXT_PATH, "template text"),
    PRODUK_UP_PATH,
  ];
  for (const dir of dirs) {
    await fs.ensureDir(dir);
  }
}

// ==================== PROMPT ====================
app.get("/api/prompts", async (req, res) => {
  try {
    const files = await fs.readdir(path.join(TEXT_PATH, "prompt"));
    const search = req.query.search || "";
    const txtFiles = files.filter(
      (f) =>
        f.endsWith(".txt") && f.toLowerCase().includes(search.toLowerCase()),
    );
    res.json(txtFiles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/prompts/:filename", async (req, res) => {
  try {
    const filePath = path.join(TEXT_PATH, "prompt", req.params.filename);
    const content = await fs.readFile(filePath, "utf-8");
    res.json({ filename: req.params.filename, content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/prompts", async (req, res) => {
  try {
    const { filename, content } = req.body;
    const sanitized = filename.replace(/[^a-zA-Z0-9\s-_]/g, "").trim();
    if (!sanitized)
      return res.status(400).json({ error: "Nama file tidak valid" });
    await fs.writeFile(
      path.join(TEXT_PATH, "prompt", sanitized + ".txt"),
      content,
      "utf-8",
    );
    res.json({ success: true, filename: sanitized + ".txt" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/prompts/:filename", async (req, res) => {
  try {
    const { content } = req.body;
    await fs.writeFile(
      path.join(TEXT_PATH, "prompt", req.params.filename),
      content,
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
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== TEMPLATE TEXT ====================
app.get("/api/templates", async (req, res) => {
  try {
    const files = await fs.readdir(path.join(TEXT_PATH, "template text"));
    const search = req.query.search || "";
    const txtFiles = files.filter(
      (f) =>
        f.endsWith(".txt") && f.toLowerCase().includes(search.toLowerCase()),
    );
    res.json(txtFiles);
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
    const { filename, content } = req.body;
    const sanitized = filename.replace(/[^a-zA-Z0-9\s-_]/g, "").trim();
    if (!sanitized)
      return res.status(400).json({ error: "Nama file tidak valid" });
    await fs.writeFile(
      path.join(TEXT_PATH, "template text", sanitized + ".txt"),
      content,
      "utf-8",
    );
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
    res.json({ success: true });
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
      return res.status(400).json({ error: "Nama folder tidak valid" });
    await fs.ensureDir(path.join(MENTAH_PATH, sanitized));
    res.json({ success: true, folder: sanitized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/mentah/folders/:folder", async (req, res) => {
  try {
    const folderPath = path.join(MENTAH_PATH, req.params.folder);
    if (["panjang", "pendek"].includes(req.params.folder)) {
      return res
        .status(400)
        .json({ error: "Folder default tidak bisa dihapus" });
    }
    await fs.remove(folderPath);
    res.json({ success: true });
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
      if (stat.isFile()) {
        fileList.push({
          name: f,
          size: stat.size,
          modified: stat.mtime,
          ext: path.extname(f).toLowerCase(),
        });
      }
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

// ==================== PRODUK UP ====================
app.get("/api/kategori", async (req, res) => {
  try {
    await fs.ensureDir(PRODUK_UP_PATH);
    const items = await fs.readdir(PRODUK_UP_PATH);
    const kategori = [];
    for (const item of items) {
      if ((await fs.stat(path.join(PRODUK_UP_PATH, item))).isDirectory())
        kategori.push(item);
    }
    const search = req.query.search || "";
    res.json(
      kategori.filter((k) => k.toLowerCase().includes(search.toLowerCase())),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/kategori", async (req, res) => {
  try {
    const sanitized = req.body.nama.replace(/[^a-zA-Z0-9\s-_]/g, "").trim();
    if (!sanitized) return res.status(400).json({ error: "Nama tidak valid" });
    await fs.ensureDir(path.join(PRODUK_UP_PATH, sanitized));
    res.json({ success: true, kategori: sanitized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/kategori/:nama", async (req, res) => {
  try {
    const katPath = path.join(PRODUK_UP_PATH, req.params.nama);
    if (!(await fs.pathExists(katPath)))
      return res.status(404).json({ error: "Kategori tidak ditemukan" });
    const files = await fs.readdir(katPath);
    if (files.length > 0)
      return res
        .status(400)
        .json({
          error:
            "Kategori masih berisi produk. Hapus semua produk terlebih dahulu.",
        });
    await fs.remove(katPath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
        const jsonPath = path.join(itemPath, "data.json");
        if (await fs.pathExists(jsonPath))
          metadata = await fs.readJson(jsonPath);
      } catch (e) {}

      const fotoFolder = path.join(itemPath, "foto");
      const designFolder = path.join(itemPath, "design");

      let fotos = [];
      let designs = [];

      if (await fs.pathExists(fotoFolder)) {
        fotos = (await fs.readdir(fotoFolder)).filter(
          (f) => !f.startsWith("."),
        );
      }
      if (await fs.pathExists(designFolder)) {
        designs = (await fs.readdir(designFolder)).filter(
          (f) => !f.startsWith("."),
        );
      }

      produkList.push({
        nama: item,
        judul: metadata.judul || item,
        fotos,
        designs,
        created: metadata.created || stat.birthtime,
      });
    }

    const search = req.query.search || "";
    res.json(
      produkList.filter((p) =>
        p.judul.toLowerCase().includes(search.toLowerCase()),
      ),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(
  "/api/produk",
  upload.fields([
    { name: "fotos", maxCount: 10 },
    { name: "designs", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      const { kategori, judul } = req.body;
      const sanitizedKat = kategori.replace(/[^a-zA-Z0-9\s-_]/g, "").trim();
      const sanitizedJudul = judul.replace(/[^a-zA-Z0-9\s-_]/g, "").trim();

      if (!sanitizedKat || !sanitizedJudul) {
        return res
          .status(400)
          .json({ error: "Kategori dan judul wajib diisi" });
      }

      const produkPath = path.join(
        PRODUK_UP_PATH,
        sanitizedKat,
        sanitizedJudul,
      );
      const fotoPath = path.join(produkPath, "foto");
      const designPath = path.join(produkPath, "design");

      await fs.ensureDir(fotoPath);
      await fs.ensureDir(designPath);

      if (req.files?.fotos) {
        for (const file of req.files.fotos) {
          await fs.move(file.path, path.join(fotoPath, file.originalname), {
            overwrite: true,
          });
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
        {
          judul: sanitizedJudul,
          created: new Date().toISOString(),
        },
        { spaces: 2 },
      );

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
    if (!(await fs.pathExists(produkPath)))
      return res.status(404).json({ error: "Produk tidak ditemukan" });

    const dataPath = path.join(produkPath, "data.json");
    let metadata = {};
    if (await fs.pathExists(dataPath)) metadata = await fs.readJson(dataPath);

    metadata.judul = req.body.judul || metadata.judul;
    metadata.updated = new Date().toISOString();

    await fs.writeJson(dataPath, metadata, { spaces: 2 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/produk/:kategori/:produk", async (req, res) => {
  try {
    const produkPath = path.join(
      PRODUK_UP_PATH,
      req.params.kategori,
      req.params.produk,
    );
    await fs.remove(produkPath);
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
      if (!["foto", "design"].includes(type))
        return res.status(400).json({ error: "Type invalid" });

      const filePath = path.join(
        PRODUK_UP_PATH,
        kategori,
        produk,
        type,
        filename,
      );
      await fs.remove(filePath);
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
      if (!["foto", "design"].includes(type))
        return res.status(400).json({ error: "Type invalid" });

      const targetPath = path.join(PRODUK_UP_PATH, kategori, produk, type);
      await fs.ensureDir(targetPath);
      await fs.move(
        req.file.path,
        path.join(targetPath, req.file.originalname),
        { overwrite: true },
      );

      res.json({ success: true, filename: req.file.originalname });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

app.get("/api/open-folder", (req, res) => {
  const folderPath = req.query.path;
  if (!folderPath) return res.status(400).json({ error: "Path required" });

  const fullPath = path.join(__dirname, folderPath);
  require("child_process").exec(`start "" "${fullPath}"`);
  res.json({ success: true });
});

async function start() {
  await initFolders();
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}
start().catch(console.error);
