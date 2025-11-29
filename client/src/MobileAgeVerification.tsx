/**
 * MobileAgeVerification Component
 * Standalone page for mobile users to complete age verification
 * after scanning QR code from desktop
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as faceapi from '@vladmandic/face-api';

// Model URLs
const MODEL_URL = import.meta.env.VITE_FACE_API_MODEL_URL || 
  'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model';

// Age estimation tolerance (face-api has ±5 years accuracy on average)
const AGE_TOLERANCE = 3;

type VerificationState = 
  | 'loading'
  | 'ready'
  | 'detecting'
  | 'analyzing'
  | 'success'
  | 'failed'
  | 'error'
  | 'no-session';

interface DetectionResult {
  age: number;
  confidence: number;
}

const MobileAgeVerification: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [state, setState] = useState<VerificationState>('loading');
  const [error, setError] = useState<string>('');
  const [progress, setProgress] = useState<string>('');
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [ageReadings, setAgeReadings] = useState<number[]>([]);
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdown, setCountdown] = useState<number>(3);
  
  // Get session ID from URL
  const sessionId = new URLSearchParams(window.location.search).get('session');
  const minAge = 18;

  // Notify server that QR was scanned
  const notifyScan = useCallback(async () => {
    if (!sessionId) return;
    
    try {
      await fetch(`/api/verify-age/scan/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      console.log('Could not notify scan');
    }
  }, [sessionId]);

  // Load face-api models
  const loadModels = useCallback(async () => {
    if (!sessionId) {
      setState('no-session');
      return;
    }

    try {
      setProgress('Loading face detection...');
      
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      ]);
      
      // Notify desktop that QR was scanned
      await notifyScan();
      
      setProgress('Ready');
      setState('ready');
    } catch (err) {
      console.error('Error loading models:', err);
      setError('Failed to load. Please refresh.');
      setState('error');
    }
  }, [sessionId, notifyScan]);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setProgress('Accessing camera...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'user',
          width: { ideal: 480 },
          height: { ideal: 640 }
        }
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      setState('detecting');
      setProgress('Position your face');
    } catch (err) {
      console.error('Camera error:', err);
      setError('Camera access denied');
      setState('error');
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Send verification result to server
  const sendVerificationResult = useCallback(async (verified: boolean) => {
    if (!sessionId) return;
    
    try {
      await fetch(`/api/verify-age/complete/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verified })
      });
    } catch (err) {
      console.error('Failed to send result:', err);
    }
  }, [sessionId]);

  // Detect face
  const detectFace = useCallback(async () => {
    if (!videoRef.current || state !== 'detecting') return;

    try {
      const detections = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withAgeAndGender();

      if (detections) {
        const { age } = detections;

        // Draw on canvas
        if (canvasRef.current && videoRef.current) {
          const displaySize = { 
            width: videoRef.current.videoWidth, 
            height: videoRef.current.videoHeight 
          };
          faceapi.matchDimensions(canvasRef.current, displaySize);
          
          const resizedDetections = faceapi.resizeResults(detections, displaySize);
          
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            faceapi.draw.drawDetections(canvasRef.current, resizedDetections);
          }
        }

        setAgeReadings(prev => [...prev, age].slice(-10));

        setDetectionResult({
          age: Math.round(age),
          confidence: detections.detection.score
        });

        // Start countdown after enough readings
        if (ageReadings.length >= 5 && !showCountdown) {
          const avgAge = ageReadings.reduce((a, b) => a + b, 0) / ageReadings.length;
          
          if (avgAge >= minAge - AGE_TOLERANCE) {
            setShowCountdown(true);
            setCountdown(3);
          }
        }
      } else {
        setDetectionResult(null);
        setProgress('Position your face in frame');
      }
    } catch (err) {
      console.error('Detection error:', err);
    }
  }, [state, ageReadings, showCountdown]);

  // Detection loop
  useEffect(() => {
    let animationId: number;

    const detectLoop = async () => {
      await detectFace();
      if (state === 'detecting') {
        animationId = requestAnimationFrame(detectLoop);
      }
    };

    if (state === 'detecting') {
      detectLoop();
    }

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [state, detectFace]);

  // Countdown
  useEffect(() => {
    if (!showCountdown) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          performVerification();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showCountdown]);

  // Perform verification
  const performVerification = useCallback(() => {
    setState('analyzing');
    setProgress('Verifying...');

    setTimeout(async () => {
      const avgAge = ageReadings.reduce((a, b) => a + b, 0) / ageReadings.length;
      const verified = avgAge >= minAge - AGE_TOLERANCE;
      
      await sendVerificationResult(verified);
      
      if (verified) {
        setState('success');
        stopCamera();
      } else {
        setState('failed');
        stopCamera();
      }
    }, 1500);
  }, [ageReadings, sendVerificationResult, stopCamera]);

  // Load on mount
  useEffect(() => {
    loadModels();
    return () => stopCamera();
  }, [loadModels, stopCamera]);

  // No session
  if (state === 'no-session') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-neutral-900">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-white mb-2">Invalid Link</h2>
          <p className="text-neutral-400">Please scan a valid QR code from the desktop application.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-neutral-900">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">🔐</div>
          <h2 className="text-xl font-bold text-white">Age Verification</h2>
          <p className="text-neutral-400 text-sm">Verify you are {minAge}+</p>
        </div>

        {/* Camera View */}
        <div className="relative aspect-[3/4] bg-neutral-800 rounded-xl overflow-hidden mb-4">
          {(state === 'detecting' || state === 'analyzing') && (
            <>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full"
              />
              
              {showCountdown && countdown > 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <div className="text-6xl font-bold text-white animate-pulse">
                    {countdown}
                  </div>
                </div>
              )}

              {detectionResult && (
                <div className="absolute bottom-2 left-2 right-2 bg-black/70 p-2 rounded-lg">
                  <p className="text-green-400 text-sm">
                    ✓ Face detected
                  </p>
                </div>
              )}
            </>
          )}

          {state === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-3"></div>
              <p className="text-neutral-400 text-sm">{progress}</p>
            </div>
          )}

          {state === 'ready' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-5xl mb-3">📷</div>
              <p className="text-neutral-300">Tap to start</p>
            </div>
          )}

          {state === 'success' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-900/40">
              <div className="text-6xl mb-3">✅</div>
              <p className="text-green-400 text-xl font-bold">Verified!</p>
              <p className="text-neutral-300 text-sm mt-2">Return to your computer</p>
            </div>
          )}

          {state === 'failed' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/40">
              <div className="text-6xl mb-3">❌</div>
              <p className="text-red-400 text-xl font-bold">Failed</p>
              <p className="text-neutral-300 text-sm mt-2">Must be {minAge}+</p>
            </div>
          )}

          {state === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/40">
              <div className="text-5xl mb-3">⚠️</div>
              <p className="text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Buttons */}
        {state === 'ready' && (
          <button
            onClick={startCamera}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl"
          >
            Start Verification 📷
          </button>
        )}

        {(state === 'failed' || state === 'error') && (
          <button
            onClick={() => {
              setAgeReadings([]);
              setShowCountdown(false);
              setError('');
              setState('ready');
            }}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl"
          >
            Try Again
          </button>
        )}

        {/* Privacy Note */}
        <p className="text-neutral-500 text-xs text-center mt-4">
          🔒 Face analysis runs locally. No data stored.
        </p>
      </div>
    </div>
  );
};

export default MobileAgeVerification;
