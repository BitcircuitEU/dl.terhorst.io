const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const basicAuth = require('basic-auth');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;
const UUP_API_BASE = 'https://api.uupdump.net';
const MOUNT_PATH = '/mnt/onedrive/bootimages';
const WINDOWS_PATH = '/mnt/onedrive/bootimages/windows';
const TMP_PATH = '/tmp/uup-downloads';

// Template Engine konfigurieren
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/static', express.static(path.join(__dirname, 'src/public')));
app.use('/images', express.static(MOUNT_PATH));

// Basic Authentication Middleware
const authenticate = (req, res, next) => {
  const user = basicAuth(req);
  
  // Hier sollten Sie Ihre httpasswd-Credentials überprüfen
  // Für Demo-Zwecke verwenden wir Umgebungsvariablen
  const validUser = process.env.AUTH_USER || 'download';
  const validPass = process.env.AUTH_PASS || 'download';
  
  if (!user || user.name !== validUser || user.pass !== validPass) {
    res.set('WWW-Authenticate', 'Basic realm="UUP Dump Frontend"');
    return res.status(401).send('Authentifizierung erforderlich');
  }
  
  next();
};

// Stelle sicher, dass tmp-Verzeichnis existiert
fs.ensureDirSync(TMP_PATH);

// Haupt-Route - Dashboard
app.get('/', authenticate, (req, res) => {
  res.render('index');
});

// API Routes

// Hole verfügbare Builds
app.get('/api/builds', authenticate, async (req, res) => {
  try {
    const { search, sortByDate } = req.query;
    const params = new URLSearchParams();
    
    if (search) params.append('search', search);
    if (sortByDate) params.append('sortByDate', sortByDate);
    
    const response = await axios.get(`${UUP_API_BASE}/listid.php?${params}`);
    res.json(response.data);
  } catch (error) {
    console.error('Fehler beim Abrufen der Builds:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Builds' });
  }
});

// Hole neuste Builds von Windows Update
app.get('/api/fetch-updates', authenticate, async (req, res) => {
  try {
    const { arch, ring, flight } = req.query;
    const params = new URLSearchParams({
      arch: arch || 'amd64',
      ring: ring || 'Retail',
      flight: flight || 'Mainline'
    });
    
    const response = await axios.get(`${UUP_API_BASE}/fetchupd.php?${params}`);
    res.json(response.data);
  } catch (error) {
    console.error('Fehler beim Abrufen der Updates:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Updates' });
  }
});

// Hole verfügbare Sprachen für Build
app.get('/api/languages/:id', authenticate, async (req, res) => {
  try {
    const response = await axios.get(`${UUP_API_BASE}/listlangs.php?id=${req.params.id}`);
    res.json(response.data);
  } catch (error) {
    console.error('Fehler beim Abrufen der Sprachen:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Sprachen' });
  }
});

// Hole verfügbare Editionen für Build und Sprache
app.get('/api/editions/:id/:lang', authenticate, async (req, res) => {
  try {
    const response = await axios.get(`${UUP_API_BASE}/listeditions.php?id=${req.params.id}&lang=${req.params.lang}`);
    res.json(response.data);
  } catch (error) {
    console.error('Fehler beim Abrufen der Editionen:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Editionen' });
  }
});

// Starte ISO-Download und -Erstellung
app.post('/api/download/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { lang, edition } = req.body;
    
    const socketId = req.body.socketId;
    const clientSocket = io.sockets.sockets.get(socketId);
    
    if (!clientSocket) {
      return res.status(400).json({ error: 'WebSocket-Verbindung nicht gefunden' });
    }
    
    // Hole Download-Links
    const params = new URLSearchParams({
      id: id,
      lang: lang || 'de-de',
      edition: edition || 'Professional'
    });
    
    const response = await axios.get(`${UUP_API_BASE}/get.php?${params}`);
    const downloadData = response.data.response;
    
    if (!downloadData) {
      return res.status(400).json({ error: 'Keine Download-Daten verfügbar' });
    }
    
    // Starte Download-Prozess in separatem Thread
    startDownloadProcess(downloadData, clientSocket);
    
    res.json({ message: 'Download gestartet', buildName: downloadData.updateName });
  } catch (error) {
    console.error('Fehler beim Starten des Downloads:', error);
    res.status(500).json({ error: 'Fehler beim Starten des Downloads' });
  }
});

// Rekursive Funktion zum Durchsuchen aller Unterordner
async function findAllImages(dir, baseDir, images = []) {
  try {
    const files = await fs.readdir(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isDirectory()) {
        // Rekursiv in Unterordner schauen
        await findAllImages(filePath, baseDir, images);
      } else if (stats.isFile()) {
        // Prüfe auf relevante Dateierweiterungen
        const ext = path.extname(file).toLowerCase();
        if (['.iso', '.img', '.wim', '.esd', '.vhd', '.vhdx'].includes(ext)) {
          const relativePath = path.relative(baseDir, filePath);
          const category = path.dirname(relativePath) || 'Root';
          
          images.push({
            name: file,
            fullPath: relativePath,
            category: category,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            type: ext.substring(1).toUpperCase(),
            path: `/images/${relativePath.replace(/\\/g, '/')}`
          });
        }
      }
    }
  } catch (error) {
    console.error(`Fehler beim Durchsuchen von ${dir}:`, error);
  }
  
  return images;
}

// Hole Ordner-Struktur
app.get('/api/folders', authenticate, async (req, res) => {
  try {
    if (!fs.existsSync(MOUNT_PATH)) {
      return res.json({ folders: [] });
    }
    
    const images = await findAllImages(MOUNT_PATH, MOUNT_PATH);
    
    // Erstelle Ordner-Struktur
    const folderStructure = buildFolderStructure(images);
    
    res.json({ folders: folderStructure });
  } catch (error) {
    console.error('Fehler beim Abrufen der Ordner:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Ordner' });
  }
});

// Hole vorhandene Images (optional gefiltert nach Ordner)
app.get('/api/images', authenticate, async (req, res) => {
  try {
    if (!fs.existsSync(MOUNT_PATH)) {
      return res.json({ images: [], folders: [] });
    }
    
    const images = await findAllImages(MOUNT_PATH, MOUNT_PATH);
    const { folder } = req.query;
    
    // Filtere nach Ordner falls angegeben
    let filteredImages = images;
    if (folder && folder !== 'all') {
      filteredImages = images.filter(image => image.category === folder);
    }
    
    // Sortiere nach Kategorie und dann nach Name
    filteredImages.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name);
    });
    
    // Erstelle auch Ordner-Struktur
    const folderStructure = buildFolderStructure(images);
    
    res.json({ 
      images: filteredImages,
      folders: folderStructure,
      currentFolder: folder || 'all',
      totalCount: images.length
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Images:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Images' });
  }
});

// Hilfsfunktion: Erstelle Ordner-Struktur aus Images
function buildFolderStructure(images) {
  const folderCounts = {};
  
  // Zähle Images pro Ordner
  images.forEach(image => {
    const category = image.category || 'Root';
    if (!folderCounts[category]) {
      folderCounts[category] = 0;
    }
    folderCounts[category]++;
  });
  
  // Erstelle Ordner-Array
  const folders = Object.entries(folderCounts).map(([folder, count]) => ({
    name: folder,
    path: folder,
    count: count,
    level: (folder.match(/[/\\]/g) || []).length
  }));
  
  // Sortiere nach Pfad
  folders.sort((a, b) => a.path.localeCompare(b.path));
  
  return folders;
}

// Lösche Image
app.delete('/api/images/*', authenticate, async (req, res) => {
  try {
    // Hole den kompletten Pfad nach /api/images/
    const relativePath = decodeURIComponent(req.params[0]);
    const filePath = path.join(MOUNT_PATH, relativePath);
    
    // Sicherheitsprüfung - Datei muss im MOUNT_PATH sein
    if (!filePath.startsWith(MOUNT_PATH)) {
      return res.status(400).json({ error: 'Ungültiger Dateipfad' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Image nicht gefunden' });
    }
    
    await fs.remove(filePath);
    res.json({ message: 'Image erfolgreich gelöscht' });
  } catch (error) {
    console.error('Fehler beim Löschen des Images:', error);
    res.status(500).json({ error: 'Fehler beim Löschen des Images' });
  }
});

// WebSocket-Verbindungen
io.on('connection', (socket) => {
  console.log('Client verbunden:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client getrennt:', socket.id);
  });
});

// Download-Prozess-Funktion
async function startDownloadProcess(downloadData, socket) {
  const buildName = downloadData.updateName.replace(/[^a-zA-Z0-9\-_\.]/g, '_');
  const workDir = path.join(TMP_PATH, `${buildName}_${Date.now()}`);
  const finalIsoPath = path.join(WINDOWS_PATH, `${buildName}.iso`);
  
  try {
    await fs.ensureDir(workDir);
    
    socket.emit('download_progress', {
      stage: 'init',
      message: 'Download wird vorbereitet...',
      progress: 0
    });
    
    // Verwende die echte UUP Dump API Integration
    const { realDownloadProcess } = require('./src/uup-wrapper');
    await realDownloadProcess(socket, workDir, finalIsoPath, buildName, downloadData);
    
  } catch (error) {
    console.error('Download-Fehler:', error);
    socket.emit('download_error', {
      error: 'Download fehlgeschlagen',
      details: error.message
    });
    
    // Cleanup
    if (fs.existsSync(workDir)) {
      await fs.remove(workDir);
    }
  }
}

// Die Simulation wurde durch echte UUP Dump API Integration ersetzt
// Siehe ./src/uup-wrapper.js für die vollständige Implementierung

server.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
  console.log(`UUP Dump Frontend verfügbar unter http://localhost:${PORT}`);
}); 