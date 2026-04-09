import { useRef, useState, useCallback, useEffect } from "react";
import { Camera, Zap, ZapOff } from "lucide-react";
import futureLogo from "@/assets/future-logo.png";
import { useAuth } from "@/hooks/useAuth";

interface ScannerViewProps {
  onCapture: (imageData: string) => void;
}

// Compress and convert image to grayscale for faster upload & AI processing
const compressImage = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): string => {
  // Convert to grayscale for better OCR
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
  ctx.putImageData(imageData, 0, 0);
  
  // Compress to JPEG at 0.5 quality (~200KB instead of 5MB)
  return canvas.toDataURL("image/jpeg", 0.5);
};

const ScannerView = ({ onCapture }: ScannerViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
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
      }
    } catch {
      console.error("لا يمكن الوصول للكاميرا");
    }
  }, []);

  // Auto-open camera on mount
  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [startCamera]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Resize to max 1280px for faster processing
    const maxDim = 1280;
    const scale = Math.min(maxDim / video.videoWidth, maxDim / video.videoHeight, 1);
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageData = compressImage(canvas, ctx);
    
    // Haptic feedback on capture
    if (navigator.vibrate) navigator.vibrate(50);
    
    onCapture(imageData);
  }, [onCapture]);

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[calc(100vh-5rem)]">
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4">
        <button onClick={() => setFlashOn(!flashOn)} className="p-2 rounded-full glass-card">
          {flashOn ? <Zap className="h-5 w-5 text-primary" /> : <ZapOff className="h-5 w-5 text-muted-foreground" />}
        </button>
        <div className="flex items-center gap-3">
          {profile && <span className="text-xs text-muted-foreground">أهلاً {profile.full_name}</span>}
          <img src={futureLogo} alt="Future" className="h-10 object-contain" />
        </div>
      </div>

      <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden bg-background">
        {isStreaming ? (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
            <div className="relative z-10 w-72 h-48 border-2 border-primary/60 rounded-2xl shadow-glow">
              <div className="absolute -top-0.5 -right-0.5 w-8 h-8 border-t-2 border-r-2 border-primary rounded-tr-2xl" />
              <div className="absolute -top-0.5 -left-0.5 w-8 h-8 border-t-2 border-l-2 border-primary rounded-tl-2xl" />
              <div className="absolute -bottom-0.5 -right-0.5 w-8 h-8 border-b-2 border-r-2 border-primary rounded-br-2xl" />
              <div className="absolute -bottom-0.5 -left-0.5 w-8 h-8 border-b-2 border-l-2 border-primary rounded-bl-2xl" />
            </div>
            <p className="absolute bottom-32 z-10 text-sm text-muted-foreground">ضع الإيصال داخل الإطار</p>
          </>
        ) : (
          <div className="flex flex-col items-center gap-6 text-center px-8">
            <div className="w-24 h-24 rounded-full glass-card flex items-center justify-center animate-pulse">
              <Camera className="h-10 w-10 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground mb-2">جاري تشغيل الكاميرا...</h2>
              <p className="text-sm text-muted-foreground">يرجى السماح بالوصول للكاميرا</p>
            </div>
            <button onClick={startCamera}
              className="gradient-primary text-primary-foreground px-8 py-3 rounded-xl font-bold text-lg shadow-glow transition-all hover:shadow-glow-strong">
              تشغيل الكاميرا
            </button>
          </div>
        )}
      </div>

      {isStreaming && (
        <div className="absolute bottom-8 z-20">
          <button onClick={capturePhoto}
            className="w-20 h-20 rounded-full gradient-primary shadow-glow-strong animate-pulse-glow flex items-center justify-center transition-transform active:scale-90">
            <div className="w-16 h-16 rounded-full border-4 border-primary-foreground/30 flex items-center justify-center">
              <Camera className="h-7 w-7 text-primary-foreground" />
            </div>
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default ScannerView;
