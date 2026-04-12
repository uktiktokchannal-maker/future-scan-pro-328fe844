import { useRef, useState, useCallback, useEffect } from "react";
import { Camera, ImagePlus, Zap, ZapOff } from "lucide-react";
import futureLogo from "@/assets/future-logo.png";
import { useAuth } from "@/hooks/useAuth";

interface ScannerViewProps {
  onCapture: (imageData: string) => void;
}

const MAX_CAPTURE_DIMENSION = 960;
const JPEG_QUALITY = 0.45;

const renderOptimizedImage = (
  source: CanvasImageSource,
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
) => {
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.filter = "grayscale(1) contrast(1.08) brightness(1.04)";
  ctx.drawImage(source, 0, 0, width, height);
  ctx.filter = "none";

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
};

const ScannerView = ({ onCapture }: ScannerViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const { profile } = useAuth();

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsStreaming(true);
        setCameraFailed(false);
      }
    } catch {
      console.warn("[ScannerView] Camera not available, using file picker fallback");
      setCameraFailed(true);
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [startCamera]);

  const processImageFile = useCallback((file: File) => {
    console.log("[ScannerView] Processing file:", file.name, file.size, "bytes");
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) {
          console.error("[ScannerView] Canvas ref is null");
          return;
        }
        const scale = Math.min(MAX_CAPTURE_DIMENSION / img.width, MAX_CAPTURE_DIMENSION / img.height, 1);
        const imageData = renderOptimizedImage(img, canvas, Math.round(img.width * scale), Math.round(img.height * scale));
        if (!imageData) {
          console.error("[ScannerView] renderOptimizedImage returned null");
          return;
        }
        console.log("[ScannerView] Image processed, size:", imageData.length, "chars");
        if (navigator.vibrate) navigator.vibrate(50);
        onCapture(imageData);
      };
      img.onerror = () => console.error("[ScannerView] Failed to load image from FileReader");
      img.src = e.target?.result as string;
    };
    reader.onerror = () => console.error("[ScannerView] FileReader error");
    reader.readAsDataURL(file);
  }, [onCapture]);

  const capturePhoto = useCallback(() => {
    // If camera is streaming and has valid video, capture from it
    if (
      isStreaming &&
      videoRef.current &&
      canvasRef.current &&
      videoRef.current.videoWidth > 0 &&
      videoRef.current.videoHeight > 0
    ) {
      console.log("[ScannerView] Capturing from live camera");
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const scale = Math.min(MAX_CAPTURE_DIMENSION / video.videoWidth, MAX_CAPTURE_DIMENSION / video.videoHeight, 1);
      const imageData = renderOptimizedImage(
        video,
        canvas,
        Math.round(video.videoWidth * scale),
        Math.round(video.videoHeight * scale),
      );
      if (!imageData) return;
      if (navigator.vibrate) navigator.vibrate(50);
      onCapture(imageData);
    } else {
      // Always fallback to file picker
      console.log("[ScannerView] Opening file picker (camera not available)");
      fileInputRef.current?.click();
    }
  }, [isStreaming, onCapture]);

  const openGallery = useCallback(() => {
    console.log("[ScannerView] Opening gallery picker");
    galleryInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
      e.target.value = "";
    }
  }, [processImageFile]);

  return (
    <div className="relative flex flex-col min-h-[calc(100vh-5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <button onClick={() => setFlashOn(!flashOn)} className="p-2 rounded-full glass-card">
          {flashOn ? <Zap className="h-5 w-5 text-primary" /> : <ZapOff className="h-5 w-5 text-muted-foreground" />}
        </button>
        <div className="flex items-center gap-3">
          {profile && <span className="text-sm text-muted-foreground">أهلاً {profile.full_name}</span>}
          <img src={futureLogo} alt="Future" className="h-10 object-contain" />
        </div>
      </div>

      {/* Camera / Placeholder Area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
        <div className="relative w-full max-w-sm aspect-[4/3] rounded-2xl border-2 border-primary/60 overflow-hidden flex items-center justify-center bg-card/50">
          {isStreaming ? (
            <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <Camera className="h-16 w-16 text-muted-foreground/40" />
          )}
          {/* Corner decorations */}
          <div className="absolute top-0 right-0 w-10 h-10 border-t-2 border-r-2 border-primary rounded-tr-2xl pointer-events-none" />
          <div className="absolute top-0 left-0 w-10 h-10 border-t-2 border-l-2 border-primary rounded-tl-2xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-10 h-10 border-b-2 border-r-2 border-primary rounded-br-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-10 h-10 border-b-2 border-l-2 border-primary rounded-bl-2xl pointer-events-none" />
        </div>

        <p className="text-sm text-muted-foreground">
          {cameraFailed
            ? "تعذر فتح الكاميرا، اختر صورة الإيصال من المعرض"
            : isStreaming
              ? "ضع الإيصال داخل الإطار"
              : "جاري تجهيز الكاميرا، أو اختر صورة الإيصال"}
        </p>
      </div>

      {/* Capture & Gallery Buttons */}
      <div className="flex items-center justify-center gap-6 pb-8">
        {/* Gallery button */}
        <button onClick={openGallery}
          className="w-14 h-14 rounded-full glass-card border border-border flex items-center justify-center transition-transform active:scale-90">
          <ImagePlus className="h-6 w-6 text-muted-foreground" />
        </button>

        {/* Main capture button */}
        <button onClick={capturePhoto}
          className="w-20 h-20 rounded-full gradient-primary shadow-glow-strong animate-pulse-glow flex items-center justify-center transition-transform active:scale-90">
          <div className="w-16 h-16 rounded-full border-4 border-primary-foreground/30 flex items-center justify-center">
            <Camera className="h-7 w-7 text-primary-foreground" />
          </div>
        </button>

        {/* Spacer for symmetry */}
        <div className="w-14 h-14" />
      </div>

      {/* Hidden file input for camera capture */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      {/* Hidden file input for gallery (no capture attribute) */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default ScannerView;
