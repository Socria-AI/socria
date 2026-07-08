'use client';

export function ChoiceChips({
  choices,
  onPick,
  disabled = false,
}: {
  choices: string[];
  onPick: (text: string) => void;
  disabled?: boolean;
}) {
  if (!choices.length) return null;
  return (
    <div className="choice-chips" role="group" aria-label="Suggested answers">
      <div className="choice-chips-label">Pick one, or type your own</div>
      <div className="choice-chips-row">
        {choices.map((c, i) => (
          <button
            key={i}
            type="button"
            className="choice-chip"
            disabled={disabled}
            style={{ animationDelay: `${i * 55}ms` }}
            onClick={() => onPick(c)}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
