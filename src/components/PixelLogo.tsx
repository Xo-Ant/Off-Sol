import { useMemo } from 'react';

const BITMAP = [
  " 111   11111  11111         1111   111   1    ",
  "1   1  1      1            1      1   1  1    ",
  "1   1  111    111    111    111   1   1  1    ",
  "1   1  1      1                1  1   1  1    ",
  " 111   1      1            1111    111   11111"
];

const COLORS = ['#ff00ff', '#00ffff', '#00ff00', '#ffff00', '#ff4500', '#ff00aa'];

export default function PixelLogo() {
  const pixels = useMemo(() => {
    const pts = [];
    for (let y = 0; y < BITMAP.length; y++) {
      for (let x = 0; x < BITMAP[y].length; x++) {
        if (BITMAP[y][x] === '1') {
          pts.push({
            id: `${x}-${y}`,
            x,
            y,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            delay: Math.random() * 2,
            duration: 0.5 + Math.random() * 1.5,
          });
        }
      }
    }
    return pts;
  }, []);

  const cols = BITMAP[0].length;
  const rows = BITMAP.length;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: '2px', // Slight gap for individual pixel look
      width: '100%',
      maxWidth: '320px',
      margin: '0 auto',
      padding: '10px'
    }}>
      {Array.from({ length: rows * cols }).map((_, i) => {
        const x = i % cols;
        const y = Math.floor(i / cols);
        const active = pixels.find(p => p.x === x && p.y === y);
        
        return (
          <div key={i} style={{
            aspectRatio: '1/1',
            backgroundColor: active ? active.color : 'transparent',
            animation: active ? `pixel-blink ${active.duration}s infinite alternate ${active.delay}s` : 'none',
            boxShadow: active ? `0 0 6px ${active.color}` : 'none',
            borderRadius: '1px' // Slight rounding so it looks like an LED
          }} />
        );
      })}
    </div>
  );
}
