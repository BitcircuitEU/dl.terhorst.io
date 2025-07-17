#!/bin/bash

# UUP Dump Installation Script für Debian 12
# Dieses Script installiert alle notwendigen Tools für UUP Dump

set -e

echo "🚀 UUP Dump Installation startet..."

# Update System
echo "📦 System wird aktualisiert..."
sudo apt update && sudo apt upgrade -y

# Installiere notwendige Pakete
echo "🔧 Installiere Dependencies..."
sudo apt install -y \
    git \
    curl \
    wget \
    python3 \
    python3-pip \
    python3-venv \
    aria2 \
    cabextract \
    wimtools \
    chntpw \
    genisoimage \
    build-essential \
    p7zip-full \
    unzip

# Erstelle Arbeitsverzeichnis für UUP Downloads
UUP_WORK_DIR="/opt/uup-work"
echo "📁 Erstelle UUP-Arbeitsverzeichnis: $UUP_WORK_DIR"
sudo mkdir -p "$UUP_WORK_DIR"
sudo chown $(whoami):$(whoami) "$UUP_WORK_DIR"

# Erstelle UUP-Helper-Scripts (API-basiert, keine lokalen Tools nötig)
echo "📝 Erstelle API-basierte Helper-Scripts..."
cat > "$UUP_WORK_DIR/uup-api-helper.py" << 'EOF'
#!/usr/bin/env python3
"""
UUP Dump API Helper Script
Verwendet nur die offizielle API von api.uupdump.net
Keine lokalen UUP-Tools erforderlich
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
    print("Keine lokalen UUP-Tools erforderlich")
EOF

chmod +x "$UUP_WORK_DIR/uup-api-helper.py"

# Erstelle einfaches ISO-Erstellungs-Script
cat > "$UUP_WORK_DIR/create-iso.sh" << 'EOF'
#!/bin/bash
# Einfaches ISO-Erstellungs-Script für Windows-Dateien
# Verwendet nur Standard-Linux-Tools

WORK_DIR="$1"
OUTPUT_ISO="$2"

if [ -z "$WORK_DIR" ] || [ -z "$OUTPUT_ISO" ]; then
    echo "Usage: $0 <work_dir> <output_iso>"
    exit 1
fi

cd "$WORK_DIR"

# Prüfe ob install.wim/esd vorhanden
if [ -f "sources/install.wim" ] || [ -f "sources/install.esd" ]; then
    echo "Windows-Dateien gefunden, erstelle ISO..."
    
    # Erstelle ISO mit genisoimage (Standard Windows-Boot-Optionen)
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

# Erstelle symbolische Links für globalen Zugriff
echo "🔗 Erstelle symbolische Links..."
sudo ln -sf "$UUP_WORK_DIR/uup-api-helper.py" /usr/local/bin/uup-api-helper
sudo ln -sf "$UUP_WORK_DIR/create-iso.sh" /usr/local/bin/uup-create-iso

# Erstelle Arbeitsverzeichnis
sudo mkdir -p /tmp/uup-downloads
sudo chown $(whoami):$(whoami) /tmp/uup-downloads

# Teste Installation
echo "🧪 Teste Installation..."
if command -v aria2c &> /dev/null && command -v genisoimage &> /dev/null; then
    echo "✅ Alle notwendigen Tools erfolgreich installiert"
    echo "✅ aria2c: $(which aria2c)"
    echo "✅ genisoimage: $(which genisoimage)"
    echo "✅ UUP API Helper: $(which uup-api-helper)"
    echo "✅ ISO Creator: $(which uup-create-iso)"
else
    echo "❌ Installation fehlgeschlagen - notwendige Tools fehlen"
    exit 1
fi

# Setze Umgebungsvariablen
echo "🌍 Setze Umgebungsvariablen..."
echo "export UUP_WORK_DIR=$UUP_WORK_DIR" | sudo tee -a /etc/environment
echo "export UUP_API_BASE=https://api.uupdump.net" | sudo tee -a /etc/environment
echo "export PATH=\$PATH:/usr/local/bin" | sudo tee -a /etc/environment

echo ""
echo "🎉 UUP Dump API-Tools Installation abgeschlossen!"
echo "📍 Arbeitsverzeichnis: $UUP_WORK_DIR"
echo "🔧 Tools verfügbar als: uup-api-helper, uup-create-iso"
echo "🌐 Verwendet API: https://api.uupdump.net"
echo ""
echo "ℹ️  Nächste Schritte:"
echo "   1. Neues Terminal öffnen oder 'source /etc/environment' ausführen"
echo "   2. Node.js-Server starten mit 'npm start'"
echo "" 