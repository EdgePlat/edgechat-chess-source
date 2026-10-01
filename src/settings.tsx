/* The gear, and what is behind it.
 *
 * The button is the icon alone, the size of the host's audio toggle (38px, its DOM sibling) with a
 * squircle corner. Appearance is two buttons side by side — the one that
 * matches what you are looking at is the one that reads as taken, so there is no third "follow the app"
 * row to explain. Difficulty is six named levels rather than a dropdown that repeated its own value in
 * the label beside it and a note long enough to wrap and clip.
 */
import { useRef } from 'react';
import { Settings as Gear, X } from 'lucide-react';
import type { Appearance } from './saved';

const LEVELS = [
  { elo: 1320, name: 'Relaxed' }, { elo: 1600, name: 'Casual' }, { elo: 2000, name: 'Challenging' },
  { elo: 2400, name: 'Expert' }, { elo: 2800, name: 'Master' }, { elo: 3190, name: 'Maximum' },
];

export default function GameSettings({ appearance, theme, onAppearance, elo, onElo }: {
  appearance: Appearance;
  theme: 'light' | 'dark';           // what is actually on screen, which is what the two buttons show
  onAppearance: (value: Appearance) => void;
  elo?: number;                      // omitted in a game against a person: there is no strength to set
  onElo?: (value: number) => void;
}) {
  const box = useRef<HTMLDetailsElement>(null);
  const close = () => { if (box.current) box.current.open = false; };
  return (
    <details className="wood-settings-menu" ref={box}>
      <summary aria-label="Settings"><Gear size={17} /></summary>
      <div className="wood-settings-panel" role="group" aria-label="Settings">
        <div className="wood-settings-heading">
          <h2>Settings</h2>
          <button type="button" className="wood-settings-close" aria-label="Close settings"
            onClick={close}><X size={17} /></button>
        </div>

        <section className="wood-settings-section">
          <div className="wood-settings-label"><label id="chess-appearance-label">Appearance</label></div>
          <div className="wood-settings-pair" role="radiogroup" aria-labelledby="chess-appearance-label">
            {(['light', 'dark'] as const).map(value => (
              <button key={value} type="button" role="radio" aria-checked={theme === value}
                onClick={() => onAppearance(value)}>{value === 'light' ? 'Light' : 'Dark'}</button>
            ))}
          </div>
        </section>

        {typeof elo === 'number' && onElo && (
          <section className="wood-settings-section">
            <div className="wood-settings-label"><label id="chess-difficulty-label">Difficulty</label></div>
            <div className="wood-settings-levels" role="radiogroup" aria-labelledby="chess-difficulty-label">
              {!LEVELS.some(level => level.elo === elo) && (
                <button type="button" role="radio" aria-checked><strong>Custom</strong><span>Elo {elo}</span></button>
              )}
              {LEVELS.map(level => (
                <button key={level.elo} type="button" role="radio" aria-checked={elo === level.elo}
                  onClick={() => onElo(level.elo)}><strong>{level.name}</strong><span>Elo {level.elo}</span></button>
              ))}
            </div>
          </section>
        )}
      </div>
    </details>
  );
}
