import React from 'react';
import { Box, Typography, Button } from '@mui/material';

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <Box sx={{ p: 3, maxWidth: 600, mx: 'auto', mt: 4 }}>
          <Typography variant="h6" color="error" gutterBottom>
            Ошибка загрузки приложения
          </Typography>
          <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', mb: 2 }}>
            {this.state.error.message}
          </Typography>
          <Button variant="outlined" onClick={() => window.location.reload()}>
            Обновить страницу
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}
