// UUP Dump Frontend JavaScript
class UUPDumpApp {
    constructor() {
        this.socket = null;
        this.builds = [];
        this.allBuilds = []; // Backup für Client-seitige Filterung
        this.images = [];
        this.folders = [];
        this.currentFolder = 'all';
        this.selectedBuild = null;
        this.selectedLanguage = null;
        this.selectedEdition = null;
        this.filtersVisible = false;
        this.currentFilters = {
            search: '',
            ring: '',
            arch: '',
            buildType: '',
            sort: 'date-desc'
        };
        
        this.init();
    }
    
    init() {
        this.initSocket();
        this.bindEvents();
        this.loadImages();
        // Builds werden erst geladen wenn Tab gewechselt wird
    }
    
    initSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('WebSocket verbunden');
        });
        
        this.socket.on('disconnect', () => {
            console.log('WebSocket getrennt');
        });
        
        this.socket.on('download_progress', (data) => {
            this.updateProgress(data);
        });
        
        this.socket.on('download_complete', (data) => {
            this.downloadComplete(data);
        });
        
        this.socket.on('download_error', (data) => {
            this.downloadError(data);
        });
    }
    
    bindEvents() {
        // Tab-Events
        document.getElementById('images-tab').addEventListener('click', () => {
            this.loadImages();
        });
        
        document.getElementById('builds-tab').addEventListener('click', () => {
            if (this.builds.length === 0) {
                this.loadBuilds();
            }
        });
        
        // Search-Events
        document.getElementById('searchInput').addEventListener('input', 
            this.debounce((e) => {
                this.currentFilters.search = e.target.value;
                this.applyAllFilters();
            }, 300)
        );
        
        // Filter-Events
        document.getElementById('toggleFilters').addEventListener('click', () => {
            this.toggleFiltersPanel();
        });
        
        document.getElementById('applyFilters').addEventListener('click', () => {
            this.collectFiltersAndApply();
        });
        
        document.getElementById('clearFilters').addEventListener('click', () => {
            this.clearAllFilters();
        });
        
        // Filter change events
        ['ringFilter', 'archFilter', 'buildTypeFilter', 'sortFilter'].forEach(filterId => {
            document.getElementById(filterId).addEventListener('change', (e) => {
                const filterType = filterId.replace('Filter', '');
                this.currentFilters[filterType === 'sort' ? 'sort' : filterType] = e.target.value;
            });
        });
        
        // Refresh-Events
        document.getElementById('refreshBuilds').addEventListener('click', () => {
            this.loadBuilds();
        });
        
        document.getElementById('refreshImages').addEventListener('click', () => {
            this.loadImages();
        });
        
        // Modal-Events
        document.getElementById('languageSelect').addEventListener('change', (e) => {
            this.onLanguageSelect(e.target.value);
        });
        
        document.getElementById('startDownload').addEventListener('click', () => {
            this.confirmDownload();
        });
        
        document.getElementById('closeProgress').addEventListener('click', () => {
            this.closeProgressModal();
        });
        
        // Folder Tree Events
        document.addEventListener('click', (e) => {
            if (e.target.closest('.folder-item[data-folder="all"]')) {
                this.selectFolder('all');
            }
        });
    }
    
    async loadBuilds(useFilters = false) {
        const loading = document.getElementById('buildsLoading');
        const buildsList = document.getElementById('buildsList');
        
        loading.classList.remove('d-none');
        buildsList.innerHTML = '';
        
        try {
            let url = '/api/builds';
            
            if (useFilters) {
                const params = new URLSearchParams();
                
                if (this.currentFilters.search) params.append('search', this.currentFilters.search);
                if (this.currentFilters.ring) params.append('ring', this.currentFilters.ring);
                if (this.currentFilters.arch) params.append('arch', this.currentFilters.arch);
                if (this.currentFilters.buildType) params.append('buildType', this.currentFilters.buildType);
                if (this.currentFilters.sort === 'date-asc' || this.currentFilters.sort === 'date-desc') {
                    params.append('sortByDate', this.currentFilters.sort === 'date-desc' ? '1' : '0');
                }
                
                if (params.toString()) {
                    url += '?' + params.toString();
                }
            }
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.response && data.response.builds) {
                this.allBuilds = data.response.builds;
                this.builds = [...this.allBuilds];
                
                // Client-seitige Sortierung anwenden wenn nötig
                this.applySorting();
                this.renderBuilds(this.builds);
            } else {
                this.showAlert('Keine Builds gefunden', 'warning');
            }
        } catch (error) {
            console.error('Fehler beim Laden der Builds:', error);
            this.showAlert('Fehler beim Laden der Builds', 'danger');
        }
        
        loading.classList.add('d-none');
    }
    
    async loadImages(folder = 'all') {
        const loading = document.getElementById('imagesLoading');
        const imagesList = document.getElementById('imagesList');
        const imagesEmpty = document.getElementById('imagesEmpty');
        
        loading.classList.remove('d-none');
        imagesList.innerHTML = '';
        imagesEmpty.classList.add('d-none');
        
        try {
            const url = folder === 'all' ? '/api/images' : `/api/images?folder=${encodeURIComponent(folder)}`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.images && data.images.length > 0) {
                this.images = data.images;
                this.folders = data.folders || [];
                this.currentFolder = data.currentFolder || 'all';
                
                this.renderImages(this.images);
                this.updateFolderTree();
                this.updateBreadcrumb();
                this.updateCurrentFolderTitle();
            } else {
                this.folders = data.folders || [];
                this.updateFolderTree();
                imagesEmpty.classList.remove('d-none');
            }
        } catch (error) {
            console.error('Fehler beim Laden der Images:', error);
            this.showAlert('Fehler beim Laden der Images', 'danger');
        }
        
        loading.classList.add('d-none');
    }
    
    updateFolderTree() {
        const folderTree = document.getElementById('folderTree');
        const folderLoading = folderTree.querySelector('.folder-loading');
        
        // Entferne Loading-Indikator
        if (folderLoading) {
            folderLoading.remove();
        }
        
        // Aktualisiere Anzahl für "Alle Images"
        const allCount = this.folders.reduce((sum, folder) => sum + folder.count, 0);
        const allBadge = document.getElementById('count-all');
        if (allBadge) {
            allBadge.textContent = allCount;
        }
        
        // Entferne vorhandene Ordner (außer "Alle Images")
        const existingFolders = folderTree.querySelectorAll('.folder-item:not([data-folder="all"])');
        existingFolders.forEach(item => item.remove());
        
        // Füge Ordner hinzu
        this.folders.forEach(folder => {
            if (folder.name !== 'Root') {
                const folderItem = this.createFolderItem(folder);
                folderTree.appendChild(folderItem);
            }
        });
        
        // Aktualisiere aktiven Ordner
        this.setActiveFolderItem(this.currentFolder);
    }
    
    createFolderItem(folder) {
        const item = document.createElement('div');
        item.className = `folder-item level-${folder.level}`;
        item.setAttribute('data-folder', folder.path);
        
        const folderName = folder.name === 'Root' ? 'Root' : folder.name.split(/[/\\]/).pop();
        
        item.innerHTML = `
            <div class="d-flex align-items-center flex-grow-1">
                <i class="me-2"></i>
                <span>${folderName}</span>
            </div>
            <span class="badge bg-secondary">${folder.count}</span>
        `;
        
        item.addEventListener('click', () => {
            this.selectFolder(folder.path);
        });
        
        return item;
    }
    
    setActiveFolderItem(folderPath) {
        // Entferne active von allen Items
        document.querySelectorAll('.folder-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Setze active für aktuellen Ordner
        const activeItem = document.querySelector(`[data-folder="${folderPath}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }
    }
    
    selectFolder(folder) {
        this.currentFolder = folder;
        this.loadImages(folder);
    }
    
    updateBreadcrumb() {
        const breadcrumb = document.getElementById('imageBreadcrumb');
        const breadcrumbList = breadcrumb.querySelector('.breadcrumb');
        
        if (this.currentFolder === 'all') {
            breadcrumb.classList.add('d-none');
            return;
        }
        
        breadcrumb.classList.remove('d-none');
        
        // Lösche vorhandene Breadcrumb-Items (außer Home)
        const items = breadcrumbList.querySelectorAll('.breadcrumb-item:not(:first-child)');
        items.forEach(item => item.remove());
        
        // Erstelle Pfad-Segmente
        const pathSegments = this.currentFolder.split(/[/\\]/);
        let currentPath = '';
        
        pathSegments.forEach((segment, index) => {
            currentPath += (index > 0 ? '/' : '') + segment;
            
            const li = document.createElement('li');
            li.className = 'breadcrumb-item';
            
            if (index === pathSegments.length - 1) {
                // Letztes Element ist aktiv
                li.classList.add('active');
                li.textContent = segment;
            } else {
                // Andere Elemente sind Links
                const link = document.createElement('a');
                link.href = '#';
                link.textContent = segment;
                link.setAttribute('data-folder', currentPath);
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.selectFolder(currentPath);
                });
                li.appendChild(link);
            }
            
            breadcrumbList.appendChild(li);
        });
    }
    
    updateCurrentFolderTitle() {
        const titleElement = document.getElementById('currentFolderTitle');
        
        if (this.currentFolder === 'all') {
            titleElement.textContent = 'Alle Images';
        } else {
            const folderName = this.currentFolder.split(/[/\\]/).pop();
            titleElement.textContent = folderName;
        }
    }
    
    renderBuilds(builds) {
        const buildsList = document.getElementById('buildsList');
        buildsList.innerHTML = '';
        
        if (builds.length === 0) {
            buildsList.innerHTML = `
                <div class="col-12 text-center py-5">
                    <i class="fas fa-search fa-3x text-muted mb-3"></i>
                    <h6 class="text-muted">Keine Builds gefunden</h6>
                    <p class="text-muted">Versuchen Sie eine andere Suche oder aktualisieren Sie die Liste.</p>
                </div>
            `;
            return;
        }
        
        builds.forEach(build => {
            const buildCard = this.createBuildCard(build);
            buildsList.appendChild(buildCard);
        });
    }
    
    createBuildCard(build) {
        const col = document.createElement('div');
        col.className = 'col-md-6 col-lg-4 mb-3';
        
        const date = new Date(build.created * 1000).toLocaleDateString('de-DE', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        col.innerHTML = `
            <div class="card build-card h-100 cursor-pointer" data-build-id="${build.uuid}">
                <div class="card-body">
                    <div class="build-title text-truncate-2">${build.title}</div>
                    <div class="build-info mb-2">
                        <small><i class="fas fa-calendar me-1"></i>${date}</small>
                    </div>
                    <div class="build-info mb-2">
                        <small><i class="fas fa-code-branch me-1"></i>Build ${build.build}</small>
                    </div>
                    <div class="build-meta">
                        <span class="badge build-arch">
                            <i class="fas fa-microchip me-1"></i>${build.arch}
                        </span>
                        <button class="btn btn-primary btn-sm download-btn" data-build-id="${build.uuid}">
                            <i class="fas fa-download me-1"></i>Download
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Event-Listener für Download-Button
        const downloadBtn = col.querySelector('.download-btn');
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.startBuildDownload(build);
        });
        
        return col;
    }
    
    renderImages(images) {
        const imagesList = document.getElementById('imagesList');
        imagesList.innerHTML = '';
        
        images.forEach(image => {
            const imageCard = this.createImageCard(image);
            imagesList.appendChild(imageCard);
        });
    }
    
    createImageCard(image) {
        const col = document.createElement('div');
        col.className = 'col-md-6 col-lg-4 mb-3';
        
        const size = this.formatFileSize(image.size);
        const created = new Date(image.created).toLocaleDateString('de-DE', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const modified = new Date(image.modified).toLocaleDateString('de-DE', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        
        // Icon basierend auf Dateityp
        const getTypeIcon = (type) => {
            switch(type.toLowerCase()) {
                case 'iso': return 'fas fa-compact-disc';
                case 'img': return 'fas fa-save';
                case 'wim': 
                case 'esd': return 'fas fa-archive';
                case 'vhd':
                case 'vhdx': return 'fas fa-hdd';
                default: return 'fas fa-file';
            }
        };
        
        col.innerHTML = `
            <div class="card image-card h-100">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div class="image-title text-truncate-2 flex-grow-1">${image.name}</div>
                        <span class="badge bg-primary ms-2">
                            <i class="${getTypeIcon(image.type)} me-1"></i>${image.type}
                        </span>
                    </div>
                    
                    ${image.category !== 'Root' ? `
                        <div class="image-info mb-2">
                            <small><i class="fas fa-folder me-1"></i>${image.category}</small>
                        </div>
                    ` : ''}
                    
                    <div class="image-info mb-2">
                        <small><i class="fas fa-hdd me-1"></i>${size}</small>
                    </div>
                    <div class="image-info mb-2">
                        <small><i class="fas fa-calendar me-1"></i>Erstellt: ${created}</small>
                    </div>
                    <div class="image-info mb-3">
                        <small><i class="fas fa-clock me-1"></i>Geändert: ${modified}</small>
                    </div>
                    <div class="image-actions">
                        <a href="${image.path}" class="btn btn-outline-primary btn-sm" download>
                            <i class="fas fa-download me-1"></i>Download
                        </a>
                        <button class="btn btn-outline-danger btn-sm delete-btn" data-filepath="${image.fullPath}">
                            <i class="fas fa-trash me-1"></i>Löschen
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Event-Listener für Löschen-Button
        const deleteBtn = col.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', () => {
            this.deleteImage(image.fullPath, image.name);
        });
        
        return col;
    }
    
    async startBuildDownload(build) {
        this.selectedBuild = build;
        
        // Modal anzeigen und Sprachen laden
        const modal = new bootstrap.Modal(document.getElementById('selectionModal'));
        modal.show();
        
        await this.loadLanguages(build.uuid);
    }
    
    async loadLanguages(buildId) {
        const languageSelect = document.getElementById('languageSelect');
        languageSelect.innerHTML = '<option value="">Sprachen werden geladen...</option>';
        
        try {
            const response = await fetch(`/api/languages/${buildId}`);
            const data = await response.json();
            
            languageSelect.innerHTML = '<option value="">Sprache auswählen...</option>';
            
            if (data.response && data.response.langList) {
                Object.entries(data.response.langList).forEach(([code, name]) => {
                    const option = document.createElement('option');
                    option.value = code;
                    option.textContent = name;
                    
                    // Deutsche Sprache vorauswählen
                    if (code === 'de-de') {
                        option.selected = true;
                        this.onLanguageSelect(code);
                    }
                    
                    languageSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Fehler beim Laden der Sprachen:', error);
            languageSelect.innerHTML = '<option value="">Fehler beim Laden</option>';
        }
    }
    
    async onLanguageSelect(langCode) {
        this.selectedLanguage = langCode;
        const editionSelect = document.getElementById('editionSelect');
        const startButton = document.getElementById('startDownload');
        
        if (!langCode) {
            editionSelect.disabled = true;
            editionSelect.innerHTML = '<option value="">Erst Sprache auswählen</option>';
            startButton.disabled = true;
            return;
        }
        
        editionSelect.disabled = false;
        editionSelect.innerHTML = '<option value="">Editionen werden geladen...</option>';
        
        try {
            const response = await fetch(`/api/editions/${this.selectedBuild.uuid}/${langCode}`);
            const data = await response.json();
            
            editionSelect.innerHTML = '<option value="">Edition auswählen...</option>';
            
            if (data.response && data.response.editionList) {
                Object.entries(data.response.editionList).forEach(([code, name]) => {
                    const option = document.createElement('option');
                    option.value = code;
                    option.textContent = name;
                    
                    // Professional vorauswählen
                    if (code === 'Professional' || name.includes('Professional')) {
                        option.selected = true;
                        this.selectedEdition = code;
                        startButton.disabled = false;
                    }
                    
                    editionSelect.appendChild(option);
                });
            }
            
            // Event-Listener für Edition-Auswahl
            editionSelect.addEventListener('change', (e) => {
                this.selectedEdition = e.target.value;
                startButton.disabled = !e.target.value;
            });
            
        } catch (error) {
            console.error('Fehler beim Laden der Editionen:', error);
            editionSelect.innerHTML = '<option value="">Fehler beim Laden</option>';
        }
    }
    
    async confirmDownload() {
        const selectionModal = bootstrap.Modal.getInstance(document.getElementById('selectionModal'));
        selectionModal.hide();
        
        // Progress Modal anzeigen
        const progressModal = new bootstrap.Modal(document.getElementById('progressModal'));
        progressModal.show();
        
        document.getElementById('closeProgress').disabled = true;
        
        try {
            const response = await fetch(`/api/download/${this.selectedBuild.uuid}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    lang: this.selectedLanguage,
                    edition: this.selectedEdition,
                    socketId: this.socket.id
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Download-Fehler');
            }
            
            this.showAlert(`Download gestartet: ${data.buildName}`, 'success');
            
        } catch (error) {
            console.error('Download-Fehler:', error);
            this.showAlert(`Download-Fehler: ${error.message}`, 'danger');
            this.closeProgressModal();
        }
    }
    
    updateProgress(data) {
        const progressContent = document.getElementById('progressContent');
        
        if (data.stage === 'init') {
            progressContent.innerHTML = this.createProgressStages();
        }
        
        this.updateProgressStage(data.stage, data.message, data.progress);
    }
    
    createProgressStages() {
        return `
            <div class="progress-stage" id="stage-init">
                <div class="stage-icon">
                    <i class="fas fa-cog"></i>
                </div>
                <div class="stage-details">
                    <div class="stage-title">Vorbereitung</div>
                    <div class="stage-description">Download wird vorbereitet...</div>
                </div>
            </div>
            
            <div class="progress-stage" id="stage-download">
                <div class="stage-icon">
                    <i class="fas fa-download"></i>
                </div>
                <div class="stage-details">
                    <div class="stage-title">Download</div>
                    <div class="stage-description">Dateien werden heruntergeladen...</div>
                    <div class="progress mt-2">
                        <div class="progress-bar" id="download-progress" style="width: 0%"></div>
                    </div>
                </div>
            </div>
            
            <div class="progress-stage" id="stage-convert">
                <div class="stage-icon">
                    <i class="fas fa-compact-disc"></i>
                </div>
                <div class="stage-details">
                    <div class="stage-title">ISO erstellen</div>
                    <div class="stage-description">ISO-Datei wird erstellt...</div>
                </div>
            </div>
            
            <div class="progress-stage" id="stage-complete">
                <div class="stage-icon">
                    <i class="fas fa-check"></i>
                </div>
                <div class="stage-details">
                    <div class="stage-title">Abgeschlossen</div>
                    <div class="stage-description">Download erfolgreich beendet.</div>
                </div>
            </div>
        `;
    }
    
    updateProgressStage(stage, message, progress) {
        // Alle Stages deaktivieren
        document.querySelectorAll('.progress-stage').forEach(el => {
            el.classList.remove('active', 'completed');
        });
        
        // Aktuelle Stage aktivieren
        const currentStage = document.getElementById(`stage-${stage}`);
        if (currentStage) {
            currentStage.classList.add('active');
            
            // Beschreibung aktualisieren
            const description = currentStage.querySelector('.stage-description');
            if (description) {
                description.textContent = message;
            }
            
            // Progress Bar aktualisieren für Download
            if (stage === 'download' && progress !== undefined) {
                const progressBar = document.getElementById('download-progress');
                if (progressBar) {
                    progressBar.style.width = `${progress}%`;
                    progressBar.textContent = `${Math.round(progress)}%`;
                }
            }
        }
        
        // Vorherige Stages als abgeschlossen markieren
        const stages = ['init', 'download', 'convert', 'complete'];
        const currentIndex = stages.indexOf(stage);
        
        for (let i = 0; i < currentIndex; i++) {
            const prevStage = document.getElementById(`stage-${stages[i]}`);
            if (prevStage) {
                prevStage.classList.add('completed');
            }
        }
    }
    
    downloadComplete(data) {
        this.updateProgressStage('complete', 'Download erfolgreich abgeschlossen!', 100);
        document.getElementById('closeProgress').disabled = false;
        
        this.showAlert(`ISO erstellt: ${data.filename}`, 'success');
        
        // Images neu laden
        setTimeout(() => {
            this.loadImages();
        }, 1000);
    }
    
    downloadError(data) {
        const progressContent = document.getElementById('progressContent');
        progressContent.innerHTML = `
            <div class="alert alert-danger">
                <h6><i class="fas fa-exclamation-triangle me-2"></i>Download fehlgeschlagen</h6>
                <p class="mb-0">${data.error}</p>
                ${data.details ? `<small class="text-muted">${data.details}</small>` : ''}
            </div>
        `;
        
        document.getElementById('closeProgress').disabled = false;
        this.showAlert(`Download fehlgeschlagen: ${data.error}`, 'danger');
    }
    
    closeProgressModal() {
        const progressModal = bootstrap.Modal.getInstance(document.getElementById('progressModal'));
        if (progressModal) {
            progressModal.hide();
        }
    }
    
    async deleteImage(fullPath, filename) {
        if (!confirm(`Möchten Sie das Image "${filename}" wirklich löschen?`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/images/${encodeURIComponent(fullPath)}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showAlert('Image erfolgreich gelöscht', 'success');
                this.loadImages();
            } else {
                throw new Error(data.error || 'Lösch-Fehler');
            }
        } catch (error) {
            console.error('Fehler beim Löschen:', error);
            this.showAlert(`Fehler beim Löschen: ${error.message}`, 'danger');
        }
    }
    
    toggleFiltersPanel() {
        const filtersPanel = document.getElementById('advancedFilters');
        const toggleBtn = document.getElementById('toggleFilters');
        
        this.filtersVisible = !this.filtersVisible;
        
        if (this.filtersVisible) {
            filtersPanel.style.display = 'block';
            toggleBtn.innerHTML = '<i class="fas fa-filter me-2"></i>Filter ausblenden';
            setTimeout(() => filtersPanel.classList.add('show'), 10);
        } else {
            filtersPanel.style.display = 'none';
            toggleBtn.innerHTML = '<i class="fas fa-filter me-2"></i>Filter';
            filtersPanel.classList.remove('show');
        }
    }
    
    collectFiltersAndApply() {
        this.currentFilters.ring = document.getElementById('ringFilter').value;
        this.currentFilters.arch = document.getElementById('archFilter').value;
        this.currentFilters.buildType = document.getElementById('buildTypeFilter').value;
        this.currentFilters.sort = document.getElementById('sortFilter').value;
        
        this.loadBuilds(true);
    }
    
    clearAllFilters() {
        // Reset all filter values
        this.currentFilters = {
            search: '',
            ring: '',
            arch: '',
            buildType: '',
            sort: 'date-desc'
        };
        
        // Reset UI elements
        document.getElementById('searchInput').value = '';
        document.getElementById('ringFilter').value = '';
        document.getElementById('archFilter').value = '';
        document.getElementById('buildTypeFilter').value = '';
        document.getElementById('sortFilter').value = 'date-desc';
        
        // Reload builds without filters
        this.loadBuilds(false);
    }
    
    applyAllFilters() {
        // Client-seitige Filterung basierend auf aktuell geladenen Builds
        let filteredBuilds = [...this.allBuilds];
        
        // Suchfilter
        if (this.currentFilters.search && this.currentFilters.search.trim()) {
            const searchLower = this.currentFilters.search.toLowerCase();
            filteredBuilds = filteredBuilds.filter(build => 
                build.title.toLowerCase().includes(searchLower) ||
                build.build.toString().includes(searchLower) ||
                build.arch.toLowerCase().includes(searchLower)
            );
        }
        
        this.builds = filteredBuilds;
        this.applySorting();
        this.renderBuilds(this.builds);
    }
    
    applySorting() {
        switch (this.currentFilters.sort) {
            case 'date-asc':
                this.builds.sort((a, b) => new Date(a.created * 1000) - new Date(b.created * 1000));
                break;
            case 'date-desc':
                this.builds.sort((a, b) => new Date(b.created * 1000) - new Date(a.created * 1000));
                break;
            case 'build-asc':
                this.builds.sort((a, b) => parseInt(a.build) - parseInt(b.build));
                break;
            case 'build-desc':
                this.builds.sort((a, b) => parseInt(b.build) - parseInt(a.build));
                break;
            case 'title-asc':
                this.builds.sort((a, b) => a.title.localeCompare(b.title, 'de'));
                break;
            case 'title-desc':
                this.builds.sort((a, b) => b.title.localeCompare(a.title, 'de'));
                break;
        }
    }
    
    showAlert(message, type = 'info') {
        const alertContainer = document.getElementById('alertContainer');
        
        const alertElement = document.createElement('div');
        alertElement.className = `alert alert-${type} alert-dismissible fade show`;
        alertElement.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        alertContainer.appendChild(alertElement);
        
        // Auto-remove nach 5 Sekunden
        setTimeout(() => {
            if (alertElement.parentNode) {
                const alert = bootstrap.Alert.getInstance(alertElement);
                if (alert) {
                    alert.close();
                }
            }
        }, 5000);
    }
    
    formatFileSize(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0) return '0 Bytes';
        
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }
    
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// App initialisieren wenn DOM geladen ist
document.addEventListener('DOMContentLoaded', () => {
    new UUPDumpApp();
}); 