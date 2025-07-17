import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Grid,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Search,
  Download,
  Refresh,
  ExpandMore,
  Windows,
  Computer,
  Language,
  Edit
} from '@mui/icons-material';
import axios from 'axios';
import moment from 'moment';

function BuildsTab({ socket }) {
  const [builds, setBuilds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBuild, setSelectedBuild] = useState(null);
  const [downloadDialog, setDownloadDialog] = useState(false);
  const [languages, setLanguages] = useState([]);
  const [editions, setEditions] = useState([]);
  const [selectedLang, setSelectedLang] = useState('de-de');
  const [selectedEdition, setSelectedEdition] = useState('');
  const [langLoading, setLangLoading] = useState(false);
  const [editionLoading, setEditionLoading] = useState(false);
  const [error, setError] = useState('');

  // Filtere Builds basierend auf Suchbegriff
  const filteredBuilds = builds.filter(build =>
    build.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    build.build.toLowerCase().includes(searchTerm.toLowerCase()) ||
    build.arch.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Lade verfügbare Builds
  const loadBuilds = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get('/api/builds?sortByDate=1');
      if (response.data.response && response.data.response.builds) {
        setBuilds(response.data.response.builds);
      } else {
        setError('Keine Builds gefunden');
      }
    } catch (error) {
      console.error('Fehler beim Laden der Builds:', error);
      setError('Fehler beim Laden der Builds');
    } finally {
      setLoading(false);
    }
  };

  // Lade neue Updates von Windows Update
  const fetchNewUpdates = async () => {
    setLoading(true);
    setError('');
    try {
      await axios.get('/api/fetch-updates?arch=amd64&ring=Retail');
      // Nach dem Fetch neue Builds laden
      await loadBuilds();
    } catch (error) {
      console.error('Fehler beim Abrufen neuer Updates:', error);
      setError('Fehler beim Abrufen neuer Updates');
    } finally {
      setLoading(false);
    }
  };

  // Lade Sprachen für ausgewählten Build
  const loadLanguages = async (buildId) => {
    setLangLoading(true);
    try {
      const response = await axios.get(`/api/languages/${buildId}`);
      if (response.data.response) {
        setLanguages(response.data.response.langList || []);
        // Setze Deutsch als Standard, falls verfügbar
        if (response.data.response.langList.includes('de-de')) {
          setSelectedLang('de-de');
        } else if (response.data.response.langList.length > 0) {
          setSelectedLang(response.data.response.langList[0]);
        }
      }
    } catch (error) {
      console.error('Fehler beim Laden der Sprachen:', error);
    } finally {
      setLangLoading(false);
    }
  };

  // Lade Editionen für ausgewählten Build und Sprache
  const loadEditions = async (buildId, lang) => {
    if (!lang) return;
    
    setEditionLoading(true);
    try {
      const response = await axios.get(`/api/editions/${buildId}/${lang}`);
      if (response.data.response) {
        setEditions(response.data.response.editionList || []);
        // Setze Professional als Standard, falls verfügbar
        if (response.data.response.editionList.includes('PROFESSIONAL')) {
          setSelectedEdition('PROFESSIONAL');
        } else if (response.data.response.editionList.length > 0) {
          setSelectedEdition(response.data.response.editionList[0]);
        }
      }
    } catch (error) {
      console.error('Fehler beim Laden der Editionen:', error);
    } finally {
      setEditionLoading(false);
    }
  };

  // Öffne Download-Dialog
  const openDownloadDialog = async (build) => {
    setSelectedBuild(build);
    setDownloadDialog(true);
    await loadLanguages(build.uuid);
  };

  // Starte Download
  const startDownload = async () => {
    if (!selectedBuild || !socket) return;

    try {
      await axios.post(`/api/download/${selectedBuild.uuid}`, {
        lang: selectedLang,
        edition: selectedEdition,
        socketId: socket.id
      });
      setDownloadDialog(false);
    } catch (error) {
      console.error('Fehler beim Starten des Downloads:', error);
      setError('Fehler beim Starten des Downloads');
    }
  };

  // Sprache geändert
  const handleLanguageChange = (event) => {
    const newLang = event.target.value;
    setSelectedLang(newLang);
    if (selectedBuild) {
      loadEditions(selectedBuild.uuid, newLang);
    }
  };

  useEffect(() => {
    loadBuilds();
  }, []);

  useEffect(() => {
    if (selectedLang && selectedBuild) {
      loadEditions(selectedBuild.uuid, selectedLang);
    }
  }, [selectedLang, selectedBuild]);

  const formatDate = (timestamp) => {
    return moment.unix(timestamp).format('DD.MM.YYYY HH:mm');
  };

  const getArchIcon = (arch) => {
    return <Computer />;
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
        <TextField
          label="Builds durchsuchen"
          variant="outlined"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />
          }}
          sx={{ flexGrow: 1 }}
        />
        <Button
          variant="contained"
          onClick={fetchNewUpdates}
          disabled={loading}
          startIcon={<Refresh />}
        >
          Updates Laden
        </Button>
        <Button
          variant="outlined"
          onClick={loadBuilds}
          disabled={loading}
          startIcon={<Refresh />}
        >
          Aktualisieren
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      )}

      <Grid container spacing={2}>
        {filteredBuilds.map((build) => (
          <Grid item xs={12} md={6} lg={4} key={build.uuid}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                transition: 'transform 0.2s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                }
              }}
            >
              <CardContent sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Windows sx={{ mr: 1, color: 'primary.main' }} />
                  <Typography variant="h6" noWrap>
                    {build.title}
                  </Typography>
                </Box>
                
                <Box sx={{ mb: 2 }}>
                  <Chip
                    icon={<Computer />}
                    label={build.arch}
                    size="small"
                    sx={{ mr: 1, mb: 1 }}
                  />
                  <Chip
                    label={build.build}
                    size="small"
                    color="primary"
                    sx={{ mb: 1 }}
                  />
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Erstellt: {formatDate(build.created)}
                </Typography>

                <Button
                  variant="contained"
                  fullWidth
                  startIcon={<Download />}
                  onClick={() => openDownloadDialog(build)}
                >
                  Herunterladen
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {filteredBuilds.length === 0 && !loading && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="h6" color="text.secondary">
            Keine Builds gefunden
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Versuchen Sie einen anderen Suchbegriff oder laden Sie Updates.
          </Typography>
        </Box>
      )}

      {/* Download-Dialog */}
      <Dialog open={downloadDialog} onClose={() => setDownloadDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Download sx={{ mr: 1 }} />
            ISO herunterladen
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedBuild && (
            <Box sx={{ pt: 1 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                {selectedBuild.title}
              </Typography>
              
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Sprache</InputLabel>
                <Select
                  value={selectedLang}
                  onChange={handleLanguageChange}
                  disabled={langLoading}
                  label="Sprache"
                >
                  {languages.map((lang) => (
                    <MenuItem key={lang} value={lang}>
                      {lang}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Edition</InputLabel>
                <Select
                  value={selectedEdition}
                  onChange={(e) => setSelectedEdition(e.target.value)}
                  disabled={editionLoading}
                  label="Edition"
                >
                  {editions.map((edition) => (
                    <MenuItem key={edition} value={edition}>
                      {edition}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {(langLoading || editionLoading) && (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDownloadDialog(false)}>
            Abbrechen
          </Button>
          <Button
            variant="contained"
            onClick={startDownload}
            disabled={!selectedEdition || langLoading || editionLoading}
            startIcon={<Download />}
          >
            Download starten
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default BuildsTab; 