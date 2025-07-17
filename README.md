# UUP Dump Frontend - Windows Image Manager

Ein modernes Web-Frontend für die UUP Dump API, das eine benutzerfreundliche Oberfläche zur Erstellung und Verwaltung von Windows ISO-Images bietet.

## 🌟 Features

- **Moderne React-UI** mit Material-UI Design
- **UUP Dump API Integration** für alle verfügbaren Windows-Builds
- **Echzeit-Download-Progress** über WebSockets
- **Image-Management** mit Upload, Download und Löschfunktion
- **Apache-Integration** mit httpasswd-Authentifizierung
- **Automatisches Deployment** mit vorgefertigten Scripts
- **SSL-Support** mit Let's Encrypt Integration

## 🏗️ Architektur

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   React Frontend │────│   Node.js API   │────│api.uupdump.net  │
│   (Client)       │    │   (Express)      │    │   (Official)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         │                        │                        │
         v                        v                        v
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Apache Server │    │   WebSocket      │    │   System Tools  │
│   (Proxy/Auth)  │    │   (Progress)     │    │ (aria2c+genisoimage) │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 📋 Voraussetzungen

### Server (Debian 12)
- Root-Zugriff (System läuft als root)
- Apache2 bereits installiert
- Bestehende httpasswd-Authentifizierung
- rclone Mount unter `/mnt/onedrive`
- Domain `dl.terhorst.io` konfiguriert

### Entwicklung (Windows 11)
- Node.js 18+ 
- npm/yarn
- Git

## 🚀 Installation

### 1. Repository klonen
```bash
git clone <repository-url>
cd uup-dump-frontend
```

### 2. Automatisches Deployment (empfohlen)
```bash
# Auf dem Server als root ausführen
sudo chmod +x scripts/deploy.sh
sudo ./scripts/deploy.sh
```

Das Script führt automatisch aus:
- System-Updates
- Node.js Installation/Update
- UUP Dump API-Tools Setup (aria2c, genisoimage)
- Apache-Konfiguration
- SSL-Setup (optional)
- Service-Konfiguration (läuft als root)

**⚠️ Sicherheitshinweis**: Das System läuft als root-Benutzer für maximale Kompatibilität und einfache Verwaltung. Stellen Sie sicher, dass Ihr Server entsprechend abgesichert ist.

### 3. Manuelle Installation

#### Backend Setup
```bash
npm install
cd client && npm install && cd ..
npm run build
```

#### UUP Dump API-Tools
UUP Dump Tools werden automatisch durch das Deployment-Script installiert. Keine separaten Schritte nötig.

**Hinweis**: Das System installiert nur die notwendigen System-Tools (aria2c, genisoimage) und erstellt API-basierte Helper-Scripts. Es wird **kein** lokales UUP-Repository geklont, da die offizielle API von `api.uupdump.net` verwendet wird.

#### Apache Konfiguration
```bash
# Site-Konfiguration kopieren
sudo cp config/apache-site.conf /etc/apache2/sites-available/dl.terhorst.io.conf

# Module aktivieren
sudo a2enmod ssl proxy proxy_http proxy_wstunnel rewrite headers

# Site aktivieren
sudo a2ensite dl.terhorst.io
sudo systemctl reload apache2
```

## ⚙️ Konfiguration

### Environment-Variablen
Erstellen Sie eine `.env`-Datei im Projektroot:

```env
# Server-Konfiguration
PORT=3001

# Authentifizierung (an httpasswd anpassen)
AUTH_USER=download
AUTH_PASS=download

# Pfade
MOUNT_PATH=/mnt/onedrive/bootimages/windows
TMP_PATH=/tmp/uup-downloads

# UUP Dump API
UUP_API_BASE=https://api.uupdump.net

# Domain
DOMAIN=dl.terhorst.io
```

### Apache htpasswd
```bash
# Benutzer erstellen/ändern
sudo htpasswd /etc/apache2/.htpasswd download
```

## 🏃‍♂️ Verwendung

### 1. Server starten
```bash
# Entwicklung
npm run dev

# Produktion
npm start

# Als Service
sudo systemctl start uup-frontend
```

### 2. Website aufrufen
- Frontend: `https://dl.terhorst.io/app/`
- Direkte Downloads: `https://dl.terhorst.io/windows/`

### 3. Windows ISO erstellen
1. Login mit httpasswd-Credentials
2. "Windows Builds" Tab öffnen
3. Gewünschten Build auswählen
4. Sprache und Edition wählen
5. Download starten
6. Progress in Echtzeit verfolgen
7. Fertige ISO unter "Meine Images" finden

## 📁 Projektstruktur

```
uup-dump-frontend/
├── client/                 # React Frontend
│   ├── src/
│   │   ├── components/     # React Komponenten
│   │   ├── App.js         # Haupt-App
│   │   └── index.js       # Entry Point
│   ├── public/
│   └── package.json
├── server/                # Node.js Backend
│   ├── index.js          # Express Server
│   └── uup-wrapper.js    # UUP Dump Integration
├── scripts/              # Setup Scripts
│   └── deploy.sh         # Komplettes Deployment (als root)
├── config/               # Konfigurationsdateien
│   └── apache-site.conf  # Apache VirtualHost
├── package.json          # Node.js Dependencies
└── README.md            # Diese Datei
```

## 🔌 API-Endpunkte

### Builds
- `GET /api/builds` - Verfügbare Windows Builds
- `GET /api/fetch-updates` - Neue Updates von Microsoft abrufen
- `GET /api/languages/:id` - Sprachen für Build
- `GET /api/editions/:id/:lang` - Editionen für Build + Sprache

### Downloads
- `POST /api/download/:id` - ISO-Download starten
- WebSocket Events für Progress-Updates

### Images
- `GET /api/images` - Vorhandene ISO-Dateien
- `DELETE /api/images/:filename` - ISO-Datei löschen

## 🔧 Wartung

### Logs überprüfen
```bash
# Application Logs
sudo journalctl -f -u uup-frontend

# Apache Logs
sudo tail -f /var/log/apache2/dl.terhorst.io_access.log
sudo tail -f /var/log/apache2/dl.terhorst.io_error.log
```

### Service-Befehle
```bash
# Status prüfen (Service läuft als root)
sudo systemctl status uup-frontend

# Neustarten
sudo systemctl restart uup-frontend

# Stoppen
sudo systemctl stop uup-frontend

# Logs live anzeigen
sudo journalctl -f -u uup-frontend
```

### Updates
```bash
# Code aktualisieren (als root im App-Verzeichnis)
cd /opt/dl.terhorst.io
git pull origin main

# Dependencies aktualisieren
npm install
cd client && npm install && cd ..

# Frontend neu builden
npm run build

# Service neustarten
sudo systemctl restart uup-frontend
```

## 🛠️ Entwicklung

### Lokale Entwicklung
```bash
# Backend starten (Terminal 1)
npm run dev

# Frontend starten (Terminal 2)
cd client
npm start
```

### Build für Produktion
```bash
npm run build
```

### Neue Features hinzufügen
1. Frontend-Änderungen in `client/src/`
2. Backend-Änderungen in `server/`
3. Tests durchführen
4. Build erstellen
5. Deployment

## 🐛 Troubleshooting

### Häufige Probleme

#### "UUP ISO Creator nicht gefunden"
```bash
# Deployment erneut ausführen
sudo ./scripts/deploy.sh

# Prüfe installierte Tools
which aria2c
which genisoimage  
which uup-create-iso
```

#### "WebSocket-Verbindung fehlgeschlagen"
```bash
# Apache Proxy-Module prüfen
sudo a2enmod proxy_wstunnel
sudo systemctl reload apache2
```

#### "Authentifizierung fehlgeschlagen"
```bash
# htpasswd-Datei prüfen
sudo cat /etc/apache2/.htpasswd

# Neuen Benutzer erstellen
sudo htpasswd /etc/apache2/.htpasswd download
```

#### "ISO-Erstellung fehlgeschlagen"
```bash
# Berechtigungen prüfen
ls -la /tmp/uup-downloads/
ls -la /mnt/onedrive/bootimages/windows/

# Speicherplatz prüfen
df -h /tmp
df -h /mnt/onedrive
```

### Debug-Modus
```bash
# Mit Debug-Ausgabe starten
DEBUG=* npm start

# Oder nur bestimmte Module
DEBUG=express:* npm start
```

## 📄 Lizenz

MIT License - siehe LICENSE-Datei für Details.

## 🤝 Beitragen

1. Fork erstellen
2. Feature-Branch erstellen (`git checkout -b feature/neues-feature`)
3. Änderungen committen (`git commit -am 'Neues Feature hinzugefügt'`)
4. Branch pushen (`git push origin feature/neues-feature`)
5. Pull Request erstellen

## 📞 Support

Bei Problemen oder Fragen:
- GitHub Issues erstellen
- Logs überprüfen (siehe Wartung-Sektion)
- Dokumentation durchlesen

## 🙏 Danksagung

- [UUP Dump](https://uupdump.net/) für die API und CLI-Tools
- [Material-UI](https://mui.com/) für die UI-Komponenten
- [Express.js](https://expressjs.com/) für das Backend-Framework
- [React](https://reactjs.org/) für das Frontend-Framework 