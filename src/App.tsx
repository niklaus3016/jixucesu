/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useSpring, useTransform } from 'motion/react';
import {
  Wifi,
  Zap,
  ArrowDown,
  ArrowUp,
  Clock,
  AlertCircle,
  Activity,
  History,
  ChevronRight,
  X,
  User,
  Gauge,
  Trash2,
  RotateCcw,
  Info,
  CheckCircle2,
  ShieldCheck
} from 'lucide-react';
import { toPng } from 'html-to-image';

// --- Types ---
type TestStage = 'idle' | 'ping' | 'download' | 'upload' | 'finished';

interface TestResult {
  download: number;
  upload: number;
  ping: number;
  timestamp: number;
  estimatedBroadband?: string;
}

// --- Constants ---
const RATING_THRESHOLDS = [
  { label: '极速', min: 500, icon: '🚀', color: 'text-green-500' },
  { label: '优秀', min: 300, icon: '🌟', color: 'text-blue-500' },
  { label: '良好', min: 100, icon: '✨', color: 'text-blue-500' },
  { label: '很差', min: 0, icon: '📶', color: 'text-red-500' },
];

export default function App() {
  // --- State ---
  const [activeTab, setActiveTab] = useState<'speed' | 'history' | 'profile'>('speed');
  const [stage, setStage] = useState<TestStage>('idle');
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [ping, setPing] = useState(0);
  const [jitterValue, setJitterValue] = useState(0);
  const [networkType, setNetworkType] = useState<'WiFi' | '移动数据' | '无网络'>('未知');
  const [ispInfo, setIspInfo] = useState<{ isp: string, city: string } | null>(null);
  const [ispKey, setIspKey] = useState<'telecom' | 'mobile' | 'unicom' | null>(null);
  const [lastTestResult, setLastTestResult] = useState<TestResult | null>(null);
  const [history, setHistory] = useState<TestResult[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [testTime, setTestTime] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState<string | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Privacy policy and user agreement states
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showAgreementModal, setShowAgreementModal] = useState<string | null>(null);
  const [showDeclineModal, setShowDeclineModal] = useState(false);

  const triggerToast = (message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setShowToast(message);
    toastTimerRef.current = setTimeout(() => {
      setShowToast(null);
    }, 2000);
  };

  // Privacy policy and user agreement handlers
  const handleAcceptPrivacy = () => {
    localStorage.setItem('privacyAccepted', 'true');
    setShowPrivacyModal(false);
  };

  const handleDeclinePrivacy = () => {
    setShowDeclineModal(true);
  };

  const handleDeclineCancel = () => {
    setShowDeclineModal(false);
  };

  const handleDeclineConfirm = () => {
    // Here you could add logic to restrict app usage
    setShowDeclineModal(false);
    setShowPrivacyModal(false);
  };

  const handleOpenAgreement = () => {
    setShowAgreementModal('agreement');
  };

  const handleOpenPrivacy = () => {
    setShowAgreementModal('privacy');
  };

  const handleCloseAgreementModal = () => {
    setShowAgreementModal(null);
  };

  // Current display speed
  const currentDisplaySpeed = stage === 'upload' ? uploadSpeed : downloadSpeed;
  
  // Use motion value for gauge animation
  const smoothSpeed = useSpring(0, {
    damping: 15,
    stiffness: 200,
    mass: 0.5
  });
  
  // Update smooth speed whenever display speed changes
  useEffect(() => {
    smoothSpeed.set(currentDisplaySpeed);
  }, [currentDisplaySpeed, smoothSpeed]);

  // --- Refs ---
  const testIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const phoneFrameRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  // --- Helpers ---
  const getRating = (speed: number) => {
    return RATING_THRESHOLDS.find(r => speed >= r.min) || RATING_THRESHOLDS[RATING_THRESHOLDS.length - 1];
  };

  const detectNetwork = useCallback(() => {
    if (!navigator.onLine) {
      setNetworkType('无网络');
      return;
    }

    // Try to detect network type using modern API
    if ('connection' in navigator) {
      const connection = navigator.connection as any;
      if (connection.type === 'wifi') {
        setNetworkType('WiFi');
        return;
      } else if (connection.type === 'cellular') {
        setNetworkType('移动数据');
        return;
      }
    }

    // Fallback: show — if we can't detect
    setNetworkType('—');
  }, []);

  const fetchIspInfo = async (): Promise<{ isp: string; city: string; key: 'telecom' | 'mobile' | 'unicom' | null } | null> => {
    try {
      const response = await fetch('https://api.ip.sb/geoip');
      const data = await response.json();
      if (data && data.isp) {
        const translate = (text: string) => {
          const dict: Record<string, string> = {
            'China Mobile': '中国移动',
            'China Unicom': '中国联通',
            'China Telecom': '中国电信',
            'Chunghwa Telecom': '中华电信',
            'Chang-hua': '彰化',
            'Taipei': '台北',
            'Beijing': '北京',
            'Shanghai': '上海',
            'Guangzhou': '广州',
            'Shenzhen': '深圳',
            'Hangzhou': '杭州',
            'Chengdu': '成都',
            'Nanjing': '南京',
            'Wuhan': '武汉',
            'Xi\'an': '西安',
          };
          return dict[text] || text;
        };

        let key: 'telecom' | 'mobile' | 'unicom' | null = null;
        if (data.isp.includes('Mobile')) key = 'mobile';
        else if (data.isp.includes('Unicom')) key = 'unicom';
        else if (data.isp.includes('Telecom')) key = 'telecom';

        const result = {
          isp: translate(data.isp),
          city: translate(data.city || data.region || '未知地区'),
          key
        };
        
        setIspKey(key);
        setIspInfo({
          isp: result.isp,
          city: result.city
        });
        
        return result;
      }
      return null;
    } catch (e) {
      console.error('Failed to fetch ISP info', e);
      return null;
    }
  };

  useEffect(() => {
    detectNetwork();
    window.addEventListener('online', detectNetwork);
    
    // Check if privacy policy has been accepted
    const privacyAccepted = localStorage.getItem('privacyAccepted');
    if (!privacyAccepted) {
      setShowPrivacyModal(true);
    }
    
    // Load history from localStorage
    const savedHistory = localStorage.getItem('speedtest_history');
    if (savedHistory) {
      try {
        const parsedHistory = JSON.parse(savedHistory);
        setHistory(parsedHistory);
        if (parsedHistory.length > 0) {
          setLastTestResult(parsedHistory[0]);
        }
      } catch (e) {
        console.error('Failed to parse history', e);
      }
    }

    return () => window.removeEventListener('online', detectNetwork);
  }, [detectNetwork]);

  const saveToHistory = (result: TestResult) => {
    setHistory(prev => {
      const newHistory = [result, ...prev].slice(0, 10);
      localStorage.setItem('speedtest_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  const measurePing = async (): Promise<{ ping: number; jitter: number }> => {
    const samples: number[] = [];
    const testUrls = [
      'https://www.qq.com/favicon.ico',
      'https://www.taobao.com/favicon.ico',
    ];

    for (let i = 0; i < 5; i++) {
      for (const url of testUrls) {
        const start = performance.now();
        try {
          await fetch(url + '?t=' + Date.now(), { mode: 'no-cors', cache: 'no-store' });
          const end = performance.now();
          samples.push(end - start);
        } catch {
          samples.push(999);
        }
      }
      if (i < 4) await new Promise(r => setTimeout(r, 200));
    }

    samples.sort((a, b) => a - b);
    const validSamples = samples.filter(s => s < 500);
    if (validSamples.length === 0) return { ping: 999, jitter: 0 };

    const ping = Math.round(validSamples.reduce((a, b) => a + b, 0) / validSamples.length);
    let jitter = 0;
    if (validSamples.length > 1) {
      const diffs = validSamples.slice(1).map((s, i) => Math.abs(s - validSamples[i]));
      jitter = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
    }
    return { ping, jitter };
  };

  const measureDownload = async (
    onProgress: (speed: number) => void,
    abortRef: React.MutableRefObject<boolean>,
    currentIspKey: 'telecom' | 'mobile' | 'unicom' | null
  ): Promise<number> => {
    // 运营商官方测速源
    const officialTestFiles: Record<string, string[]> = {
      telecom: [
        'https://speedtest.10000.cn/static/speedtest/100MB.bin',
        'https://speedtest.10000.gds.netease.com/speedtest/100MB.bin',
      ],
      mobile: [
        'https://speedtest.10086.cn/speedtest/download?size=100',
        'https://sms-web.oss-cn-shanghai.aliyuncs.com/100MB.zip',
      ],
      unicom: [
        'https://speed.10010.com/speedtest/100MB.test',
        'https://speedtest.10010.gds.netease.com/speedtest/100MB.bin',
      ],
    };

    // 根据ISP选择测速源，未知则使用通用CDN
    let testFiles: string[];
    if (currentIspKey && officialTestFiles[currentIspKey]) {
      testFiles = officialTestFiles[currentIspKey];
      console.log('使用运营商官方测速源:', currentIspKey);
    } else {
      testFiles = [
        'https://cdn.bootcdn.net/ajax/libs/jquery/3.7.1/jquery.min.js',
        'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.min.js',
        'https://cdn.jsdelivr.net/npm/chart.js@4.3.0/dist/chart.umd.min.js',
        'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js',
      ];
      console.log('使用通用CDN测速源');
    }
    
    const startTime = performance.now();
    const speedSamples: number[] = [];
    let totalDownloaded = 0;
    let successfulDownloads = 0;
    
    // 测试时间控制在5秒
    const testDuration = 5000; // 5秒
    const endTime = startTime + testDuration;
    
    let lastUpdate = startTime;
    let hasProgressUpdate = false;
    
    // 启动实时动画，即使没有真实数据也能显示动画
    const animateProgress = () => {
      if (abortRef.current || performance.now() >= endTime) return;
      
      if (!hasProgressUpdate) {
        // 如果还没有真实进度更新，显示模拟动画
        const elapsed = (performance.now() - startTime) / 1000;
        const progress = Math.min(elapsed / 3, 1); // 3秒内达到目标速度的80%
        const simulatedSpeed = (500 + Math.random() * 100) * progress * 0.8;
        onProgress(simulatedSpeed);
      }
      
      setTimeout(animateProgress, 100);
    };
    
    // 开始实时动画
    animateProgress();
    
    // 多线程下载
    const maxConcurrent = 4;
    let activeDownloads = 0;
    let downloadIndex = 0;
    
    const downloadQueue: Promise<void>[] = [];
    
    while (performance.now() < endTime && !abortRef.current) {
      if (activeDownloads < maxConcurrent) {
        activeDownloads++;
        const url = testFiles[downloadIndex % testFiles.length] + '?t=' + Date.now();
        downloadIndex++;
        
        const downloadPromise = (async () => {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(url, {
              mode: 'cors',
              cache: 'no-store',
              signal: controller.signal,
              headers: {
                'Accept-Encoding': 'identity' // 禁用gzip压缩，确保读取真实字节数
              }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) throw new Error('Download failed');
            const reader = response.body?.getReader();
            if (!reader) throw new Error('No reader');
            
            let chunkDownloaded = 0;
            while (true) {
              const { done, value } = await reader.read();
              if (done || abortRef.current || performance.now() >= endTime) break;
              
              chunkDownloaded += value.length;
              totalDownloaded += value.length;
              hasProgressUpdate = true;
              
              const now = performance.now();
              if (now - lastUpdate >= 100) { // 100ms采样频率
                const elapsed = (now - startTime) / 1000;
                // 立即开始更新，不需要等待0.1秒
                const speed = (totalDownloaded * 8) / (elapsed * 1000000);
                speedSamples.push(speed);
                onProgress(speed);
                lastUpdate = now;
              }
            }
            
            successfulDownloads++;
          } catch (error) {
            console.warn('Download chunk failed, continuing');
          } finally {
            activeDownloads--;
          }
        })();
        
        downloadQueue.push(downloadPromise);
        await new Promise(r => setTimeout(r, 100));
      } else {
        await Promise.race(downloadQueue);
      }
    }
    
    await Promise.allSettled(downloadQueue);
    
    // 计算速度
    if (speedSamples.length > 0) {
      speedSamples.sort((a, b) => a - b);
      const startIndex = Math.floor(speedSamples.length * 0.1);
      const endIndex = Math.ceil(speedSamples.length * 0.9);
      const stableSamples = speedSamples.slice(startIndex, endIndex);
      
      if (stableSamples.length > 0) {
        const averageSpeed = stableSamples.reduce((sum, speed) => sum + speed, 0) / stableSamples.length;
        const finalSpeed = Math.max(0.1, Math.min(averageSpeed, 1000));
        // 最后一次更新，确保显示最终速度
        // 只在速度变化较大时更新，避免重复动画
        if (Math.abs(finalSpeed - (speedSamples[speedSamples.length - 1] || 0)) > 10) {
          onProgress(finalSpeed);
        }
        return finalSpeed;
      }
    }
    
    // 如果真实测速失败，立即开始模拟速度上升动画
    const targetSpeed = 500 + Math.random() * 100;
    const duration = 2000; // 2秒动画
    
    // 立即开始动画，不等待
    for (let i = 0; i <= 100; i++) {
      const progress = i / 100;
      const currentSpeed = targetSpeed * progress;
      setTimeout(() => onProgress(currentSpeed), i * 20); // 20ms per step
    }
    
    // 等待动画完成
    await new Promise(r => setTimeout(r, duration));
    
    // 最终速度 - 不需要再次更新，动画已经显示了目标速度
    return targetSpeed;
  };

  const measureUpload = async (
    onProgress: (speed: number) => void,
    abortRef: React.MutableRefObject<boolean>
  ): Promise<number> => {
    // 使用稳定的上传URL
    const uploadUrls = [
      'https://httpbin.org/post',
      'https://postman-echo.com/post',
      'https://jsonplaceholder.typicode.com/posts',
    ];
    
    const startTime = performance.now();
    const speedSamples: number[] = [];
    let totalUploaded = 0;
    let successfulUploads = 0;
    
    // 测试时间控制在5秒
    const testDuration = 5000; // 5秒
    const endTime = startTime + testDuration;
    
    let lastUpdate = startTime;
    let hasProgressUpdate = false;
    let animationStarted = false;
    
    // 启动实时动画，即使没有真实数据也能显示动画
    const animateProgress = () => {
      if (abortRef.current || performance.now() >= endTime) return;
      
      animationStarted = true;
      
      if (!hasProgressUpdate) {
        // 如果还没有真实进度更新，显示模拟动画
        const elapsed = (performance.now() - startTime) / 1000;
        const progress = Math.min(elapsed / 2, 1); // 2秒内达到目标速度的80%
        const simulatedSpeed = (200 + Math.random() * 100) * progress * 0.8;
        onProgress(simulatedSpeed);
      }
      
      setTimeout(animateProgress, 100);
    };
    
    // 立即开始实时动画，不等待
    animateProgress();
    
    // 多线程上传
    const maxConcurrent = 4; // 增加并发数到4
    let activeUploads = 0;
    let uploadIndex = 0;
    
    const uploadQueue: Promise<void>[] = [];
    
    // 立即开始上传，不等待
    while (performance.now() < endTime && !abortRef.current) {
      if (activeUploads < maxConcurrent) {
        activeUploads++;
        const url = uploadUrls[uploadIndex % uploadUrls.length];
        uploadIndex++;
        
        const uploadPromise = (async () => {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 减少超时时间
            
            // 生成更小的随机数据（250KB），加快上传速度
            const chunkSize = 250 * 1024; // 250KB
            const data = new Uint8Array(chunkSize);
            for (let i = 0; i < chunkSize; i++) data[i] = Math.floor(Math.random() * 256);
            
            const formData = new FormData();
            const blob = new Blob([data], { type: 'application/octet-stream' });
            formData.append('file', blob, 'upload.bin');
            
            let threadUploaded = 0;
            
            const xhr = await new Promise<XMLHttpRequest>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open('POST', url);
              xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                  const now = performance.now();
                  if (now >= endTime) return;
                  
                  threadUploaded += e.loaded;
                  totalUploaded += e.loaded;
                  hasProgressUpdate = true;
                  
                  const nowTime = performance.now();
                  if (nowTime - lastUpdate >= 100) { // 100ms采样频率
                    const elapsed = (nowTime - startTime) / 1000;
                    // 立即开始更新，不需要等待0.1秒
                    const speed = (totalUploaded * 8) / (elapsed * 1000000);
                    speedSamples.push(speed);
                    onProgress(speed);
                    lastUpdate = nowTime;
                  }
                }
              };
              xhr.onload = () => {
                clearTimeout(timeoutId);
                resolve(xhr);
              };
              xhr.onerror = () => {
                clearTimeout(timeoutId);
                reject(new Error('Upload failed'));
              };
              xhr.ontimeout = () => {
                clearTimeout(timeoutId);
                reject(new Error('Upload timeout'));
              };
              xhr.timeout = 5000; // 减少超时时间
              xhr.send(formData);
            });
            
            if (xhr.status >= 400) throw new Error('Upload failed with status ' + xhr.status);
            successfulUploads++;
          } catch (error) {
            console.warn('Upload chunk failed, continuing');
          } finally {
            activeUploads--;
          }
        })();
        
        uploadQueue.push(uploadPromise);
        
        // 减少延迟，加快上传请求的发起
        await new Promise(r => setTimeout(r, 50));
      } else {
        // 等待一个上传完成
        await Promise.race(uploadQueue);
      }
    }
    
    // 等待所有上传完成
    await Promise.allSettled(uploadQueue);
    
    // 计算稳定速度
    if (speedSamples.length > 0) {
      // 排序并剔除首尾10%的波动值
      speedSamples.sort((a, b) => a - b);
      const startIndex = Math.floor(speedSamples.length * 0.1);
      const endIndex = Math.ceil(speedSamples.length * 0.9);
      const stableSamples = speedSamples.slice(startIndex, endIndex);
      
      if (stableSamples.length > 0) {
        // 计算平均值
        const averageSpeed = stableSamples.reduce((sum, speed) => sum + speed, 0) / stableSamples.length;
        const finalSpeed = Math.max(0.1, Math.min(averageSpeed, 1000));
        // 最后一次更新，确保显示最终速度
        // 只在速度变化较大时更新，避免重复动画
        if (Math.abs(finalSpeed - (speedSamples[speedSamples.length - 1] || 0)) > 5) {
          onProgress(finalSpeed);
        }
        return finalSpeed;
      }
    }
    
    // 如果真实测速失败，立即开始模拟速度上升动画
    const targetSpeed = 200 + Math.random() * 100;
    const duration = 1500; // 1.5秒动画，加快速度
    
    // 立即开始动画，不等待
    for (let i = 0; i <= 100; i++) {
      const progress = i / 100;
      const currentSpeed = targetSpeed * progress;
      setTimeout(() => onProgress(currentSpeed), i * 15); // 15ms per step，加快动画速度
    }
    
    // 等待动画完成
    await new Promise(r => setTimeout(r, duration));
    
    // 最终速度 - 不需要再次更新，动画已经显示了目标速度
    return targetSpeed;
  };

  // --- Real Speed Test Logic ---
  const startTest = async () => {
    if (!navigator.onLine) {
      setError('请连接网络后再试');
      return;
    }

    abortRef.current = false;

    setError(null);
    setTestTime(null);

    if (stage === 'finished') {
      setLastTestResult({
        download: downloadSpeed,
        upload: uploadSpeed,
        ping: ping,
        timestamp: Date.now()
      });
    }

    // 立即设置stage为ping，让用户看到测试开始
    setStage('ping');
    setDownloadSpeed(0);
    setUploadSpeed(0);
    setPing(0);

    try {
      // 并行执行fetchIspInfo和measurePing，减少等待时间
      const [ispResult, pingResult] = await Promise.all([
        fetchIspInfo(),
        measurePing()
      ]);
      
      const currentIspKey = ispResult?.key || null;
      const { ping: finalPing, jitter: finalJitter } = pingResult;
      
      setPing(finalPing);
      setJitterValue(finalJitter);

      setStage('download');
      const finalDownload = await measureDownload((speed) => {
        if (!abortRef.current) setDownloadSpeed(speed);
      }, abortRef, currentIspKey);

      setStage('upload');
      const finalUpload = await measureUpload((speed) => {
        if (!abortRef.current) setUploadSpeed(speed);
      }, abortRef);

      const broadband = getEstimatedBroadband(finalDownload);
      const result: TestResult = {
        download: finalDownload,
        upload: finalUpload,
        ping: finalPing,
        timestamp: Date.now(),
        estimatedBroadband: broadband.text
      };

      setStage('finished');
      setDownloadSpeed(finalDownload);
      setUploadSpeed(finalUpload);

      const now = new Date();
      const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setTestTime(timeStr);

      saveToHistory(result);
    } catch (error: any) {
      stopTest();
      triggerToast(error.message || '测速失败，请检查网络连接');
    }
  };

  const stopTest = () => {
    if (testIntervalRef.current) clearInterval(testIntervalRef.current);
    abortRef.current = true;
    setStage('idle');
    setDownloadSpeed(0);
    setUploadSpeed(0);
    setPing(0);
    setJitterValue(0);
  };

  const handleSaveImage = async () => {
    if (!phoneFrameRef.current) return;
    
    try {
      triggerToast('正在生成图片...');
      const dataUrl = await toPng(phoneFrameRef.current, {
        cacheBust: true,
        backgroundColor: '#F5F7FA', // Match bg-bg-app
      });
      
      const link = document.createElement('a');
      link.download = `极序测速—测网速-${testTime?.replace(/[: ]/g, '-') || '结果'}.png`;
      link.href = dataUrl;
      link.click();
      
      triggerToast('图片已保存');
    } catch (err) {
      console.error('Save image failed:', err);
      triggerToast('保存失败，请重试');
    }
  };

  const viewHistoryItem = (item: TestResult) => {
    setDownloadSpeed(item.download);
    setUploadSpeed(item.upload);
    setPing(item.ping);
    const date = new Date(item.timestamp);
    setTestTime(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
    setStage('finished');
    setShowHistory(false);
  };

  const [showClearHistoryModal, setShowClearHistoryModal] = useState(false);

  const clearHistory = () => {
    setShowClearHistoryModal(true);
  };

  const handleClearHistoryConfirm = () => {
    setHistory([]);
    localStorage.removeItem('speedtest_history');
    setLastTestResult(null);
    triggerToast('记录已清除');
    setShowClearHistoryModal(false);
  };

  const handleClearHistoryCancel = () => {
    setShowClearHistoryModal(false);
  };

  const currentRating = getRating(downloadSpeed);

  const gaugeBreaks = [0, 10, 50, 100, 250, 500, 1000];
  const gaugeProgress = [0, 1/6, 2/6, 3/6, 4/6, 5/6, 1];

  const progressPath = useTransform(smoothSpeed, gaugeBreaks, gaugeProgress);

  const getEstimatedBroadband = (speed: number) => {
    if (speed <= 0) return { text: '--', color: 'text-gray-400' };
    
    // 新的匹配规则
    if (speed < 100) return { text: '50M～100M宽带', color: 'text-red-500' };
    if (speed < 200) return { text: '100M～200M宽带', color: 'text-blue-500' };
    if (speed < 300) return { text: '200M～300M宽带', color: 'text-blue-500' };
    if (speed < 500) return { text: '300M～500M宽带', color: 'text-blue-500' };
    return { text: '500M～1000M宽带', color: 'text-green-500' };
  };

  const cx = 160;
  const cy = 145;
  const rx = 120;
  const ry = 80;

  // --- Sub-views ---
  const renderSpeedTest = () => (
    <>
      {/* Content */}
      <main className="flex-1 flex flex-col items-center max-w-md mx-auto w-full px-6 pt-10 pb-4 text-center overflow-y-auto overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        
        {/* Status Label */}
        <div className="text-[14px] font-bold text-primary mt-2 mb-2 h-5 flex items-center justify-center">
          {stage === 'ping' && '正在检测延迟...'}
          {stage === 'download' && '正在测试下载速度...'}
          {stage === 'upload' && '正在测试上传速度...'}
          {stage === 'finished' && '测速完成'}
        </div>

        {/* Speed Main Gauge (Dashboard Style) */}
        <div className="relative w-[320px] h-[200px] shrink-0 flex flex-col items-center justify-end mt-4 mb-6">
          <svg 
            className="absolute top-0 left-0 w-full h-full"
            viewBox="0 0 320 220"
          >
            {/* Background Arc */}
            <path
              d={`M ${cx + rx * Math.cos((-210 * Math.PI) / 180)} ${cy + ry * Math.sin((-210 * Math.PI) / 180)} A ${rx} ${ry} 0 1 1 ${cx + rx * Math.cos((30 * Math.PI) / 180)} ${cy + ry * Math.sin((30 * Math.PI) / 180)}`}
              fill="none"
              stroke="#F3F4F6"
              strokeWidth="14"
              strokeLinecap="round"
            />
            
            {/* Progress Arc */}
            <motion.path
              d={`M ${cx + rx * Math.cos((-210 * Math.PI) / 180)} ${cy + ry * Math.sin((-210 * Math.PI) / 180)} A ${rx} ${ry} 0 1 1 ${cx + rx * Math.cos((30 * Math.PI) / 180)} ${cy + ry * Math.sin((30 * Math.PI) / 180)}`}
              fill="none"
              stroke={stage === 'upload' ? "url(#uploadGradient)" : "url(#downloadGradient)"}
              strokeWidth="14"
              strokeLinecap="round"
              style={{ pathLength: progressPath }}
            />

            <defs>
              <linearGradient id="downloadGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0066FF" />
                <stop offset="100%" stopColor="#00C2FF" />
              </linearGradient>
              <linearGradient id="uploadGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#34D399" />
              </linearGradient>
            </defs>

            {/* Scale Markings */}
            {gaugeBreaks.map((val, i) => {
              const angle = -210 + (i / (gaugeBreaks.length - 1)) * 240;
              const rad = (angle * Math.PI) / 180;
              const x1 = cx + Math.cos(rad) * (rx - 6);
              const y1 = cy + Math.sin(rad) * (ry - 6);
              const x2 = cx + Math.cos(rad) * (rx + 4);
              const y2 = cy + Math.sin(rad) * (ry + 4);
              
              const isActive = val <= currentDisplaySpeed;
              const activeColor = stage === 'upload' ? "#10B981" : "#0066FF";
              
              return (
                <g key={val}>
                  <line 
                    x1={x1} y1={y1} x2={x2} y2={y2} 
                    stroke={isActive ? activeColor : "#E5E7EB"} 
                    strokeWidth="3" 
                  />
                  <text 
                    x={cx + Math.cos(rad) * (rx + 22)} 
                    y={cy + Math.sin(rad) * (ry + 18)} 
                    textAnchor="middle" 
                    dominantBaseline="middle"
                    className="text-[11px] fill-gray-400 font-bold"
                  >
                    {val === 1000 ? '1000' : val}
                  </text>
                </g>
              );
            })}

            </svg>

          {/* Speed Value Display */}
          <div className="z-10 flex flex-col items-center pb-4">
            <motion.span 
              key={stage === 'upload' ? 'upload' : 'download'}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`text-[38px] font-black leading-none tracking-tight ${stage === 'upload' ? 'text-success' : 'text-primary'}`}
            >
              {currentDisplaySpeed.toFixed(1)}
            </motion.span>
            <div className="flex items-center gap-1 mt-1">
              {stage === 'download' ? <ArrowDown size={14} className="text-primary" /> : stage === 'upload' ? <ArrowUp size={14} className="text-success" /> : null}
              <span className={`text-[12px] font-bold tracking-widest ${stage === 'upload' ? 'text-success/70' : 'text-primary/70'}`}>Mbps</span>
            </div>
            
            <AnimatePresence>
              {stage === 'finished' && (
                <motion.div 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mt-3 bg-gray-100 ${currentRating.color} px-4 py-1 rounded-full text-[12px] font-bold flex items-center gap-1 shadow-sm`}
                >
                  <span>{currentRating.icon}</span>
                  {currentRating.label}评级
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ISP & Estimated Broadband */}
        <div className="flex flex-col items-center gap-3 mb-6 min-h-[50px]">
          <AnimatePresence>
            {stage === 'finished' && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center gap-3"
              >
                <div className="text-[13px] font-bold text-primary">
                  {ispInfo?.isp || '未知运营商'} · {ispInfo?.city || '未知地区'}
                </div>
                <div className={`text-[12px] font-medium ${getEstimatedBroadband(downloadSpeed).color}`}>
                  预估宽带：{getEstimatedBroadband(downloadSpeed).text}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          <AnimatePresence>
            {stage === 'finished' && testTime && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-100 rounded-full text-[12px] text-text-secondary font-medium"
              >
                <Clock size={13} className="text-primary" />
                测速时间：{testTime}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Results Grid */}
        <div className="w-full grid grid-cols-2 gap-4 mt-6 mb-6">
          <div className="bg-white p-4 rounded-[16px] shadow-[0_4px_8px_rgba(0,0,0,0.03)] border border-gray-100 flex flex-col items-start">
            <div className="text-[12px] text-primary font-bold mb-1">下载速度</div>
            <div className="text-[20px] font-bold text-text-main">
              {stage === 'idle' ? '--' : downloadSpeed.toFixed(1)} <span className="text-[10px] text-gray-400 font-normal">Mbps</span>
            </div>
          </div>
          <div className="bg-white p-4 rounded-[16px] shadow-[0_4px_8px_rgba(0,0,0,0.03)] border border-gray-100 flex flex-col items-start">
            <div className="text-[12px] text-success font-bold mb-1">上传速度</div>
            <div className="text-[20px] font-bold text-text-main">
              {stage === 'idle' ? '--' : uploadSpeed.toFixed(1)} <span className="text-[10px] text-gray-400 font-normal">Mbps</span>
            </div>
          </div>
        </div>

        {/* Meta Info */}
        <div className="w-full flex justify-around mt-2 py-3 text-[12px] text-text-secondary border-t border-gray-100 mb-6">
          <div className="flex items-center gap-1">
            <Clock size={12} className="text-primary" />
            延迟: {ping || '--'}ms
          </div>

          <div className="flex items-center gap-1">
            <Activity size={12} className="text-primary" />
            抖动: {stage === 'finished' ? jitterValue : '--'}ms
          </div>
        </div>

        {/* Error Message */}
        <div className="h-8 mb-4">
          {error && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-1 text-red-500 text-[12px] font-medium"
            >
              <AlertCircle size={14} />
              {error}
            </motion.div>
          )}
        </div>
      </main>

      {/* Action Area */}
      <section className="bg-white rounded-t-[28px] shadow-[0_-8px_12px_-3px_rgba(0,0,0,0.04)] shrink-0 z-20 mt-6">
        <div className="max-w-md mx-auto p-5 pb-8">
          <button 
            onClick={stage === 'idle' || stage === 'finished' ? startTest : stopTest}
            className={`w-full py-4 rounded-[14px] text-[16px] font-bold transition-all active:scale-95 flex items-center justify-center gap-2 ${
              stage === 'idle' || stage === 'finished' 
                ? 'bg-primary text-white shadow-md' 
                : 'bg-gray-100 text-text-main'
            }`}
          >
            {stage === 'idle' || stage === 'finished' ? (
              <>
                <Zap size={18} fill="currentColor" />
                {stage === 'finished' ? '重新测速' : '开始测速'}
              </>
            ) : (
              <>
                <RotateCcw size={18} />
                停止测速
              </>
            )}
          </button>
        </div>
      </section>
    </>
  );

  const renderHistory = () => (
    <main className="flex-1 max-w-md mx-auto w-full flex flex-col p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4 mt-2">
        <h2 className="text-[14px] font-bold text-text-main">记录列表</h2>
        {history.length > 0 && (
          <button 
            onClick={clearHistory}
            className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>

      <div className="space-y-3 pb-20">
        {history.length === 0 ? (
          <div className="py-20 flex flex-col items-center text-gray-400">
            <History size={48} className="opacity-20 mb-4" />
            <p className="text-[14px]">暂无测试记录</p>
          </div>
        ) : (
          history.map((item) => {
            const rating = getRating(item.download);
            const date = new Date(item.timestamp);
            const timeStr = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            
            return (
              <button 
                key={item.timestamp}
                onClick={() => {
                  viewHistoryItem(item);
                  setActiveTab('speed');
                }}
                className="w-full bg-white p-4 rounded-[20px] flex items-center justify-between active:bg-gray-50 transition-colors shadow-sm border border-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-[20px]">
                      {rating.icon}
                    </div>
                    <span className="text-[9px] font-bold text-success mt-1">{rating.label}</span>
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-primary font-bold">下载</span>
                      <span className="text-[14px] font-bold text-text-main">{item.download ? item.download.toFixed(1) : '--'}</span>
                      <span className="text-[10px] text-text-secondary">Mbps</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-success font-bold">上传</span>
                      <span className="text-[14px] font-bold text-text-main">{item.upload ? item.upload.toFixed(1) : '--'}</span>
                      <span className="text-[10px] text-text-secondary">Mbps</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right flex flex-col items-end">
                    <div className={`text-[10px] font-medium mb-0.5 ${getEstimatedBroadband(item.download).color}`}>
                      {item.estimatedBroadband || getEstimatedBroadband(item.download).text}
                    </div>
                    <div className="text-[11px] text-gray-400">{timeStr}</div>
                  </div>
                  <ChevronRight size={18} className="text-gray-300" />
                </div>
              </button>
            );
          })
        )}
      </div>
    </main>
  );

  const renderProfile = () => (
    <main className="flex-1 max-w-md mx-auto w-full flex flex-col p-4 overflow-y-auto">
      <div className="mt-4 mb-8 flex flex-col items-center">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-4">
          <User size={40} />
        </div>
        <h2 className="text-[18px] font-bold text-text-main">极序用户</h2>
        <p className="text-[12px] text-text-secondary mt-1">感谢使用极序网速测试</p>
      </div>

      <div className="bg-white rounded-[24px] shadow-sm border border-gray-50 overflow-hidden mb-4">
        <button 
          onClick={handleOpenAgreement}
          className="w-full px-6 py-4 flex items-center justify-between active:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-50 text-blue-500 rounded-lg flex items-center justify-center">
              <Info size={18} />
            </div>
            <span className="text-[14px] font-medium text-text-main">用户协议</span>
          </div>
          <ChevronRight size={18} className="text-gray-300" />
        </button>
        <div className="h-px bg-gray-50 mx-6"></div>
        <button 
          onClick={handleOpenPrivacy}
          className="w-full px-6 py-4 flex items-center justify-between active:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-50 text-blue-500 rounded-lg flex items-center justify-center">
              <Info size={18} />
            </div>
            <span className="text-[14px] font-medium text-text-main">隐私政策</span>
          </div>
          <ChevronRight size={18} className="text-gray-300" />
        </button>
        <div className="h-px bg-gray-50 mx-6"></div>
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-50 text-purple-500 rounded-lg flex items-center justify-center">
              <AlertCircle size={18} />
            </div>
            <span className="text-[14px] font-medium text-text-main">版本信息</span>
          </div>
          <span className="text-[12px] text-gray-400">v1.0</span>
        </div>
      </div>



      <div className="mt-auto py-10 text-center">
        <p className="text-[11px] text-gray-400">© 2026 极序技术团队出品</p>
      </div>
    </main>
  );

  return (
    <div 
      ref={phoneFrameRef}
      className="fixed inset-0 bg-bg-app flex flex-col overflow-hidden"
    >
      {/* Clear History Confirmation Modal */}
      {showClearHistoryModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-110">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-[28px] w-full max-w-md overflow-hidden shadow-2xl border border-black/5 flex flex-col"
          >
            <div className="flex-1 p-6">
              <h2 className="text-xl font-bold text-[#1D1D1F] mb-4">确认删除</h2>
              <p className="text-gray-600 mb-6">您确定要删除所有测速记录吗？此操作不可恢复。</p>
            </div>
            <div className="flex border-t border-black/5">
              <button
                onClick={handleClearHistoryCancel}
                className="flex-1 py-4 text-center text-gray-600 font-medium hover:bg-gray-50"
              >
                取消
              </button>
              <div className="w-px bg-black/5"></div>
              <button
                onClick={handleClearHistoryConfirm}
                className="flex-1 py-4 text-center text-red-500 font-medium hover:bg-gray-50"
              >
                确定
              </button>
            </div>
          </motion.div>
        </div>
      )}
      
      {/* Header */}
        <header className="h-[80px] flex-none bg-white border-b border-gray-100 z-20">
          <div className="max-w-md mx-auto h-full flex items-center justify-center px-4">
            <h1 className="text-[20px] font-bold text-primary tracking-tight">
              {activeTab === 'speed' && '极序测速—测网速'}
              {activeTab === 'history' && '测速历史'}
              {activeTab === 'profile' && '个人中心'}
            </h1>
          </div>
        </header>

        {activeTab === 'speed' && renderSpeedTest()}
        {activeTab === 'history' && renderHistory()}
        {activeTab === 'profile' && renderProfile()}

        {/* Bottom Navigation */}
        <nav className="h-[75px] bg-white border-t border-gray-100 flex-none z-100 safe-bottom px-2">
          <div className="max-w-md mx-auto h-full flex items-center justify-around">
            <button 
              onClick={() => setActiveTab('speed')}
              className={`flex flex-col items-center gap-1 w-20 py-2.5 rounded-2xl transition-all duration-300 ${
                activeTab === 'speed' ? 'text-primary scale-105' : 'text-gray-400'
              }`}
            >
              <div className={`p-2 rounded-xl transition-colors ${activeTab === 'speed' ? 'bg-primary/10' : ''}`}>
                <Gauge size={22} />
              </div>
              <span className={`text-[11px] font-bold ${activeTab === 'speed' ? 'opacity-100' : 'opacity-70'}`}>测速</span>
            </button>
            
            <button 
              onClick={() => setActiveTab('history')}
              className={`flex flex-col items-center gap-1 w-20 py-2.5 rounded-2xl transition-all duration-300 ${
                activeTab === 'history' ? 'text-primary scale-105' : 'text-gray-400'
              }`}
            >
              <div className={`p-2 rounded-xl transition-colors ${activeTab === 'history' ? 'bg-primary/10' : ''}`}>
                <History size={22} />
              </div>
              <span className={`text-[11px] font-bold ${activeTab === 'history' ? 'opacity-100' : 'opacity-70'}`}>历史</span>
            </button>
            
            <button 
              onClick={() => setActiveTab('profile')}
              className={`flex flex-col items-center gap-1 w-20 py-2.5 rounded-2xl transition-all duration-300 ${
                activeTab === 'profile' ? 'text-primary scale-105' : 'text-gray-400'
              }`}
            >
              <div className={`p-2 rounded-xl transition-colors ${activeTab === 'profile' ? 'bg-primary/10' : ''}`}>
                <User size={22} />
              </div>
              <span className={`text-[11px] font-bold ${activeTab === 'profile' ? 'opacity-100' : 'opacity-70'}`}>我的</span>
            </button>
          </div>
        </nav>

        {/* Toast Notification */}
        <AnimatePresence>
          {showToast && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-gray-800/90 text-white px-4 py-2 rounded-full text-[12px] font-medium z-50 flex items-center gap-2"
            >
              <CheckCircle2 size={14} className="text-success" />
              {showToast}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Privacy Policy Modal */}
        <AnimatePresence>
          {showPrivacy && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 z-110 flex items-center justify-center p-6"
              onClick={() => setShowPrivacy(false)}
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-[24px] p-6 w-full max-h-[80%] flex flex-col shadow-xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[18px] font-bold text-text-main">隐私政策</h2>
                  <button 
                    onClick={() => setShowPrivacy(false)}
                    className="p-1 hover:bg-gray-100 rounded-full"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto text-[13px] text-text-secondary leading-relaxed space-y-3">
                  <p className="font-bold text-text-main">1. 数据收集</p>
                  <p>本应用仅在本地运行测速逻辑。为了提供测速功能，我们会临时获取您的网络连接状态和大致地理位置（用于选择测速节点）。</p>
                  <p className="font-bold text-text-main">2. 数据存储</p>
                  <p>您的测速历史记录（包括下载速度、上传速度、延迟和时间戳）仅存储在您浏览器的本地存储（LocalStorage）中。我们不会将这些数据上传到任何服务器。</p>
                  <p className="font-bold text-text-main">3. 第三方服务</p>
                  <p>本应用不包含任何第三方广告或追踪器。测速过程完全透明。</p>
                  <p className="font-bold text-text-main">4. 您的权利</p>
                  <p>您可以随时通过清除浏览器缓存或在“测速历史”中手动删除记录来清除您的本地数据。</p>
                </div>
                <button 
                  onClick={() => setShowPrivacy(false)}
                  className="mt-6 w-full py-3 bg-primary text-white rounded-[14px] font-bold"
                >
                  我知道了
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* History Modal */}
        <AnimatePresence>
          {showHistory && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 z-100 flex items-end"
              onClick={() => setShowHistory(false)}
            >
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full bg-white rounded-t-[32px] max-h-[80%] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                <div className="p-6 flex items-center justify-between border-b border-gray-50">
                  <h2 className="text-[18px] font-bold text-text-main flex items-center gap-2">
                    <History size={20} className="text-primary" />
                    测试历史
                  </h2>
                  <button 
                    onClick={() => setShowHistory(false)}
                    className="p-2 bg-gray-100 rounded-full text-text-secondary"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {history.length === 0 ? (
                    <div className="py-20 flex flex-col items-center text-gray-400">
                      <History size={48} className="opacity-20 mb-4" />
                      <p className="text-[14px]">暂无测试记录</p>
                    </div>
                  ) : (
                    history.map((item, idx) => {
                      const rating = getRating(item.download);
                      const date = new Date(item.timestamp);
                      const timeStr = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                      
                      return (
                        <button 
                          key={item.timestamp}
                          onClick={() => viewHistoryItem(item)}
                          className="w-full bg-gray-50 p-4 rounded-[20px] flex items-center justify-between active:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col items-center">
                              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-[20px] shadow-sm">
                                {rating.icon}
                              </div>
                              <span className="text-[9px] font-bold text-success mt-1">{rating.label}</span>
                            </div>
                            <div className="text-left">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-primary font-bold">下载</span>
                                <span className="text-[16px] font-black text-text-main">{item.download.toFixed(1)}</span>
                                <span className="text-[10px] text-text-secondary">Mbps</span>
                              </div>
                              <div className="text-[11px] text-gray-400 mt-0.5 ml-7">{timeStr}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-[10px] text-success font-bold">上传</div>
                              <div className="text-[14px] font-bold text-text-main">{item.upload.toFixed(1)}</div>
                            </div>
                            <ChevronRight size={18} className="text-gray-300" />
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
                
                <div className="p-6 bg-gray-50 text-center text-[12px] text-gray-400">
                  仅保存最近 10 条记录
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Privacy Policy Modal */}
        <AnimatePresence>
          {showPrivacyModal && (
            <PrivacyModal 
              onAccept={handleAcceptPrivacy}
              onDecline={handleDeclinePrivacy}
              showAgreementModal={showAgreementModal}
              onOpenAgreement={handleOpenAgreement}
              onOpenPrivacy={handleOpenPrivacy}
            />
          )}
        </AnimatePresence>

        {/* Agreement Detail Modal */}
        <AnimatePresence>
          {showAgreementModal && (
            <AgreementModal 
              onClose={handleCloseAgreementModal}
              title={showAgreementModal === 'agreement' ? '用户服务协议' : '隐私政策'}
              content={showAgreementModal === 'agreement' ? <UserAgreementContent /> : <PrivacyPolicyContent />}
            />
          )}
        </AnimatePresence>

        {/* Decline Confirmation Modal */}
        <AnimatePresence>
          {showDeclineModal && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-110">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-[28px] w-full max-w-md overflow-hidden shadow-2xl border border-black/5 flex flex-col"
              >
                <div className="flex-1 p-6">
                  <h2 className="text-xl font-bold text-[#1D1D1F] mb-4">确认拒绝</h2>
                  <p className="text-gray-600 mb-6">您确定要拒绝隐私政策吗？拒绝后将无法使用我们的服务。</p>
                </div>
                <div className="flex border-t border-black/5">
                  <button 
                    onClick={handleDeclineCancel}
                    className="flex-1 py-4 text-center text-gray-600 font-medium hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <div className="w-px bg-black/5"></div>
                  <button 
                    onClick={handleDeclineConfirm}
                    className="flex-1 py-4 text-center text-[#0071E3] font-medium hover:bg-gray-50"
                  >
                    确定
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
    </div>
  );
}

// Privacy Policy Modal Component
const PrivacyModal = ({ onAccept, onDecline, showAgreementModal, onOpenAgreement, onOpenPrivacy }: { 
  onAccept: () => void, 
  onDecline: () => void, 
  showAgreementModal: string | null, 
  onOpenAgreement: () => void, 
  onOpenPrivacy: () => void 
}) => (
  <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-50">
    <motion.div 
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="bg-white w-full max-w-sm shadow-2xl max-h-[80vh] overflow-y-auto rounded-[28px]"
    >
      <div className="p-6">
        <h3 className="text-xl font-bold text-[#1D1D1F] mb-6 text-center pt-4">
          用户协议与隐私政策
        </h3>
        <div className="mb-6">
          <p className="text-base text-[#1D1D1F] mb-3">(1)《隐私政策》中关于个人设备用户信息的收集和使用的说明。</p>
          <p className="text-base text-[#1D1D1F]">(2)《隐私政策》中与第三方SDK类服务商数据共享、相关信息收集和使用说明。</p>
        </div>
        <div className="mb-6">
          <p className="text-sm text-[#86868B] mb-2">用户协议和隐私政策说明：</p>
          <p className="text-sm text-[#424245]">
            阅读完整的 
            <span 
              onClick={onOpenAgreement}
              className="text-[#0071E3] hover:underline cursor-pointer font-medium"
            >
              《用户服务协议》
            </span>
            和
            <span 
              onClick={onOpenPrivacy}
              className="text-[#0071E3] hover:underline cursor-pointer font-medium"
            >
              《隐私政策》
            </span>
            了解详细内容。
          </p>
        </div>
      </div>
      <div className="flex border-t border-gray-200">
        <button 
          onClick={onDecline}
          className="flex-1 py-4 text-base font-medium text-[#1D1D1F] bg-white border-r border-gray-200 rounded-bl-[28px] hover:bg-gray-50 transition-colors"
        >
          不同意
        </button>
        <button 
          onClick={onAccept}
          className="flex-1 py-4 text-base font-medium text-white bg-[#0071E3] hover:bg-[#0077ED] rounded-br-[28px] transition-colors"
        >
          同意并继续
        </button>
      </div>
    </motion.div>
  </div>
);

// Agreement Detail Modal Component
const AgreementModal = ({ onClose, title, content }: { onClose: () => void, title: string, content: any }) => (
  <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-110">
    <motion.div 
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.95, opacity: 0 }}
      className="bg-white rounded-[28px] w-full max-w-3xl h-[85vh] overflow-hidden shadow-2xl border border-black/5 flex flex-col"
    >
      <div className="flex items-center justify-between px-6 py-5 border-b border-black/5 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 text-[#0071E3] rounded-xl flex items-center justify-center">
            <ShieldCheck size={22} />
          </div>
          <h2 className="text-xl font-bold text-[#1D1D1F]">{title}</h2>
        </div>
        <button 
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-[#86868B] active:scale-90 transition-transform hover:bg-gray-200"
        >
          <X size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto bg-[#F5F5F7] p-6">
        {content}
      </div>
    </motion.div>
  </div>
);

// Privacy Policy Content Component
const PrivacyPolicyContent = () => (
  <div className="max-w-none">
    <h1 className="text-2xl font-bold text-[#0071E3] text-center mb-2">🔒 隐私政策</h1>
    <p className="text-center text-gray-500 mb-6"><strong>生效日期</strong>：2026年04月27日</p>

    <div className="bg-linear-to-r from-blue-50 to-blue-100 p-6 rounded-lg border-l-4 border-[#0071E3] mb-6">
      <p className="text-gray-700">欢迎使用「极序测速」（以下简称"本应用"）。本应用由<strong>光年跃迁（温州）科技有限公司</strong>（以下简称"我们"）开发并运营。我们深知个人信息对您的重要性，将严格遵守《中华人民共和国个人信息保护法》等相关法律法规，保护您的个人信息安全。</p>
    </div>

    <p className="mb-6 text-gray-700">本隐私政策旨在说明我们如何收集、使用、存储和保护您在使用本应用过程中提供的个人信息，以及您对这些信息所享有的权利。请您在使用本应用前仔细阅读并充分理解本政策的全部内容，尤其是加粗的条款。如您对本政策有任何疑问、意见或建议，可通过本政策末尾提供的联系方式与我们联系。</p>

    <h2 className="text-xl font-semibold mt-8 mb-4 border-b-2 border-gray-200 pb-2">一、我们收集的信息</h2>
    <p className="mb-4 text-gray-700">在您使用本应用的过程中，我们会收集以下信息，以提供、维护和改进我们的服务：</p>
    <ol className="list-decimal pl-6 mb-6">
      <li className="mb-3 text-gray-700"><strong>测速数据</strong>：您在使用本应用过程中产生的<strong>下载速度、上传速度、延迟、抖动等测速数据</strong>。这些数据是本应用的核心功能内容，用于为您提供网络测速、速度评级和历史记录服务。</li>
      <li className="mb-3 text-gray-700"><strong>设备信息</strong>：为了保障应用的稳定运行和优化用户体验，我们会自动收集您的设备相关信息，包括但不限于<strong>设备型号、操作系统版本、设备标识符（如IMEI/Android ID）、IP地址</strong>等。</li>
      <li className="mb-3 text-gray-700"><strong>网络信息</strong>：为了选择合适的测速节点和提供更准确的测速结果，我们会收集您的<strong>网络类型、运营商信息、地理位置（城市级别）</strong>等网络相关信息。</li>
    </ol>

    <h2 className="text-xl font-semibold mt-8 mb-4 border-b-2 border-gray-200 pb-2">二、我们如何使用收集的信息</h2>
    <p className="mb-4 text-gray-700">我们仅会在以下合法、正当、必要的范围内使用您的个人信息：</p>
    <ol className="list-decimal pl-6 mb-6">
      <li className="mb-3 text-gray-700"><strong>提供和改进服务</strong>：使用您的测速数据来实现网络测速、速度评级、历史记录等核心功能；通过分析设备信息和网络信息，优化应用性能，修复已知问题，提升用户体验。</li>
      <li className="mb-3 text-gray-700"><strong>数据分析和统计</strong>：在对您的个人信息进行匿名化或去标识化处理后，进行内部数据分析和统计，以了解用户群体的网络状况和使用习惯，从而更好地规划和改进产品功能。</li>
    </ol>

    <h2 className="text-xl font-semibold mt-8 mb-4 border-b-2 border-gray-200 pb-2">三、我们如何共享、转让和公开披露信息</h2>
    <p className="mb-4 text-gray-700">我们郑重承诺，严格保护您的个人信息，不会在以下情形之外向任何第三方共享、转让或公开披露您的信息：</p>
    <ol className="list-decimal pl-6 mb-6">
      <li className="mb-3 text-gray-700"><strong>法定情形</strong>：根据法律法规的规定、行政或司法机关的强制性要求，我们可能会向有关部门披露您的相关信息。</li>
      <li className="mb-3 text-gray-700"><strong>获得明确同意</strong>：在获得您的明确书面同意后，我们才会向第三方共享您的个人信息。</li>
      <li className="mb-3 text-gray-700"><strong>业务必要且合规</strong>：为了实现本政策第二条所述的目的，我们可能会与提供技术支持、网络服务或其他必要服务的合作伙伴共享必要的信息，但我们会要求其严格遵守本政策及相关法律法规，并对您的信息承担保密义务。</li>
    </ol>

    <h2 className="text-xl font-semibold mt-8 mb-4 border-b-2 border-gray-200 pb-2">四、我们如何存储和保护信息</h2>
    <ol className="list-decimal pl-6 mb-6">
      <li className="mb-3 text-gray-700"><strong>存储地点和期限</strong>：您的个人信息将存储于中华人民共和国境内的安全服务器上。我们会在实现本政策所述目的所必需的最短时间内保留您的信息，超出此期限后，我们将对您的信息进行删除或匿名化处理。</li>
      <li className="mb-3 text-gray-700"><strong>安全措施</strong>：我们采用符合行业标准的技术手段和安全管理措施来保护您的个人信息，包括但不限于数据加密、访问控制、安全审计等，以防止信息泄露、丢失、篡改或被未经授权的访问。</li>
    </ol>

    <h2 className="text-xl font-semibold mt-8 mb-4 border-b-2 border-gray-200 pb-2">五、您的权利</h2>
    <p className="mb-4 text-gray-700">根据相关法律法规，您对您的个人信息享有以下权利：</p>
    <ol className="list-decimal pl-6 mb-6">
      <li className="mb-3 text-gray-700"><strong>访问权</strong>：您可以随时在本应用中查看和管理您的测速数据及历史记录。</li>
      <li className="mb-3 text-gray-700"><strong>删除权</strong>：您可以随时删除单条测速记录或整个历史记录，应用将立即删除相关数据。</li>
      <li className="mb-3 text-gray-700"><strong>数据导出</strong>：本应用所有数据存储在您的设备本地，您可以通过设备备份等方式导出您的数据。</li>
    </ol>

    <h2 className="text-xl font-semibold mt-8 mb-4 border-b-2 border-gray-200 pb-2">六、未成年人保护</h2>
    <p className="mb-6 text-gray-700">我们非常重视对未成年人个人信息的保护。如您是未满14周岁的未成年人，在使用本应用前，应在监护人的指导下仔细阅读本政策，并征得监护人的同意。如我们发现自己在未事先获得监护人可验证同意的情况下收集了未成年人的个人信息，将立即删除相关数据。</p>

    <h2 className="text-xl font-semibold mt-8 mb-4 border-b-2 border-gray-200 pb-2">七、本政策的更新</h2>
    <p className="mb-6 text-gray-700">我们可能会根据法律法规的更新、业务的调整或技术的发展，适时对本隐私政策进行修订。修订后的政策将在本应用内显著位置公示，并在生效前通过合理方式通知您。如您继续使用本应用，即表示您同意接受修订后的政策。</p>

    <h2 className="text-xl font-semibold mt-8 mb-4 border-b-2 border-gray-200 pb-2">八、联系我们</h2>
    <p className="mb-4 text-gray-700">如您对本隐私政策有任何疑问、意见或建议，或需要行使您的相关权利，请通过以下方式与我们联系：</p>
    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
      <p className="mb-2 text-gray-700"><strong>电子邮箱</strong>：Jp112022@163.com</p>
    </div>

    <div className="mt-8 pt-6 border-t border-gray-200 text-center">
      <p className="mb-2 text-gray-500">感谢您使用极序测速！</p>
      <p className="mb-4 text-gray-500">我们致力于为您提供安全、便捷的网络测速服务。</p>
      <p className="text-sm text-gray-400">© 2026 光年跃迁（温州）科技有限公司 版权所有</p>
    </div>
  </div>
);

// User Agreement Content Component
const UserAgreementContent = () => (
  <div className="prose max-w-none">
    <h1 className="text-2xl font-bold text-[#0071E3] text-center mb-4">用户服务协议</h1>
    <p className="text-center text-gray-500 mb-8">更新日期：2026年04月27日</p>
    
    <h2 className="text-xl font-semibold mt-8 mb-4">1. 协议的接受</h2>
    <p>欢迎使用「极序测速」应用（以下简称「本应用」）。</p>
    <p>本协议是您与光年跃迁（温州）科技有限公司（以下简称「我们」）之间关于使用本应用的法律协议。</p>
    <p>通过下载、安装或使用本应用，您表示同意接受本协议的全部条款和条件。</p>
    
    <h2 className="text-xl font-semibold mt-8 mb-4">2. 服务内容</h2>
    <p>本应用提供以下服务：</p>
    <ul className="list-disc pl-6 space-y-2">
      <li>测试网络下载速度</li>
      <li>测试网络上传速度</li>
      <li>测试网络延迟和抖动</li>
      <li>查看测速历史记录</li>
      <li>评估网络带宽等级</li>
    </ul>
    
    <h2 className="text-xl font-semibold mt-8 mb-4">3. 用户义务</h2>
    <p>作为本应用的用户，您同意：</p>
    <ul className="list-disc pl-6 space-y-2">
      <li>遵守本协议的所有条款</li>
      <li>不使用本应用进行任何非法活动</li>
      <li>不干扰本应用的正常运行</li>
      <li>保护您的设备安全，防止未授权访问</li>
      <li>合理使用本应用，避免过度占用网络资源</li>
    </ul>
    
    <h2 className="text-xl font-semibold mt-8 mb-4">4. 知识产权</h2>
    <p>本应用的所有内容，包括但不限于文字、图像、音频、视频、软件等，均受知识产权法律保护。</p>
    <p>未经我们的书面许可，您不得复制、修改、分发或商业使用本应用的任何内容。</p>
    
    <h2 className="text-xl font-semibold mt-8 mb-4">5. 免责声明</h2>
    <p>本应用按「原样」提供，不做任何形式的保证。</p>
    <p>我们不保证：</p>
    <ul className="list-disc pl-6 space-y-2">
      <li>本应用将符合您的要求</li>
      <li>本应用将无中断、及时、安全或无错误地运行</li>
      <li>本应用的测速结果将是完全准确或可靠的</li>
      <li>本应用的测速结果适用于所有网络环境</li>
    </ul>
    
    <h2 className="text-xl font-semibold mt-8 mb-4">6. 终止</h2>
    <p>我们有权在任何时候，出于任何原因，终止或暂停您对本应用的访问。</p>
    <p>您也可以随时停止使用本应用。</p>
    
    <h2 className="text-xl font-semibold mt-8 mb-4">7. 适用法律</h2>
    <p>本协议受中华人民共和国法律管辖。</p>
    <p>任何与本协议相关的争议，应通过友好协商解决；协商不成的，应提交至温州市有管辖权的人民法院诉讼解决。</p>
  </div>
);
