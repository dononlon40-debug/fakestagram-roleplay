import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Cropper, { Area } from 'react-easy-crop';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Maximize2, Minimize2, RotateCcw, RotateCw } from 'lucide-react';

interface Props {
  image: string;
  onCropDone: (croppedImage: string) => void;
  onCancel: () => void;
  aspectRatio?: number;
  cropShape?: 'round' | 'rect';
}

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', reject);
    img.crossOrigin = 'anonymous';
    img.src = url;
  });

function getRadians(deg: number) {
  return (deg * Math.PI) / 180;
}

function rotatedSize(width: number, height: number, rotation: number) {
  const r = getRadians(rotation);
  return {
    width: Math.abs(Math.cos(r) * width) + Math.abs(Math.sin(r) * height),
    height: Math.abs(Math.sin(r) * width) + Math.abs(Math.cos(r) * height),
  };
}

async function getCroppedImg(imageSrc: string, pixelCrop: Area, rotation: number): Promise<string> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const { width: bBoxWidth, height: bBoxHeight } = rotatedSize(image.width, image.height, rotation);

  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(getRadians(rotation));
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  const data = ctx.getImageData(pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height);
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  ctx.putImageData(data, 0, 0);

  return canvas.toDataURL('image/jpeg', 0.92);
}

const ImageCropper = ({ image, onCropDone, onCancel, aspectRatio = 1, cropShape = 'round' }: Props) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [objectFit, setObjectFit] = useState<'contain' | 'cover'>('contain');
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleDone = async () => {
    if (!croppedAreaPixels) return;
    const cropped = await getCroppedImg(image, croppedAreaPixels, rotation);
    onCropDone(cropped);
  };

  const fitToScreen = () => {
    setObjectFit('contain');
    setZoom(1);
    setCrop({ x: 0, y: 0 });
  };

  const fillScreen = () => {
    setObjectFit('cover');
    setZoom(1);
    setCrop({ x: 0, y: 0 });
  };

  const resetRotation = () => setRotation(0);

  return createPortal(
    <div className="fixed inset-0 z-[300] flex flex-col" style={{ pointerEvents: 'auto' }}>
      {/* Blurred gradient background sampled from the image */}
      <div className="absolute inset-0 bg-black overflow-hidden">
        <img
          src={image}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: 'blur(80px) saturate(1.8) brightness(0.6)', transform: 'scale(1.4)' }}
        />
        <div className="absolute inset-0 bg-black/40" />
      </div>

      {/* Top bar */}
      <div className="relative flex items-center justify-between p-4 z-10">
        <Button variant="ghost" onClick={onCancel} className="text-white hover:bg-white/10">Cancel</Button>
        <span className="text-white font-semibold">Edit Photo</span>
        <Button variant="ghost" onClick={handleDone} className="text-primary hover:bg-white/10">Done</Button>
      </div>

      {/* Cropper */}
      <div className="relative flex-1">
        <Cropper
          image={image}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={aspectRatio}
          cropShape={cropShape}
          showGrid={false}
          minZoom={0.5}
          maxZoom={2}
          zoomSpeed={0.4}
          restrictPosition={false}
          objectFit={objectFit === 'cover' ? 'cover' : 'contain'}
          onCropChange={setCrop}
          onCropComplete={onCropComplete}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          style={{
            containerStyle: { background: 'transparent' },
            mediaStyle: { transition: 'transform 120ms ease-out' },
          }}
        />
      </div>

      {/* Controls */}
      <div className="relative z-10 p-4 space-y-3 bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="text-white text-xs w-14">Zoom</span>
          <Slider
            value={[zoom]}
            min={0.5}
            max={2}
            step={0.01}
            onValueChange={([v]) => setZoom(v)}
            className="flex-1"
          />
          <span className="text-white/70 text-xs w-12 text-right tabular-nums">{Math.round(zoom * 100)}%</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white text-xs w-14">Rotate</span>
          <Slider
            value={[rotation]}
            min={-180}
            max={180}
            step={1}
            onValueChange={([v]) => setRotation(v)}
            className="flex-1"
          />
          <span className="text-white/70 text-xs w-12 text-right tabular-nums">{rotation}°</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <Button size="sm" variant="secondary" onClick={fitToScreen} className="gap-1.5">
            <Minimize2 size={14} /> Fit
          </Button>
          <Button size="sm" variant="secondary" onClick={fillScreen} className="gap-1.5">
            <Maximize2 size={14} /> Fill
          </Button>
          <Button size="sm" variant="secondary" onClick={resetRotation} className="gap-1.5">
            <RotateCcw size={14} /> Reset rotation
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setRotation(r => r - 90)} className="gap-1.5">
            <RotateCcw size={14} /> -90°
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setRotation(r => r + 90)} className="gap-1.5">
            <RotateCw size={14} /> +90°
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ImageCropper;
