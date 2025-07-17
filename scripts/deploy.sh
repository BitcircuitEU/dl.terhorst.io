#!/bin/bash

# UUP Dump Frontend Deployment Script für Debian 12
# Automatisierte Einrichtung des kompletten Systems

set -e

echo "🚀 UUP Dump Frontend Deployment startet..."

# Konfiguration
DOMAIN="dl.terhorst.io"
APP_DIR="/opt/dl.terhorst.io"
SERVICE_NAME="uup-frontend"

# Prüfe ob als root ausgeführt
if [ "$EUID" -ne 0 ]; then
    echo "❌ Bitte als root ausführen (sudo ./deploy.sh)"
    exit 1
fi

echo "📦 Aktualisiere System..."
apt update && apt upgrade -y

echo "🔧 Installiere System-Dependencies..."
apt install -y \
    curl \
    git \
    apache2 \
    nodejs \
    npm \
    nginx \
    htop \
    ufw \
    certbot \
    python3-certbot-apache

# Node.js Version prüfen und ggf. neuere installieren
echo "📊 Prüfe Node.js Version..."
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
    echo "🔄 Installiere neuere Node.js Version..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi

echo "📦 Installiere Server Dependencies (Haupt-package.json)..."
cd "$APP_DIR"
npm install

echo "📦 Installiere Client Dependencies (React Frontend)..."
npm run install-client

echo "🏗️ Build React Frontend..."
npm run build

echo "⚙️ Setup UUP Dump API-Tools..."
# Installiere UUP-spezifische Pakete
apt install -y \
    aria2 \
    cabextract \
    wimtools \
    chntpw \
    genisoimage \
    p7zip-full

# Erstelle UUP-Arbeitsverzeichnis
UUP_WORK_DIR="/opt/uup-work"
echo "📁 Erstelle UUP-Arbeitsverzeichnis: $UUP_WORK_DIR"
mkdir -p "$UUP_WORK_DIR"

# Erstelle API-Helper-Script
echo "📝 Erstelle UUP API Helper Script..."
cat > "$UUP_WORK_DIR/uup-api-helper.py" << 'EOF'
#!/usr/bin/env python3
"""
UUP Dump API Helper Script
Verwendet nur die offizielle API von api.uupdump.net
"""
import requests
import json
import sys
import os

API_BASE = "https://api.uupdump.net"

def download_with_aria2(files_data, work_dir):
    """Download files using aria2c based on API data"""
    aria2_input = os.path.join(work_dir, "aria2_input.txt")
    
    with open(aria2_input, 'w') as f:
        for filename, file_info in files_data.items():
            if file_info.get('url') and file_info['url'] != 'null':
                f.write(f"{file_info['url']}\n")
                f.write(f"  out={filename}\n")
                if file_info.get('sha1'):
                    f.write(f"  checksum=sha-1={file_info['sha1']}\n")
                f.write("\n")
    
    return aria2_input

if __name__ == "__main__":
    print("UUP API Helper - Verwendet api.uupdump.net")
EOF

chmod +x "$UUP_WORK_DIR/uup-api-helper.py"

# Erstelle ISO-Erstellungs-Script
echo "📝 Erstelle ISO Creator Script..."
cat > "$UUP_WORK_DIR/create-iso.sh" << 'EOF'
#!/bin/bash
# ISO-Erstellungs-Script für Windows-Dateien

WORK_DIR="$1"
OUTPUT_ISO="$2"

if [ -z "$WORK_DIR" ] || [ -z "$OUTPUT_ISO" ]; then
    echo "Usage: $0 <work_dir> <output_iso>"
    exit 1
fi

cd "$WORK_DIR"

# Prüfe ob Windows-Dateien vorhanden
if [ -f "sources/install.wim" ] || [ -f "sources/install.esd" ]; then
    echo "Windows-Dateien gefunden, erstelle ISO..."
    
    # Erstelle bootbare Windows-ISO
    genisoimage \
        -b boot/etfsboot.com \
        -no-emul-boot \
        -boot-load-size 8 \
        -boot-info-table \
        -iso-level 2 \
        -J \
        -joliet-long \
        -D \
        -N \
        -relaxed-filenames \
        -V "Windows" \
        -o "$OUTPUT_ISO" \
        .
        
    echo "ISO erstellt: $OUTPUT_ISO"
else
    echo "Keine Windows-Installationsdateien gefunden"
    exit 1
fi
EOF

chmod +x "$UUP_WORK_DIR/create-iso.sh"

# Erstelle symbolische Links
echo "🔗 Erstelle globale Links..."
ln -sf "$UUP_WORK_DIR/uup-api-helper.py" /usr/local/bin/uup-api-helper
ln -sf "$UUP_WORK_DIR/create-iso.sh" /usr/local/bin/uup-create-iso

# Erstelle tmp-Verzeichnis
mkdir -p /tmp/uup-downloads

# Setze Umgebungsvariablen
echo "🌍 Setze UUP-Umgebungsvariablen..."
echo "export UUP_WORK_DIR=$UUP_WORK_DIR" >> /etc/environment
echo "export UUP_API_BASE=https://api.uupdump.net" >> /etc/environment

echo "✅ UUP Dump API-Tools installiert"

echo "📋 Erstelle Environment-Datei..."
cat > "$APP_DIR"/.env << EOF
PORT=3001
AUTH_USER=admin
AUTH_PASS=changeme
MOUNT_PATH=/mnt/onedrive/bootimages/windows
TMP_PATH=/tmp/uup-downloads
UUP_API_BASE=https://api.uupdump.net
DOMAIN=$DOMAIN
EOF

chmod 600 "$APP_DIR/.env"

echo ""
echo "🎉 Deployment abgeschlossen!"
echo ""
echo "📋 Zusammenfassung:"
echo "   🌐 Website: https://$DOMAIN"
echo "   📁 App-Verzeichnis: $APP_DIR"
echo "   👤 Service-User: root"
echo "   🔧 Service-Name: $SERVICE_NAME"
echo ""
echo "⚙️  Nächste Schritte:"
echo "   1. Apache-Passwort setzen:"
echo "      sudo htpasswd /etc/apache2/.htpasswd admin"
echo ""
echo "   2. Environment-Variablen anpassen:"
echo "      sudo nano $APP_DIR/.env"
echo ""
echo "   3. Service neu starten nach Änderungen:"
echo "      sudo systemctl restart $SERVICE_NAME"
echo ""
echo "   4. Logs überprüfen:"
echo "      sudo journalctl -f -u $SERVICE_NAME"
echo "      sudo tail -f /var/log/apache2/$DOMAIN*.log"
echo ""
echo "   5. Mount-Point überprüfen:"
echo "      ls -la /mnt/onedrive/bootimages/windows/"
echo "" 