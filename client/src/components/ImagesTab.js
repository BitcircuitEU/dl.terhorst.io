import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Alert,
  CircularProgress,
  Tooltip,
  Link
} from '@mui/material';
import {
  Download,
  Delete,
  Refresh,
  Folder,
  Storage,
  CalendarToday,
  FileDownload
} from '@mui/icons-material';
import axios from 'axios';
import moment from 'moment';

function ImagesTab() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Lade vorhandene Images
  const loadImages = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get('/api/images');
      setImages(response.data.images || []);
    } catch (error) {
      console.error('Fehler beim Laden der Images:', error);
      setError('Fehler beim Laden der Images');
    } finally {
      setLoading(false);
    }
  };

  // Lösche Image
  const deleteImage = async () => {
    if (!selectedImage) return;

    try {
      await axios.delete(`/api/images/${selectedImage.name}`);
      setSuccess(`Image "${selectedImage.name}" wurde erfolgreich gelöscht`);
      setDeleteDialog(false);
      setSelectedImage(null);
      await loadImages(); // Reload nach Löschung
    } catch (error) {
      console.error('Fehler beim Löschen des Images:', error);
      setError('Fehler beim Löschen des Images');
      setDeleteDialog(false);
    }
  };

  // Öffne Lösch-Dialog
  const openDeleteDialog = (image) => {
    setSelectedImage(image);
    setDeleteDialog(true);
  };

  // Formatiere Dateigröße
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Formatiere Datum
  const formatDate = (dateString) => {
    return moment(dateString).format('DD.MM.YYYY HH:mm');
  };

  // Extrahiere Windows-Version aus Dateiname
  const extractWindowsInfo = (filename) => {
    // Vereinfachte Extraktion - kann erweitert werden
    if (filename.toLowerCase().includes('windows')) {
      if (filename.includes('11')) return { version: 'Windows 11', color: 'primary' };
      if (filename.includes('10')) return { version: 'Windows 10', color: 'secondary' };
      return { version: 'Windows', color: 'default' };
    }
    return { version: 'Unbekannt', color: 'default' };
  };

  useEffect(() => {
    loadImages();
  }, []);

  // Automatisches Verstecken von Success-Nachrichten
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5" component="h2">
          Meine Windows Images
        </Typography>
        <Button
          variant="outlined"
          onClick={loadImages}
          disabled={loading}
          startIcon={<Refresh />}
        >
          Aktualisieren
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      )}

      {images.length === 0 && !loading && (
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <Folder sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            Keine Images vorhanden
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Erstellen Sie Ihr erstes Windows-Image über den "Windows Builds" Tab.
          </Typography>
        </Card>
      )}

      <Grid container spacing={3}>
        {images.map((image, index) => {
          const windowsInfo = extractWindowsInfo(image.name);
          
          return (
            <Grid item xs={12} md={6} lg={4} key={index}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'transform 0.2s, elevation 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    elevation: 8
                  }
                }}
              >
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Storage sx={{ mr: 1, color: 'primary.main' }} />
                    <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
                      {image.name}
                    </Typography>
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Chip
                      label={windowsInfo.version}
                      color={windowsInfo.color}
                      size="small"
                      sx={{ mr: 1, mb: 1 }}
                    />
                    <Chip
                      icon={<Storage />}
                      label={formatFileSize(image.size)}
                      size="small"
                      variant="outlined"
                      sx={{ mb: 1 }}
                    />
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <CalendarToday sx={{ mr: 1, fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(image.created)}
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                    <Button
                      component={Link}
                      href={image.path}
                      target="_blank"
                      variant="contained"
                      size="small"
                      startIcon={<FileDownload />}
                      sx={{ flexGrow: 1 }}
                    >
                      Download
                    </Button>
                    
                    <Tooltip title="Image löschen">
                      <IconButton
                        color="error"
                        onClick={() => openDeleteDialog(image)}
                        size="small"
                      >
                        <Delete />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Lösch-Bestätigungs-Dialog */}
      <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)}>
        <DialogTitle sx={{ color: 'error.main' }}>
          Image löschen
        </DialogTitle>
        <DialogContent>
          <Typography>
            Sind Sie sicher, dass Sie das Image "{selectedImage?.name}" löschen möchten?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Diese Aktion kann nicht rückgängig gemacht werden.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)}>
            Abbrechen
          </Button>
          <Button 
            onClick={deleteImage} 
            color="error" 
            variant="contained"
            startIcon={<Delete />}
          >
            Löschen
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ImagesTab; 