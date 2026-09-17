import { useEffect, useRef, useState } from 'react';
import { Camera, PackageSearch } from 'lucide-react';
import { Button, Field, inputCls } from '@/components/ui';

export interface ScannedProduct {
  name: string;
  calories: number; // per 100g
  protein: number;
  carbs: number;
  fat: number;
  imageUrl?: string;
  servingGrams?: number | null;
}

type BarcodeDetectorCtor = new (opts?: { formats: string[] }) => {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
};

/**
 * Barcode capture: uses the native BarcodeDetector API when available
 * (Chrome/Android), with manual entry as a universal fallback.
 * Lookup happens against the free Open Food Facts database.
 */
export const BarcodeScanner = ({
  onDetected,
}: {
  onDetected: (code: string) => void;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [manual, setManual] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  const startCamera = async () => {
    setScanError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      const Ctor = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector;
      const detector = new Ctor({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) {
            stopCamera();
            onDetected(codes[0].rawValue);
            return;
          }
        } catch {
          /* transient decode errors are expected */
        }
        requestAnimationFrame(() => void tick());
      };
      void tick();
    } catch {
      stopCamera();
      setScanError('Camera access was blocked or is unavailable — type the barcode manually below.');
    }
  };

  const lookup = (code: string) => {
    if (!code.trim()) return;
    stopCamera();
    onDetected(code.trim());
  };

  return (
    <div className="space-y-4">
      {supported && (
        <>
          {scanning ? (
            <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-video">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              <div className="absolute inset-x-8 top-1/2 h-0.5 bg-teal-400/80 animate-pulse" />
              <Button
                variant="secondary"
                size="sm"
                className="absolute bottom-3 right-3"
                onClick={stopCamera}
              >
                Stop
              </Button>
            </div>
          ) : (
            <button
              onClick={startCamera}
              className="w-full rounded-2xl border-2 border-dashed border-teal-200 bg-teal-50/50 text-teal-700 py-6 flex flex-col items-center gap-2 hover:bg-teal-50 transition"
            >
              <Camera className="w-7 h-7" />
              <span className="text-sm font-semibold">Scan with camera</span>
              <span className="text-xs text-teal-600/70">Point at the product barcode</span>
            </button>
          )}
          {scanError && <p className="text-sm text-amber-600">{scanError}</p>}
        </>
      )}

      <Field label="Barcode number">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <PackageSearch className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              placeholder="e.g. 7290016030415"
              className={`${inputCls} pl-10`}
              onKeyDown={(e) => e.key === 'Enter' && lookup(manual)}
            />
          </div>
          <Button variant="secondary" onClick={() => lookup(manual)} disabled={!manual}>
            Look up
          </Button>
        </div>
      </Field>
    </div>
  );
};

/** Fetch a product from Open Food Facts by barcode. Throws friendly errors. */
export async function fetchProductByBarcode(code: string): Promise<ScannedProduct> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,image_small_url,serving_size,nutriments`
  );
  if (!res.ok) throw new Error('Could not reach the product database. Check your connection and try again.');
  const json = (await res.json()) as {
    status: number;
    product?: {
      product_name?: string;
      image_small_url?: string;
      serving_size?: string;
      nutriments?: Record<string, number | undefined>;
    };
  };
  if (json.status === 0 || !json.product) throw new Error(`No product found for barcode ${code}.`);
  const p = json.product;
  const n = p.nutriments || {};
  const name = p.product_name?.trim();
  if (!name) throw new Error('This product has no name in the database yet.');
  const kcal = n['energy-kcal_100g'];
  if (kcal == null) throw new Error(`“${name}” has no calorie data in the database yet.`);
  const servingMatch = /(\d+)\s*g/i.exec(p.serving_size || '');
  return {
    name,
    calories: Math.round(kcal * 10) / 10,
    protein: Math.round((n.proteins_100g ?? 0) * 10) / 10,
    carbs: Math.round((n.carbohydrates_100g ?? 0) * 10) / 10,
    fat: Math.round((n.fat ?? 0) * 10) / 10,
    imageUrl: p.image_small_url,
    servingGrams: servingMatch ? Number(servingMatch[1]) : null,
  };
}
