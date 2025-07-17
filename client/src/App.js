import React, { useState, useEffect } from 'react';
import {
  Container,
  AppBar,
  Toolbar,
  Typography,
  Box,
  Tabs,
  Tab,
  ThemeProvider,
  createTheme,
  CssBaseline,
  Alert,
  Snackbar
} from '@mui/material';
import { CloudDownload, Inventory, Settings } from '@mui/icons-material';
import io from 'socket.io-client';

import BuildsTab from './components/BuildsTab';
import ImagesTab from './components/ImagesTab';
import DownloadProgress from './components/DownloadProgress';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#2196f3',
    },
    secondary: {
      main: '#f50057',
    },
    background: {
      default: '#0a0a0a',
      paper: '#1e1e1e',
    },
  },
  typography: {
    h4: {
      fontWeight: 600,
    },
  },
});

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

function App() {
  const [tabValue, setTabValue] = useState(0);
  const [socket, setSocket] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' });

  useEffect(() => {
    // WebSocket-Verbindung initialisieren
    const newSocket = io('/', {
      auth: {
        // Basic Auth wird über HTTP Headers gehandhabt
      }
    });

    newSocket.on('connect', () => {
      console.log('WebSocket verbunden');
      setSocket(newSocket);
    });

    newSocket.on('disconnect', () => {
      console.log('WebSocket getrennt');
    });

    newSocket.on('download_progress', (data) => {
      setDownloadProgress(data);
    });

    newSocket.on('download_complete', (data) => {
      setDownloadProgress(null);
      setNotification({
        open: true,
        message: `Download abgeschlossen: ${data.filename}`,
        severity: 'success'
      });
    });

    newSocket.on('download_error', (data) => {
      setDownloadProgress(null);
      setNotification({
        open: true,
        message: `Download-Fehler: ${data.error}`,
        severity: 'error'
      });
    });

    return () => {
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, []);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleCloseNotification = () => {
    setNotification({ ...notification, open: false });
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="xl">
        <AppBar position="static" sx={{ mb: 3, borderRadius: 2 }}>
          <Toolbar>
            <CloudDownload sx={{ mr: 2 }} />
            <Typography variant="h4" component="div" sx={{ flexGrow: 1 }}>
              UUP Dump Frontend - Windows Image Manager
            </Typography>
            <Typography variant="subtitle1" color="inherit">
              dl.terhorst.io
            </Typography>
          </Toolbar>
        </AppBar>

        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="Navigation">
            <Tab
              icon={<CloudDownload />}
              label="Windows Builds"
              id="tab-0"
              aria-controls="tabpanel-0"
            />
            <Tab
              icon={<Inventory />}
              label="Meine Images"
              id="tab-1"
              aria-controls="tabpanel-1"
            />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          <BuildsTab socket={socket} />
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <ImagesTab />
        </TabPanel>

        {downloadProgress && (
          <DownloadProgress progress={downloadProgress} />
        )}

        <Snackbar
          open={notification.open}
          autoHideDuration={6000}
          onClose={handleCloseNotification}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert
            onClose={handleCloseNotification}
            severity={notification.severity}
            sx={{ width: '100%' }}
          >
            {notification.message}
          </Alert>
        </Snackbar>
      </Container>
    </ThemeProvider>
  );
}

export default App; 