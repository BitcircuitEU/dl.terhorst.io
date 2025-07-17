#!/bin/bash

# UUP Dump Frontend Deployment Script für Debian 12
# Automatisierte Einrichtung des kompletten Systems

set -e

echo "🚀 UUP Dump Frontend Deployment startet..."

# Konfiguration
DOMAIN="dl.terhorst.io"
APP_DIR="/opt/uup-frontend"
NODE_USER="uupfrontend"
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
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "🔄 Installiere neuere Node.js Version..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi

echo "👤 Erstelle System-User..."
if ! id "$NODE_USER" &>/dev/null; then
    useradd --system --shell /bin/bash --home "$APP_DIR" --create-home "$NODE_USER"
fi

echo "📁 Setup Application Directory..."
mkdir -p "$APP_DIR"
cp -r ./* "$APP_DIR/"
chown -R "$NODE_USER:$NODE_USER" "$APP_DIR"

echo "📦 Installiere Node.js Dependencies..."
cd "$APP_DIR"
sudo -u "$NODE_USER" npm install
sudo -u "$NODE_USER" npm run install-client

echo "🏗️ Build React Frontend..."
sudo -u "$NODE_USER" npm run build

echo "⚙️ Setup UUP Dump Tools..."
./scripts/install-uup-dump.sh

echo "🔐 Setup Apache Authentication..."
# Erstelle htpasswd-Datei (Benutzer muss Passwort später setzen)
if [ ! -f /etc/apache2/.htpasswd ]; then
    touch /etc/apache2/.htpasswd
    echo "⚠️  WICHTIG: Setzen Sie das Apache-Passwort mit:"
    echo "   sudo htpasswd /etc/apache2/.htpasswd admin"
fi

echo "🌐 Konfiguriere Apache..."
# Aktiviere notwendige Module
a2enmod ssl
a2enmod proxy
a2enmod proxy_http
a2enmod proxy_wstunnel
a2enmod rewrite
a2enmod headers

# Kopiere Site-Konfiguration
cp config/apache-site.conf /etc/apache2/sites-available/"$DOMAIN".conf

# Deaktiviere Default Site und aktiviere unsere
a2dissite 000-default
a2ensite "$DOMAIN"

echo "🔧 Erstelle Systemd Service..."
cat > /etc/systemd/system/"$SERVICE_NAME".service << EOF
[Unit]
Description=UUP Dump Frontend
After=network.target

[Service]
Type=simple
User=$NODE_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3001

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$APP_DIR /tmp /mnt/onedrive

[Install]
WantedBy=multi-user.target
EOF

echo "🔥 Setup Firewall..."
ufw --force enable
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp

echo "🚀 Starte Services..."
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl start "$SERVICE_NAME"

# Apache neustarten
systemctl restart apache2

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

chown "$NODE_USER:$NODE_USER" "$APP_DIR/.env"

echo "🔒 Setup SSL mit Let's Encrypt..."
read -p "Möchten Sie SSL-Zertifikate mit Let's Encrypt einrichten? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Temporär HTTP-Only Konfiguration für Certbot
    sed -i 's|SSLCertificateFile.*|# SSLCertificateFile /path/to/your/ssl.crt|' /etc/apache2/sites-available/"$DOMAIN".conf
    sed -i 's|SSLCertificateKeyFile.*|# SSLCertificateKeyFile /path/to/your/ssl.key|' /etc/apache2/sites-available/"$DOMAIN".conf
    systemctl reload apache2
    
    # Hole SSL-Zertifikat
    certbot --apache -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --email admin@"$DOMAIN"
else
    echo "⚠️  SSL-Setup übersprungen. Bitte konfigurieren Sie SSL manuell."
fi

echo "📊 Status Check..."
systemctl status "$SERVICE_NAME" --no-pager
systemctl status apache2 --no-pager

echo ""
echo "🎉 Deployment abgeschlossen!"
echo ""
echo "📋 Zusammenfassung:"
echo "   🌐 Website: https://$DOMAIN"
echo "   📁 App-Verzeichnis: $APP_DIR"
echo "   👤 Service-User: $NODE_USER"
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