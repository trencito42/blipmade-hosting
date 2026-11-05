import { memLabel } from '../../../lib/pricing';
import type { ResourceBreakdown } from '../../../lib/api';

interface ResourceConfigurationStepProps {
  ram: number;
  cpu: number;
  disk: number;
  minRam: number;
  maxRam: number;
  minCpu: number;
  maxCpu: number;
  minDisk: number;
  maxDisk: number;
  onChangeRam: (ram: number) => void;
  onChangeCpu: (cpu: number) => void;
  onChangeDisk: (disk: number) => void;
  breakdown?: ResourceBreakdown | null;
  recommendedRam?: number | null;
  recommendedCpu?: number | null;
  recommendedDisk?: number | null;
}

export function ResourceConfigurationStep({
  ram,
  cpu,
  disk,
  minRam,
  maxRam,
  minCpu,
  maxCpu,
  minDisk,
  maxDisk,
  onChangeRam,
  onChangeCpu,
  onChangeDisk,
  recommendedRam,
  recommendedCpu,
  recommendedDisk,
}: ResourceConfigurationStepProps) {
  // Common RAM presets: 512, 1024, 2048, 4096, 6144, 8192, 12288, 16384
  const ramPresets = [512, 1024, 2048, 4096, 6144, 8192, 12288, 16384].filter(
    (val) => val >= minRam && val <= maxRam,
  );

  return (
    <div className="grid gap-6">
      {/* RAM Control */}
      <div className="grid gap-3 rounded-2xl border border-line bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <label htmlFor="ram-slider" className="font-semibold text-ink">
              Memory (RAM)
            </label>
            <p className="text-[12.5px] text-ink3">
              Allocated dedicated memory. {recommendedRam ? `Recommended: ${memLabel(recommendedRam)}.` : ''}
            </p>
          </div>
          <span className="font-mono text-[20px] font-bold text-ink">{memLabel(ram)}</span>
        </div>

        <input
          id="ram-slider"
          type="range"
          min={minRam}
          max={maxRam}
          step={minRam >= 1024 ? 1024 : 256}
          value={ram}
          onChange={(e) => onChangeRam(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-s1 accent-acc"
        />

        {ramPresets.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {ramPresets.map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => onChangeRam(val)}
                className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  ram === val ? 'bg-acc text-on-acc font-semibold' : 'bg-s1 text-ink2 hover:bg-ink/10'
                }`}
              >
                {memLabel(val)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* CPU Control */}
      <div className="grid gap-3 rounded-2xl border border-line bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <label htmlFor="cpu-slider" className="font-semibold text-ink">
              Processor (vCPU)
            </label>
            <p className="text-[12.5px] text-ink3">
              Virtual processor cores. {recommendedCpu ? `Recommended: ${recommendedCpu} vCPU.` : ''}
            </p>
          </div>
          <span className="font-mono text-[20px] font-bold text-ink">{cpu} vCPU</span>
        </div>

        <input
          id="cpu-slider"
          type="range"
          min={minCpu}
          max={maxCpu}
          step={0.5}
          value={cpu}
          onChange={(e) => onChangeCpu(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-s1 accent-acc"
        />

        <div className="flex flex-wrap gap-1.5 pt-1">
          {[1, 2, 4, 6, 8]
            .filter((val) => val >= minCpu && val <= maxCpu)
            .map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => onChangeCpu(val)}
                className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  cpu === val ? 'bg-acc text-on-acc font-semibold' : 'bg-s1 text-ink2 hover:bg-ink/10'
                }`}
              >
                {val} vCPU
              </button>
            ))}
        </div>
      </div>

      {/* Disk Control */}
      <div className="grid gap-3 rounded-2xl border border-line bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <label htmlFor="disk-slider" className="font-semibold text-ink">
              NVMe Storage
            </label>
            <p className="text-[12.5px] text-ink3">
              High-speed enterprise SSD storage. {recommendedDisk ? `Recommended: ${recommendedDisk} GB.` : ''}
            </p>
          </div>
          <span className="font-mono text-[20px] font-bold text-ink">{disk} GB</span>
        </div>

        <input
          id="disk-slider"
          type="range"
          min={minDisk}
          max={maxDisk}
          step={5}
          value={disk}
          onChange={(e) => onChangeDisk(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-s1 accent-acc"
        />

        <div className="flex flex-wrap gap-1.5 pt-1">
          {[10, 20, 40, 60, 100, 200]
            .filter((val) => val >= minDisk && val <= maxDisk)
            .map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => onChangeDisk(val)}
                className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  disk === val ? 'bg-acc text-on-acc font-semibold' : 'bg-s1 text-ink2 hover:bg-ink/10'
                }`}
              >
                {val} GB
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

