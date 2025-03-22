import React from 'react';
import AudioRecorder from './AudioRecorder';
import './App.css';

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Audio Recorder</h1>
      </header>
      <main className="app-main">
        <AudioRecorder />
      </main>
      <footer className="app-footer">
        <p>Click the microphone to start/stop recording</p>
      </footer>
    </div>
  );
}

export default App;
