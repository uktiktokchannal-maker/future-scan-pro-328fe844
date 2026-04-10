import { useRef, useState, useCallback, useEffect } from "react";
import { Camera, Zap, ZapOff } from "lucide-react";
import futureLogo from "@/assets/future-logo.png";
import { useAuth } from "@/hooks/useAuth";

interface ScannerViewProps {
  onCapture: (imageData: string) => void;
}

const compressImage = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): string => {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.5);
};

const ScannerView = ({ onCapture }: ScannerViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      console.error("لا يمكن الوصول للكاميرا");
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
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const maxDim = 1280;
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = compressImage(canvas, ctx);
        if (navigator.vibrate) navigator.vibrate(50);
        onCapture(imageData);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, [onCapture]);

  const capturePhoto = useCallback(() => {
    if (isStreaming && videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const maxDim = 1280;
      const scale = Math.min(maxDim / video.videoWidth, maxDim / video.videoHeight, 1);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = compressImage(canvas, ctx);
      if (navigator.vibrate) navigator.vibrate(50);
      onCapture(imageData);
    } else {
      // Fallback: open file picker
      fileInputRef.current?.click();
    }
  }, [isStreaming, onCapture]);

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
          {isStreaming ? "ضع الإيصال داخل الإطار" : "اضغط على الزر أدناه لالتقاط الإيصال"}
        </p>
      </div>

      {/* Capture Button */}
      <div className="flex justify-center pb-8">
        <button onClick={capturePhoto}
          className="w-20 h-20 rounded-full gradient-primary shadow-glow-strong animate-pulse-glow flex items-center justify-center transition-transform active:scale-90">
          <div className="w-16 h-16 rounded-full border-4 border-primary-foreground/30 flex items-center justify-center">
            <Camera className="h-7 w-7 text-primary-foreground" />
          </div>
        </button>
      </div>

      {/* Hidden file input for fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default ScannerView;
