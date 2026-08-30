// The whole assertion vocabulary these suites need.
//
// Deliberately tiny. Each suite reports its own tally and the runner adds
// them up; a failure prints what was expected against what arrived, because
// a bare "assertion failed" costs more time than it saves.

export function suite(name) {
  let pass = 0;
  const failures = [];

  const ok = (label, cond, detail = '') => {
    if (cond) pass++;
    else failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  };

  const eq = (label, got, want) =>
    ok(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

  const near = (label, got, want, tol = 1e-9) =>
    ok(
      label,
      typeof got === 'number' && Math.abs(got - want) < tol,
      `got ${got}, want ${want} (±${tol})`
    );

  const isNull = (label, got) => ok(label, got === null, `got ${JSON.stringify(got)}`);

  return {
    ok,
    eq,
    near,
    isNull,
    report: () => ({ name, pass, failures }),
  };
}
