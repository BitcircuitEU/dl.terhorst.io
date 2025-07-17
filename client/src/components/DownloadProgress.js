import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  LinearProgress,
  Box,
  Typography,
  Chip,
  Card,
  CardContent
} from '@mui/material';
import {
  CloudDownload,
  Build,
  DriveFileMoveOutline,
  CheckCircle
} from '@mui/icons-material';

function DownloadProgress({ progress }) {
  if (!progress) return null;

  const getStageIcon = (stage) => {
    switch (stage) {
      case 'init':
      case 'download':
        return <CloudDownload />;
      case 'convert':
        return <Build />;
      case 'move':
        return <DriveFileMoveOutline />;
      case 'complete':
        return <CheckCircle />;
      default:
        return <CloudDownload />;
    }
  };

  const getStageLabel = (stage) => {
    switch (stage) {
      case 'init':
        return 'Initialisierung';
      case 'download':
        return 'Download';
      case 'convert':
        return 'ISO-Erstellung';
      case 'move':
        return 'Verschieben';
      case 'complete':
        return 'Abgeschlossen';
      default:
        return 'Verarbeitung';
    }
  };

  const getStageColor = (stage) => {
    switch (stage) {
      case 'init':
        return 'info';
      case 'download':
        return 'primary';
      case 'convert':
        return 'warning';
      case 'move':
        return 'secondary';
      case 'complete':
        return 'success';
      default:
        return 'default';
    }
  };

  return (
    <Dialog 
      open={true} 
      maxWidth="sm" 
      fullWidth
      disableBackdropClick
      disableEscapeKeyDown
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {getStageIcon(progress.stage)}
          <Typography variant="h6" sx={{ ml: 1 }}>
            Windows ISO wird erstellt
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Chip
                icon={getStageIcon(progress.stage)}
                label={getStageLabel(progress.stage)}
                color={getStageColor(progress.stage)}
                variant="filled"
              />
              <Typography variant="h6" color="primary">
                {Math.round(progress.progress)}%
              </Typography>
            </Box>
            
            <LinearProgress
              variant="determinate"
              value={progress.progress}
              sx={{
                height: 8,
                borderRadius: 4,
                mb: 2,
                '& .MuiLinearProgress-bar': {
                  borderRadius: 4,
                }
              }}
            />
            
            <DialogContentText sx={{ textAlign: 'center' }}>
              {progress.message}
            </DialogContentText>
          </CardContent>
        </Card>

        {/* Phasen-Übersicht */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ textAlign: 'center', opacity: progress.stage === 'init' || progress.stage === 'download' ? 1 : 0.6 }}>
            <CloudDownload sx={{ fontSize: 32, color: progress.stage === 'download' ? 'primary.main' : 'text.secondary' }} />
            <Typography variant="caption" display="block">
              Download
            </Typography>
          </Box>
          
          <Box sx={{ flex: 1, mx: 1 }}>
            <LinearProgress
              variant="determinate"
              value={progress.stage === 'init' || progress.stage === 'download' ? progress.progress : 100}
              sx={{ height: 4 }}
            />
          </Box>
          
          <Box sx={{ textAlign: 'center', opacity: progress.stage === 'convert' ? 1 : 0.6 }}>
            <Build sx={{ fontSize: 32, color: progress.stage === 'convert' ? 'warning.main' : 'text.secondary' }} />
            <Typography variant="caption" display="block">
              Erstellen
            </Typography>
          </Box>
          
          <Box sx={{ flex: 1, mx: 1 }}>
            <LinearProgress
              variant="determinate"
              value={progress.stage === 'convert' ? progress.progress - 33.33 : progress.stage === 'move' ? 100 : 0}
              sx={{ height: 4 }}
            />
          </Box>
          
          <Box sx={{ textAlign: 'center', opacity: progress.stage === 'move' ? 1 : 0.6 }}>
            <DriveFileMoveOutline sx={{ fontSize: 32, color: progress.stage === 'move' ? 'secondary.main' : 'text.secondary' }} />
            <Typography variant="caption" display="block">
              Speichern
            </Typography>
          </Box>
        </Box>

        <Box sx={{ mt: 2, p: 2, backgroundColor: 'grey.900', borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            Status: {getStageLabel(progress.stage)}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            Fortschritt: {Math.round(progress.progress)}%
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

export default DownloadProgress; 