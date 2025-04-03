import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, shadows } from '../styles/theme';

const GPUStatus = ({ serverUrl }) => {
  const [gpuInfo, setGpuInfo] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchGPUInfo = async () => {
    if (!serverUrl) return;
    
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${serverUrl}/system/gpu-info`);
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const data = await response.json();
      setGpuInfo(data);
    } catch (err) {
      console.error('Failed to fetch GPU info:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGPUInfo();
    
    // Refresh GPU info every minute if component is expanded
    const refreshInterval = setInterval(() => {
      if (expanded) {
        fetchGPUInfo();
      }
    }, 60000);

    return () => clearInterval(refreshInterval);
  }, [serverUrl, expanded]);

  if (!gpuInfo) {
    return loading ? (
      <TouchableOpacity style={styles.container} onPress={() => setExpanded(!expanded)}>
        <Text style={styles.statusText}>Loading GPU info...</Text>
      </TouchableOpacity>
    ) : error ? (
      <TouchableOpacity style={styles.container} onPress={fetchGPUInfo}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <Text style={styles.retryText}>Tap to retry</Text>
      </TouchableOpacity>
    ) : null;
  }

  const { gpu, models } = gpuInfo;
  const whisperOnGpu = models?.whisper?.on_gpu;
  const ttsOnGpu = models?.tts?.on_gpu;

  return (
    <TouchableOpacity 
      style={styles.container} 
      onPress={() => setExpanded(!expanded)}
    >
      <View style={styles.header}>
        <Text style={styles.title}>
          Model Status: {gpu.available ? 'GPU Enabled' : 'CPU Only'}
        </Text>
        <Text style={[
          styles.statusBadge,
          gpu.available ? styles.gpuBadge : styles.cpuBadge
        ]}>
          {gpu.available ? 'GPU' : 'CPU'}
        </Text>
      </View>

      {expanded && (
        <View style={styles.detailsContainer}>
          {gpu.available && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>GPU Details</Text>
              <Text style={styles.detailText}>Name: {gpu.name}</Text>
              <Text style={styles.detailText}>CUDA: {gpu.cuda_version}</Text>
              <Text style={styles.detailText}>Memory: {gpu.memory_total}</Text>
              {gpu.utilization_percent && (
                <Text style={styles.detailText}>Usage: {gpu.utilization_percent}</Text>
              )}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Models</Text>
            <View style={styles.modelItem}>
              <Text style={styles.modelName}>Whisper (Speech Recognition)</Text>
              <Text style={[
                styles.modelStatus,
                whisperOnGpu ? styles.gpuModel : styles.cpuModel
              ]}>
                {whisperOnGpu ? 'GPU' : 'CPU'}
              </Text>
            </View>
            <View style={styles.modelItem}>
              <Text style={styles.modelName}>TTS (Speech Synthesis)</Text>
              <Text style={[
                styles.modelStatus,
                ttsOnGpu ? styles.gpuModel : styles.cpuModel
              ]}>
                {ttsOnGpu ? 'GPU' : 'CPU'}
              </Text>
            </View>
            <Text style={styles.updateTime}>
              Last updated: {new Date(gpuInfo.timestamp).toLocaleTimeString()}
            </Text>
          </View>
          
          <TouchableOpacity 
            style={styles.refreshButton} 
            onPress={fetchGPUInfo}
          >
            <Text style={styles.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 15,
    ...shadows.main
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 'bold',
  },
  gpuBadge: {
    backgroundColor: '#4CAF50',
    color: 'white',
  },
  cpuBadge: {
    backgroundColor: '#FF9800',
    color: 'white',
  },
  detailsContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  section: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 5,
  },
  detailText: {
    fontSize: 13,
    color: colors.secondary,
    marginBottom: 2,
  },
  modelItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modelName: {
    fontSize: 13,
    color: colors.text,
  },
  modelStatus: {
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  gpuModel: {
    backgroundColor: '#4CAF50',
    color: 'white',
  },
  cpuModel: {
    backgroundColor: '#FF9800',
    color: 'white',
  },
  updateTime: {
    fontSize: 11,
    color: colors.secondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
  refreshButton: {
    backgroundColor: colors.primary,
    padding: 8,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 5,
  },
  refreshText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  statusText: {
    color: colors.secondary,
    fontSize: 14,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
  },
  retryText: {
    color: colors.primary,
    fontSize: 12,
    marginTop: 3,
  }
});

export default GPUStatus;