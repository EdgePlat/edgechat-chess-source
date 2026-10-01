import type { CSSProperties } from 'react';
import type { Piece } from 'react-chessboard/dist/chessboard/types';

// Tight source bounds remove the atlas's uneven transparent margins. Each piece
// has its own board footprint, so pawns remain as readable as the original set.
const shapes: Record<string, { x: number; y: [number, number]; w: number; h: [number, number]; width: string; height: string }> = {
  K: { x: 116, y: [8, 358], w: 192, h: [355, 355], width: '62%', height: '88%' },
  Q: { x: 484, y: [37, 381], w: 186, h: [326, 333], width: '61%', height: '85%' },
  R: { x: 824, y: [107, 452], w: 184, h: [256, 262], width: '60%', height: '73%' },
  B: { x: 1170, y: [69, 414], w: 171, h: [294, 300], width: '55%', height: '82%' },
  N: { x: 1492, y: [95, 442], w: 196, h: [268, 272], width: '65%', height: '82%' },
  P: { x: 1873, y: [143, 490], w: 153, h: [220, 224], width: '48%', height: '64%' },
};
const names: Record<string, string> = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' };

// Atlas coordinates of each bottom footprint ellipse, not the image bounds.
// Rows were rendered at different vertical offsets; calibrate both colors.
const phoneBases: Record<string, [number, number, number]> = {
  wK: [218, 286, 30], wQ: [216, 286, 40], wR: [207, 286, 52],
  wB: [186, 283, 52], wN: [201, 290, 51], wP: [174, 283, 87],
  bK: [218, 270, 4], bQ: [216, 269, 16], bR: [207, 269, 26],
  bB: [186, 268, 26], bN: [201, 275, 25], bP: [174, 267, 62],
};

export function WoodPiece({ piece, size, decorative = false, lifted = false, dragging = false }: { piece: Piece; size?: number; decorative?: boolean; lifted?: boolean; dragging?: boolean }) {
  if ((window as any).CHESS_IOS) {
    const column = 'KQRBNP'.indexOf(piece[1]);
    const row = piece[0] === 'b' ? 1 : 0;
    const [baseX, baseY] = phoneBases[piece];
    // Preserve the approved size; the crown may project above the ground square.
    const scale = .94;
    return <span className={`wood-piece-sprite phone-piece${lifted ? " is-lifted" : ""}${dragging ? " is-dragging" : ""}`} style={{width:size,height:size,"--piece-optical-y":`${(size || 44) * .145}px`,"--piece-contact-blur":`${(size || 44) * .035}px`,"--piece-cast-blur":`${(size || 44) * .085}px`,"--piece-cast-x":`${(size || 44) * .19}px`,"--piece-cast-y":`${(size || 44) * .12}px`,"--piece-shadow-alpha":row ? .29 : .36,"--piece-lift":`${(size || 44) * -.115}px`,"--piece-drag-lift":`${(size || 44) * -.205}px`} as CSSProperties}>
      {!decorative && <span className="phone-piece-shadow" aria-hidden="true"/>}
      <svg width={`${scale * 100}%`} height={`${scale * 100}%`} style={{position:"absolute",left:`${50 - baseX / 362 * scale * 100}%`,top:`calc(${50 - baseY / 362 * scale * 100}% + var(--piece-optical-y))`,transformOrigin:`${baseX / 362 * 100}% ${baseY / 362 * 100}%`}} viewBox={`${column * 362} ${row * 362} 362 362`} role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : `${row ? 'Black' : 'White'} ${names[piece[1]]}`} aria-hidden={decorative || undefined}>
        <image href="./art/pieces-overhead.png" width="2172" height="724" />
      </svg>
    </span>;
  }
  const shape = shapes[piece[1]];
  const row = piece[0] === 'b' ? 1 : 0;
  return <span className="wood-piece-sprite" style={{ width: size, height: size }}>
    <svg
      width={shape.width} height={shape.height}
      viewBox={`${shape.x} ${shape.y[row]} ${shape.w} ${shape.h[row]}`}
      preserveAspectRatio="xMidYMax meet"
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : `${row ? 'Black' : 'White'} ${names[piece[1]]}`}
      aria-hidden={decorative || undefined}
      focusable="false"
    >
      <image href="./assets/pieces-3d/wooden-staunton.png" width="2172" height="724" />
    </svg>
  </span>;
}
