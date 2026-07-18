const express = require("express");
const multer = require("multer");
const fs = require("fs-extra");
const path = require("path");
const cors = require("cors");
const archiver = require("archiver");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = 3000;
const JWT_SECRET = "zynhope-secret-key-2024";
const MASTER_PASSWORD = "020608";

app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use("/produk", express.static(path.join(__dirname, "produk")));

const BASE_PATH = path.join(__dirname, "produk");
const MENTAH_PATH = path.join(BASE_PATH, "mentah");
const TEXT_PATH = path.join(BASE_PATH, "text");
const PRODUK_UP_PATH = path.join(BASE_PATH, "produk up");
const ANALYTICS_PATH = path.join(BASE_PATH, ".analytics.json");

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

// Auth Middleware
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

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

  if (!(await fs.pathExists(ANALYTICS_PATH))) {
    await fs.writeJson(ANALYTICS_PATH, {
      totalUploads: 0,
      totalProducts: 0,
      totalCategories: 0,
      lastBackup: null,
      actions: [],
    });
  }
}

// Analytics tracker
async function trackAction(action, details = {}) {
  try {
    const analytics = await fs.readJson(ANALYTICS_PATH);
    analytics.actions.push({
      action,
      details,
      timestamp: new Date().toISOString(),
    });
    if (action === "upload") analytics.totalUploads++;
    if (action === "create_product") analytics.totalProducts++;
    if (action === "create_category") analytics.totalCategories++;
    await fs.writeJson(ANALYTICS_PATH, analytics, { spaces: 2 });
  } catch (err) {
    console.error("Analytics error:", err);
  }
}

// ==================== AUTH ====================
app.post("/api/login", async (req, res) => {
  const { password } = req.body;

  if (password === MASTER_PASSWORD) {
    const token = jwt.sign({ user: "admin" }, JWT_SECRET, { expiresIn: "24h" });
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: "Password salah" });
  }
});

app.get("/api/verify-token", authMiddleware, (req, res) => {
  res.json({ valid: true });
});

// ==================== ANALYTICS ====================
app.get("/api/analytics", authMiddleware, async (req, res) => {
  try {
    const analytics = await fs.readJson(ANALYTICS_PATH);
    const produkCount = await countAllProducts();
    const kategoriCount = (await fs.readdir(PRODUK_UP_PATH)).filter((f) =>
      fs.statSync(path.join(PRODUK_UP_PATH, f)).isDirectory(),
    ).length;

    res.json({
      totalUploads: analytics.totalUploads,
      totalProducts: produkCount,
      totalCategories: kategoriCount,
      lastBackup: analytics.lastBackup,
      recentActions: analytics.actions.slice(-20).reverse(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function countAllProducts() {
  let count = 0;
  const categories = await fs.readdir(PRODUK_UP_PATH);
  for (const cat of categories) {
    const catPath = path.join(PRODUK_UP_PATH, cat);
    if ((await fs.stat(catPath)).isDirectory()) {
      const products = await fs.readdir(catPath);
      count += products.filter((p) =>
        fs.statSync(path.join(catPath, p)).isDirectory(),
      ).length;
    }
  }
  return count;
}

// ==================== PROMPT ====================
app.get("/api/prompts", authMiddleware, async (req, res) => {
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

app.get("/api/prompts/:filename", authMiddleware, async (req, res) => {
  try {
    const filePath = path.join(TEXT_PATH, "prompt", req.params.filename);
    const content = await fs.readFile(filePath, "utf-8");
    res.json({ filename: req.params.filename, content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/prompts", authMiddleware, async (req, res) => {
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
    await trackAction("create_prompt", { filename: sanitized });
    res.json({ success: true, filename: sanitized + ".txt" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/prompts/:filename", authMiddleware, async (req, res) => {
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

app.delete("/api/prompts/:filename", authMiddleware, async (req, res) => {
  try {
    await fs.remove(path.join(TEXT_PATH, "prompt", req.params.filename));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rename prompt
app.put("/api/prompts-rename/:filename", authMiddleware, async (req, res) => {
  try {
    const oldPath = path.join(TEXT_PATH, "prompt", req.params.filename);
    const newName =
      req.body.newName.replace(/[^a-zA-Z0-9\s-_]/g, "").trim() + ".txt";
    const newPath = path.join(TEXT_PATH, "prompt", newName);
    await fs.move(oldPath, newPath);
    res.json({ success: true, newName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== TEMPLATE TEXT ====================
app.get("/api/templates", authMiddleware, async (req, res) => {
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

app.get("/api/templates/:filename", authMiddleware, async (req, res) => {
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

app.post("/api/templates", authMiddleware, async (req, res) => {
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
    await trackAction("create_template", { filename: sanitized });
    res.json({ success: true, filename: sanitized + ".txt" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/templates/:filename", authMiddleware, async (req, res) => {
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

app.delete("/api/templates/:filename", authMiddleware, async (req, res) => {
  try {
    await fs.remove(path.join(TEXT_PATH, "template text", req.params.filename));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/templates-rename/:filename", authMiddleware, async (req, res) => {
  try {
    const oldPath = path.join(TEXT_PATH, "template text", req.params.filename);
    const newName =
      req.body.newName.replace(/[^a-zA-Z0-9\s-_]/g, "").trim() + ".txt";
    const newPath = path.join(TEXT_PATH, "template text", newName);
    await fs.move(oldPath, newPath);
    res.json({ success: true, newName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== MENTAH ====================
app.get("/api/mentah/folders", authMiddleware, async (req, res) => {
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

app.post("/api/mentah/folders", authMiddleware, async (req, res) => {
  try {
    const sanitized = req.body.folderName
      .replace(/[^a-zA-Z0-9\s-_]/g, "")
      .trim();
    if (!sanitized)
      return res.status(400).json({ error: "Nama folder tidak valid" });
    await fs.ensureDir(path.join(MENTAH_PATH, sanitized));
    await trackAction("create_folder_mentah", { folder: sanitized });
    res.json({ success: true, folder: sanitized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/mentah/folders/:folder", authMiddleware, async (req, res) => {
  try {
    const folderName = decodeURIComponent(req.params.folder);
    const folderPath = path.join(MENTAH_PATH, folderName);
    if (["panjang", "pendek"].includes(folderName)) {
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

app.put(
  "/api/mentah/folders-rename/:folder",
  authMiddleware,
  async (req, res) => {
    try {
      const oldPath = path.join(MENTAH_PATH, req.params.folder);
      const newName = req.body.newName.replace(/[^a-zA-Z0-9\s-_]/g, "").trim();
      if (["panjang", "pendek"].includes(req.params.folder)) {
        return res
          .status(400)
          .json({ error: "Folder default tidak bisa direname" });
      }
      const newPath = path.join(MENTAH_PATH, newName);
      await fs.move(oldPath, newPath);
      res.json({ success: true, newName });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

app.get("/api/mentah/files/:folder", authMiddleware, async (req, res) => {
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
  authMiddleware,
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
      await trackAction("upload_mentah", {
        folder: req.params.folder,
        file: req.file.originalname,
      });
      res.json({ success: true, filename: req.file.originalname });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

app.delete(
  "/api/mentah/files/:folder/:filename",
  authMiddleware,
  async (req, res) => {
    try {
      await fs.remove(
        path.join(MENTAH_PATH, req.params.folder, req.params.filename),
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

app.put(
  "/api/mentah/files-rename/:folder/:filename",
  authMiddleware,
  async (req, res) => {
    try {
      const oldPath = path.join(
        MENTAH_PATH,
        req.params.folder,
        req.params.filename,
      );
      const newPath = path.join(
        MENTAH_PATH,
        req.params.folder,
        req.body.newName,
      );
      await fs.move(oldPath, newPath);
      res.json({ success: true, newName: req.body.newName });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// Reorder mentah files
app.put(
  "/api/mentah/files-reorder/:folder",
  authMiddleware,
  async (req, res) => {
    try {
      const folderPath = path.join(MENTAH_PATH, req.params.folder);
      const { files } = req.body;
      const tempDir = path.join(MENTAH_PATH, ".temp_reorder");
      await fs.ensureDir(tempDir);

      for (let i = 0; i < files.length; i++) {
        const oldPath = path.join(folderPath, files[i]);
        const tempPath = path.join(
          tempDir,
          `${String(i).padStart(5, "0")}_${files[i]}`,
        );
        if (await fs.pathExists(oldPath)) {
          await fs.move(oldPath, tempPath);
        }
      }

      const tempFiles = await fs.readdir(tempDir);
      for (const tf of tempFiles) {
        const originalName = tf.replace(/^\d{5}_/, "");
        await fs.move(
          path.join(tempDir, tf),
          path.join(folderPath, originalName),
        );
      }

      await fs.remove(tempDir);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ==================== PRODUK UP ====================
app.get("/api/kategori", authMiddleware, async (req, res) => {
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

app.post("/api/kategori", authMiddleware, async (req, res) => {
  try {
    const sanitized = req.body.nama.replace(/[^a-zA-Z0-9\s-_]/g, "").trim();
    if (!sanitized) return res.status(400).json({ error: "Nama tidak valid" });
    await fs.ensureDir(path.join(PRODUK_UP_PATH, sanitized));
    await trackAction("create_category", { category: sanitized });
    res.json({ success: true, kategori: sanitized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/kategori/:nama", authMiddleware, async (req, res) => {
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

app.get("/api/produk/:kategori", authMiddleware, async (req, res) => {
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
      let fotoOrder = metadata.fotoOrder || [];

      if (await fs.pathExists(fotoFolder)) {
        let allFotos = (await fs.readdir(fotoFolder)).filter(
          (f) => !f.startsWith("."),
        );
        if (fotoOrder.length > 0) {
          fotos = fotoOrder.filter((f) => allFotos.includes(f));
          const remaining = allFotos.filter((f) => !fotoOrder.includes(f));
          fotos = [...fotos, ...remaining];
        } else {
          fotos = allFotos;
        }
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
        fotoOrder,
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
  authMiddleware,
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
        {
          judul: sanitizedJudul,
          fotoOrder,
          created: new Date().toISOString(),
        },
        { spaces: 2 },
      );

      await trackAction("create_product", {
        kategori: sanitizedKat,
        produk: sanitizedJudul,
      });
      res.json({
        success: true,
        message: `Produk "${sanitizedJudul}" berhasil dibuat!`,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

app.put("/api/produk/:kategori/:produk", authMiddleware, async (req, res) => {
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

app.put(
  "/api/produk/:kategori/:produk/reorder-foto",
  authMiddleware,
  async (req, res) => {
    try {
      const produkPath = path.join(
        PRODUK_UP_PATH,
        req.params.kategori,
        req.params.produk,
      );
      const dataPath = path.join(produkPath, "data.json");
      let metadata = {};
      if (await fs.pathExists(dataPath)) metadata = await fs.readJson(dataPath);

      metadata.fotoOrder = req.body.fotoOrder;
      await fs.writeJson(dataPath, metadata, { spaces: 2 });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

app.delete(
  "/api/produk/:kategori/:produk",
  authMiddleware,
  async (req, res) => {
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
  },
);

app.delete(
  "/api/produk/:kategori/:produk/:type/:filename",
  authMiddleware,
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
  authMiddleware,
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

      await trackAction("upload_produk", {
        kategori,
        produk,
        type,
        file: req.file.originalname,
      });
      res.json({ success: true, filename: req.file.originalname });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ==================== BACKUP ZIP ====================
app.get("/api/backup", authMiddleware, async (req, res) => {
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
      console.error("Archive error:", err);
      res.status(500).end();
    });

    archive.pipe(res);
    archive.directory(BASE_PATH, "produk");
    archive.finalize();

    const analytics = await fs.readJson(ANALYTICS_PATH);
    analytics.lastBackup = new Date().toISOString();
    await fs.writeJson(ANALYTICS_PATH, analytics, { spaces: 2 });
  } catch (err) {
    console.error("Backup error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/open-folder", authMiddleware, (req, res) => {
  const folderPath = req.query.path;
  if (!folderPath) return res.status(400).json({ error: "Path required" });

  const fullPath = path.join(__dirname, folderPath);
  require("child_process").exec(`start "" "${fullPath}"`);
  res.json({ success: true });
});

// ==================== GENERATOR TEMPLATES ====================
app.get("/api/generator-templates", authMiddleware, async (req, res) => {
  try {
    const templates = [
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
        template: `Recreate the uploaded typography artwork into a brand-new custom lettering logo while preserving the same overall artistic style, energy, and visual identity.\n\nMain Text:\n"[YOUR MAIN TEXT]"\n\nTagline:\n"[YOUR TAGLINE]"\n(If no tagline is provided, omit the tagline completely.)\n\nIMPORTANT:\nThis is NOT a font replacement.\nThis is NOT a direct copy.\n\nThe goal is to create an entirely new custom lettering design inspired by the uploaded artwork while using the provided text.\n\nSTYLE\n\n• Custom hand-lettered typography\n• Japanese streetwear aesthetic\n• Modern tattoo lettering\n• Sharp brush-inspired vector curves\n• Dynamic calligraphic flow\n• Aggressive yet readable\n• Premium fashion brand logo\n• High-end apparel branding\n• Clean vector artwork\n• Adobe Illustrator quality\n• Smooth Bézier curves\n• Perfect symmetry where appropriate\n\nLAYOUT\n\n• Use the uploaded artwork as the style reference only.\n• Create a completely new lettering composition that naturally fits the new text.\n• Keep the overall horizontal layout.\n• Maintain similar visual balance.\n• Center the logo.\n• Keep generous whitespace.\n• Adapt the composition to different word lengths while maintaining visual harmony.\n\nLETTER DESIGN\n\n• Every letter must be custom drawn.\n• Letters should naturally connect when appropriate.\n• Use dynamic sharp terminals.\n• Use elegant sweeping strokes.\n• Use pointed ends.\n• Use thick-to-thin transitions.\n• Preserve the energetic movement found in the reference.\n• Create a premium handcrafted appearance.\n• Avoid looking like a standard font.\n\nVECTOR QUALITY\n\n• Smooth curves.\n• Crisp edges.\n• Closed vector shapes.\n• Consistent stroke quality.\n• Print-ready.\n• DTF friendly.\n• Screen-print friendly.\n• High contrast.\n• Clean black silhouette.\n• Professional logo finish.\n\nTAGLINE\n\nIf a tagline is provided:\n\n• Place it naturally beneath the main logo.\n• Use a clean uppercase sans-serif font.\n• Thin weight.\n• Wide letter spacing.\n• Perfect alignment with the logo.\n• Keep it subtle.\n• Do not overpower the main lettering.\n• Maintain premium streetwear branding aesthetics.\n\nCOLORS\n\n• Solid black typography.\n• Pure white background.\n• No gradients.\n• No textures.\n• No shadows.\n• No metallic effects.\n• No glow.\n• No bevel.\n• Flat vector color only.\n\nBACKGROUND\n\nPure white only.\n\nNo extra graphics.\nNo brush splashes.\nNo symbols.\nNo ornaments.\nNo flames.\nNo skulls.\nNo circles.\nNo decorations.\nNo watermark.\nNo logo mockups.\nNo fabric texture.\n\nAVOID\n\ngeneric fonts,\nfont substitution,\nclipart,\nAI-looking typography,\nmessy strokes,\nuneven curves,\npoor kerning,\nrandom flourishes,\nhard-to-read lettering,\ndistorted letters,\noverly complex swashes,\n3D effects,\ngradients,\ntextures,\ndrop shadows,\nglows,\nbackground graphics,\nlow resolution,\nlow quality.\n\nThe final result should look like a professionally hand-crafted vector lettering logo designed for a premium Japanese streetwear clothing brand, inspired by the uploaded artwork but completely rebuilt around the new text.`,
        placeholders: ["YOUR MAIN TEXT", "YOUR TAGLINE"],
      },
      {
        id: "deskripsi",
        name: "Deskripsi Produk",
        template: `ZYNHOPE — Zero Yearning Hope\nDi ZYNHOPE, kami hadir dengan filosofi Zero Yearning Hope—mengubah harapan menjadi nyata lewat kenyamanan mutlak, potongan yang esensial, dan estetika yang bersih tanpa ekspektasi yang berlebihan.\nKoleksi Kaos [TULIS TEMA GAMBAR DI SINI] hadir sebagai esensi utama gaya harianmu—dirancang untuk kamu yang menghargai kualitas unggul tanpa harus tampil berlebihan.\n\n💎 Esensi Kualitas & Detail Produk\n• Premium Cotton Combed 30s (Grade A): Kami memilih serat katun terbaik yang halus, ringan, dan bernapas dengan baik. Sangat adaptif untuk iklim tropis, memberikan kenyamanan dingin yang bertahan sepanjang hari.\n• High-Definition DTF Print: Visual [TULIS TEMA GAMBAR DI SINI] dicetak dengan presisi tinggi dan warna yang matang. Tinta menyatu sempurna dengan kain, fleksibel, serta memiliki daya tahan tinggi terhadap cuaca dan pencucian.\n• Struktur Jahitan Kokoh: Menggunakan standar jahitan rantai pada bahu dan overdeck rapi untuk memastikan kaos tetap mempertahankan bentuk aslinya meski dipakai dalam jangka panjang.\n• Siluet Unisex Modern: Potongan yang fleksibel untuk pria maupun wanita, memberikan kesan effortless streetwear yang rapi.\n\n📏 Panduan Ukuran Terlengkap (M – 7XL)\nKami percaya kenyamanan adalah hak semua bentuk tubuh. Tersedia dari ukuran reguler hingga Big Size/Jumbo dengan detail ukuran (Panjang x Lebar) dan rekomendasi berat badan:\n• M: 68 cm x 49 cm (BB 45–55 kg)\n• L: 70 cm x 51 cm (BB 55–65 kg)\n• XL: 72 cm x 53 cm (BB 65–75 kg)\n• 2XL: 74 cm x 56 cm (BB 80–90 kg)\n• 3XL: 76 cm x 60 cm (BB 90–100 kg)\n• 4XL: 78 cm x 63 cm (BB 100–115 kg)\n• 5XL: 81 cm x 66 cm (BB 115–125 kg)\n• 6XL: 83 cm x 69 cm (BB 125–135 kg)\n• 7XL: 85 cm x 71 cm (BB 135–150 kg) (Toleransi ukuran kain ± 1-2 cm)\n\n🧺 Perawatan Minimalis untuk Daya Tahan Maksimal\n1. Balik kaos saat dicuci (bagian gambar berada di dalam).\n2. Hindari penggunaan pemutih pakaian.\n3. Jemur di tempat yang teduh (tidak terpapar sinar matahari langsung terlalu lama).\n4. Setrika dengan suhu sedang dari bagian dalam kaos (jangan menyetrika langsung di atas area cetakan).\n\n📦 Layanan & Garansi ZYNHOPE\nKenyamanan berbelanja kamu adalah prioritas utama kami.\n• Mendukung layanan COD (Bayar di Tempat).\n• Fasilitas Gratis Ongkir sesuai ketentuan platform.\nPilih ukuran terbaikmu hari ini dan rasakan pengalaman gaya yang sesungguhnya bersama ZYNHOPE.\n#Zynhope #ZeroYearningHope #KaosPolos #KaosDistro #KaosOversize #KaosJumbo #BigSizePria #CottonCombed30s #KaosPremium #BajuBigSize #FashionUnisex #Kaos7XL #MinimalistStyle`,
        placeholders: ["TULIS TEMA GAMBAR DI SINI"],
      },
    ];
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start
async function start() {
  await initFolders();
  app.listen(PORT, () => {
    console.log(`\n=============================================`);
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`🔐 Password: ${MASTER_PASSWORD}`);
    console.log(`=============================================\n`);
  });
}
start().catch(console.error);
