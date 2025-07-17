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
const MOUNT_PATH = '/mnt/onedrive/bootimages/windows';
const TMP_PATH = '/tmp/uup-downloads';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/build')));

// Basic Authentication Middleware
const authenticate = (req, res, next) => {
  const user = basicAuth(req);
  
  // Hier sollten Sie Ihre httpasswd-Credentials überprüfen
  // Für Demo-Zwecke verwenden wir Umgebungsvariablen
  const validUser = process.env.AUTH_USER || 'admin';
  const validPass = process.env.AUTH_PASS || 'password';
  
  if (!user || user.name !== validUser || user.pass !== validPass) {
    res.set('WWW-Authenticate', 'Basic realm="UUP Dump Frontend"');
    return res.status(401).send('Authentifizierung erforderlich');
  }
  
  next();
};

// Stelle sicher, dass tmp-Verzeichnis existiert
fs.ensureDirSync(TMP_PATH);

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

// Hole vorhandene Images
app.get('/api/images', authenticate, async (req, res) => {
  try {
    if (!fs.existsSync(MOUNT_PATH)) {
      return res.json({ images: [] });
    }
    
    const files = await fs.readdir(MOUNT_PATH);
    const images = files
      .filter(file => file.toLowerCase().endsWith('.iso'))
      .map(file => {
        const filePath = path.join(MOUNT_PATH, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: stats.size,
          created: stats.birthtime,
          path: `/images/${file}`
        };
      });
    
    res.json({ images });
  } catch (error) {
    console.error('Fehler beim Abrufen der Images:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Images' });
  }
});

// Lösche Image
app.delete('/api/images/:filename', authenticate, async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(MOUNT_PATH, filename);
    
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
  const finalIsoPath = path.join(MOUNT_PATH, `${buildName}.iso`);
  
  try {
    await fs.ensureDir(workDir);
    
    socket.emit('download_progress', {
      stage: 'init',
      message: 'Download wird vorbereitet...',
      progress: 0
    });
    
    // Verwende die echte UUP Dump API Integration
    const { realDownloadProcess } = require('./uup-wrapper');
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
// Siehe ./uup-wrapper.js für die vollständige Implementierung

// Statische Dateien für React
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

server.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
  console.log(`UUP Dump Frontend verfügbar unter http://localhost:${PORT}`);
}); 