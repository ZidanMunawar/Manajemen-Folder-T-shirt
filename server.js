const express = require("express");
const multer = require("multer");
const fs = require("fs-extra");
const path = require("path");
const cors = require("cors");
const archiver = require("archiver");

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

// ==================== BACKUP ZIP ====================
app.get("/api/backup", (req, res) => {
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
  } catch (err) {
    console.error("Backup error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== GENERATOR TEMPLATES ====================
app.get("/api/generator-templates", async (req, res) => {
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
        template: `Recreate the uploaded typography artwork into a brand-new custom lettering logo while preserving the same overall artistic style, energy, and visual identity.

Main Text:
"[YOUR MAIN TEXT]"

Tagline:
"[YOUR TAGLINE]"
(If no tagline is provided, omit the tagline completely.)

IMPORTANT:
This is NOT a font replacement.
This is NOT a direct copy.

The goal is to create an entirely new custom lettering design inspired by the uploaded artwork while using the provided text.

STYLE

• Custom hand-lettered typography
• Japanese streetwear aesthetic
• Modern tattoo lettering
• Sharp brush-inspired vector curves
• Dynamic calligraphic flow
• Aggressive yet readable
• Premium fashion brand logo
• High-end apparel branding
• Clean vector artwork
• Adobe Illustrator quality
• Smooth Bézier curves
• Perfect symmetry where appropriate

LAYOUT

• Use the uploaded artwork as the style reference only.
• Create a completely new lettering composition that naturally fits the new text.
• Keep the overall horizontal layout.
• Maintain similar visual balance.
• Center the logo.
• Keep generous whitespace.
• Adapt the composition to different word lengths while maintaining visual harmony.

LETTER DESIGN

• Every letter must be custom drawn.
• Letters should naturally connect when appropriate.
• Use dynamic sharp terminals.
• Use elegant sweeping strokes.
• Use pointed ends.
• Use thick-to-thin transitions.
• Preserve the energetic movement found in the reference.
• Create a premium handcrafted appearance.
• Avoid looking like a standard font.

VECTOR QUALITY

• Smooth curves.
• Crisp edges.
• Closed vector shapes.
• Consistent stroke quality.
• Print-ready.
• DTF friendly.
• Screen-print friendly.
• High contrast.
• Clean black silhouette.
• Professional logo finish.

TAGLINE

If a tagline is provided:

• Place it naturally beneath the main logo.
• Use a clean uppercase sans-serif font.
• Thin weight.
• Wide letter spacing.
• Perfect alignment with the logo.
• Keep it subtle.
• Do not overpower the main lettering.
• Maintain premium streetwear branding aesthetics.

COLORS

• Solid black typography.
• Pure white background.
• No gradients.
• No textures.
• No shadows.
• No metallic effects.
• No glow.
• No bevel.
• Flat vector color only.

BACKGROUND

Pure white only.

No extra graphics.
No brush splashes.
No symbols.
No ornaments.
No flames.
No skulls.
No circles.
No decorations.
No watermark.
No logo mockups.
No fabric texture.

AVOID

generic fonts,
font substitution,
clipart,
AI-looking typography,
messy strokes,
uneven curves,
poor kerning,
random flourishes,
hard-to-read lettering,
distorted letters,
overly complex swashes,
3D effects,
gradients,
textures,
drop shadows,
glows,
background graphics,
low resolution,
low quality.

The final result should look like a professionally hand-crafted vector lettering logo designed for a premium Japanese streetwear clothing brand, inspired by the uploaded artwork but completely rebuilt around the new text.`,
        placeholders: ["YOUR MAIN TEXT", "YOUR TAGLINE"],
      },
      {
        id: "deskripsi",
        name: "Deskripsi Produk",
        template: `ZYNHOPE \u2014 Zero Yearning Hope
Di ZYNHOPE, kami hadir dengan filosofi Zero Yearning Hope\u2014mengubah harapan menjadi nyata lewat kenyamanan mutlak, potongan yang esensial, dan estetika yang bersih tanpa ekspektasi yang berlebihan.
Koleksi Kaos [TULIS TEMA GAMBAR DI SINI] hadir sebagai esensi utama gaya harianmu\u2014dirancang untuk kamu yang menghargai kualitas unggul tanpa harus tampil berlebihan.

\uD83D\uDC8E Esensi Kualitas & Detail Produk
\u2022 Premium Cotton Combed 30s (Grade A): Kami memilih serat katun terbaik yang halus, ringan, dan bernapas dengan baik. Sangat adaptif untuk iklim tropis, memberikan kenyamanan dingin yang bertahan sepanjang hari.
\u2022 High-Definition DTF Print: Visual [TULIS TEMA GAMBAR DI SINI] dicetak dengan presisi tinggi dan warna yang matang. Tinta menyatu sempurna dengan kain, fleksibel, serta memiliki daya tahan tinggi terhadap cuaca dan pencucian.
\u2022 Struktur Jahitan Kokoh: Menggunakan standar jahitan rantai pada bahu dan overdeck rapi untuk memastikan kaos tetap mempertahankan bentuk aslinya meski dipakai dalam jangka panjang.
\u2022 Siluet Unisex Modern: Potongan yang fleksibel untuk pria maupun wanita, memberikan kesan effortless streetwear yang rapi.

\uD83D\uDCCF Panduan Ukuran Terlengkap (M \u2013 7XL)
Kami percaya kenyamanan adalah hak semua bentuk tubuh. Tersedia dari ukuran reguler hingga Big Size/Jumbo dengan detail ukuran (Panjang x Lebar) dan rekomendasi berat badan:
\u2022 M: 68 cm x 49 cm (BB 45\u201355 kg)
\u2022 L: 70 cm x 51 cm (BB 55\u201365 kg)
\u2022 XL: 72 cm x 53 cm (BB 65\u201375 kg)
\u2022 2XL: 74 cm x 56 cm (BB 80\u201390 kg)
\u2022 3XL: 76 cm x 60 cm (BB 90\u2013100 kg)
\u2022 4XL: 78 cm x 63 cm (BB 100\u2013115 kg)
\u2022 5XL: 81 cm x 66 cm (BB 115\u2013125 kg)
\u2022 6XL: 83 cm x 69 cm (BB 125\u2013135 kg)
\u2022 7XL: 85 cm x 71 cm (BB 135\u2013150 kg) (Toleransi ukuran kain \u00B1 1-2 cm)

\uD83E\uDD7A Perawatan Minimalis untuk Daya Tahan Maksimal
1. Balik kaos saat dicuci (bagian gambar berada di dalam).
2. Hindari penggunaan pemutih pakaian.
3. Jemur di tempat yang teduh (tidak terpapar sinar matahari langsung terlalu lama).
4. Setrika dengan suhu sedang dari bagian dalam kaos (jangan menyetrika langsung di atas area cetakan).

\uD83D\uDCE6 Layanan & Garansi ZYNHOPE
Kenyamanan berbelanja kamu adalah prioritas utama kami.
\u2022 Mendukung layanan COD (Bayar di Tempat).
\u2022 Fasilitas Gratis Ongkir sesuai ketentuan platform.
Pilih ukuran terbaikmu hari ini dan rasakan pengalaman gaya yang sesungguhnya bersama ZYNHOPE.
#Zynhope #ZeroYearningHope #KaosPolos #KaosDistro #KaosOversize #KaosJumbo #BigSizePria #CottonCombed30s #KaosPremium #BajuBigSize #FashionUnisex #Kaos7XL #MinimalistStyle`,
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
    console.log(`Server running at http://localhost:${PORT}`);
  });
}
start().catch(console.error);
