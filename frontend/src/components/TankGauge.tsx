import { cmToInches, inchesToPercent, levelTone } from '../utils/units';

type Props = {
  label: string;
  levelCm: number;
};

export function TankGauge({ label, levelCm }: Props) {
  const inches = cmToInches(levelCm);
  const percent = inchesToPercent(inches);
  const tone = levelTone(percent);

  return (
    <div className="tank-card">
      <h3>{label}</h3>
      <div className="tank-shell" aria-hidden>
        <div className={`tank-fill tone-${tone}`} style={{ height: `${percent}%` }} />
      </div>
      <div className="tank-reading">
        {inches.toFixed(1)}
        <span>in</span>
      </div>
    </div>
  );
}
