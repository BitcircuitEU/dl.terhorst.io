const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

class UUPWrapper {
  constructor(socket, workDir, finalIsoPath, buildName) {
    this.socket = socket;
    this.workDir = workDir;
    this.finalIsoPath = finalIsoPath;
    this.buildName = buildName;
    this.currentProgress = 0;
    this.currentStage = 'init';
  }

  async downloadAndCreateISO(downloadData) {
    try {
      await this.createConfigFile(downloadData);
      await this.downloadFiles();
      await this.convertToISO();
      await this.moveToFinalLocation();
      
      this.socket.emit('download_complete', {
        message: 'Download erfolgreich abgeschlossen',
        filename: `${this.buildName}.iso`,
        path: this.finalIsoPath
      });
    } catch (error) {
      throw error;
    }
  }

  async createConfigFile(downloadData) {
    this.emitProgress('init', 'Erstelle Download-Konfiguration...', 5);
    
    // Erstelle die aria2-Input-Datei
    const aria2InputFile = path.join(this.workDir, 'aria2_script.txt');
    const downloadList = [];
    
    for (const [filename, fileData] of Object.entries(downloadData.files)) {
      if (fileData.url && fileData.url !== 'null') {
        downloadList.push(`${fileData.url}\n  out=${filename}\n  checksum=sha-1=${fileData.sha1}`);
      }
    }
    
    await fs.writeFile(aria2InputFile, downloadList.join('\n\n'));
    this.aria2InputFile = aria2InputFile;
  }

  async downloadFiles() {
    this.emitProgress('download', 'Dateien werden heruntergeladen...', 10);
    
    return new Promise((resolve, reject) => {
      const aria2Process = spawn('aria2c', [
        '--input-file=' + this.aria2InputFile,
        '--dir=' + this.workDir,
        '--continue=true',
        '--max-connection-per-server=16',
        '--split=16',
        '--min-split-size=1M',
        '--file-allocation=none',
        '--summary-interval=1',
        '--download-result=full'
      ]);

      let downloadProgress = 10;
      
      aria2Process.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('aria2c stdout:', output);
        
        // Parse Download-Progress aus aria2c Output
        const progressMatch = output.match(/\((\d+)%\)/);
        if (progressMatch) {
          const percentage = parseInt(progressMatch[1]);
          downloadProgress = 10 + (percentage * 0.6); // 10% bis 70%
          this.emitProgress('download', `Dateien werden heruntergeladen... ${percentage}%`, downloadProgress);
        }
      });

      aria2Process.stderr.on('data', (data) => {
        console.error('aria2c stderr:', data.toString());
      });

      aria2Process.on('close', (code) => {
        if (code === 0) {
          this.emitProgress('download', 'Download abgeschlossen', 70);
          resolve();
        } else {
          reject(new Error(`aria2c beendet mit Code ${code}`));
        }
      });
    });
  }

  async convertToISO() {
    this.emitProgress('convert', 'ISO wird erstellt...', 75);
    
    return new Promise((resolve, reject) => {
      // Verwende das neue API-basierte ISO-Erstellungs-Script
      const convertScript = '/usr/local/bin/uup-create-iso';
      
      if (!fs.existsSync(convertScript)) {
        reject(new Error('UUP ISO Creator nicht gefunden. Bitte führen Sie scripts/deploy.sh erneut aus.'));
        return;
      }
      
      // Bestimme Output-Dateiname
      const outputIso = path.join(this.workDir, `${this.buildName}.iso`);
      
      const convertProcess = spawn('bash', [convertScript, this.workDir, outputIso], {
        cwd: this.workDir,
        env: {
          ...process.env,
          UUP_WORK_DIR: '/opt/uup-work'
        }
      });

      let convertProgress = 75;
      
      convertProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('ISO creator stdout:', output);
        
        // Progress-Parser für ISO-Erstellung
        if (output.includes('Windows-Dateien gefunden')) {
          convertProgress = 80;
          this.emitProgress('convert', 'Windows-Dateien gefunden, erstelle ISO...', convertProgress);
        } else if (output.includes('genisoimage')) {
          convertProgress = 85;
          this.emitProgress('convert', 'ISO wird zusammengestellt...', convertProgress);
        } else if (output.includes('ISO erstellt')) {
          convertProgress = 95;
          this.emitProgress('convert', 'ISO-Erstellung abgeschlossen', convertProgress);
        }
      });

      convertProcess.stderr.on('data', (data) => {
        const errorOutput = data.toString();
        console.error('ISO creator stderr:', errorOutput);
        
        // Genisoimage progress parsing (wird normalerweise zu stderr geschrieben)
        if (errorOutput.includes('%')) {
          const progressMatch = errorOutput.match(/(\d+(?:\.\d+)?)%/);
          if (progressMatch) {
            const percentage = parseFloat(progressMatch[1]);
            convertProgress = 80 + (percentage * 0.15); // 80% bis 95%
            this.emitProgress('convert', `ISO wird erstellt... ${percentage.toFixed(1)}%`, convertProgress);
          }
        }
      });

      convertProcess.on('close', (code) => {
        if (code === 0) {
          this.emitProgress('convert', 'ISO-Erstellung erfolgreich abgeschlossen', 95);
          resolve();
        } else {
          reject(new Error(`ISO-Erstellung fehlgeschlagen mit Code ${code}`));
        }
      });
    });
  }

  async moveToFinalLocation() {
    this.emitProgress('move', 'ISO wird verschoben...', 97);
    
    try {
      // Finde die erstellte ISO-Datei
      const files = await fs.readdir(this.workDir);
      const isoFile = files.find(file => file.toLowerCase().endsWith('.iso'));
      
      if (!isoFile) {
        throw new Error('Keine ISO-Datei im Arbeitsverzeichnis gefunden');
      }
      
      const sourcePath = path.join(this.workDir, isoFile);
      
      // Stelle sicher, dass das Zielverzeichnis existiert
      await fs.ensureDir(path.dirname(this.finalIsoPath));
      
      // Verschiebe die ISO-Datei
      await fs.move(sourcePath, this.finalIsoPath);
      
      this.emitProgress('move', 'ISO erfolgreich gespeichert', 100);
    } catch (error) {
      throw new Error(`Fehler beim Verschieben der ISO: ${error.message}`);
    }
  }

  emitProgress(stage, message, progress) {
    this.currentStage = stage;
    this.currentProgress = progress;
    
    this.socket.emit('download_progress', {
      stage,
      message,
      progress: Math.min(progress, 100)
    });
  }
}

// Ersetzt die simulateDownloadProcess Funktion im server/index.js
async function realDownloadProcess(socket, workDir, finalIsoPath, buildName, downloadData) {
  const wrapper = new UUPWrapper(socket, workDir, finalIsoPath, buildName);
  await wrapper.downloadAndCreateISO(downloadData);
}

module.exports = {
  UUPWrapper,
  realDownloadProcess
}; 