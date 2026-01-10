'use client';

// Deterministic bar heights for waveform
const BAR_HEIGHTS = [22, 34, 28, 40, 26, 38, 30, 44, 27, 36, 31, 42, 29, 35, 33];

export function Waveform() {
  return (
    <div className="flex items-end gap-1 h-12">
      {BAR_HEIGHTS.map((height, index) => (
        <div
          key={index}
          className="w-1 bg-[#2563EB] rounded-full transition-all duration-300"
          style={{
            height: `${height}%`,
            animation: 'breath 3s ease-in-out infinite',
            animationDelay: `${index * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}
