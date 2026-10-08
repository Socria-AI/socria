# Science primitives (lib/science/) — status against the ornithology data atlas

The atlas (Socria Logos 3 · Ornithology & Birdwatching Data Atlas, October 2026)
asks for reusable scientific capabilities rather than bird-specific features,
real computation, preserved provenance, and observed data kept apart from
modelled predictions. This is what exists, what is tested, and what is not
done yet.

**Where things stand.** Sixteen pure modules in `lib/science/`, exercised by
`test/science-atlas.test.mjs` (121 checks) on seeded synthetic fixtures. Every
fixture is labelled `simulated` wherever it travels, and the species in it are
invented codes (TX-A, TX-B…), so no test claims anything about a real bird.

**Not done yet: the conversation cannot reach them.** These are library
functions. Logos's model engine does not call them yet, so asking Logos to
"fit a Poisson model to my checklist" does not use them — that is the next
step (ORN-B below). Nothing here downloads data: there are no eBird, GBIF,
Movebank or xeno-canto connectors, and none of those sources were reachable
from where this was built.

## The thirty benchmarks

"Implemented and tested" means the primitive exists and the benchmark's
behaviour is asserted in `test/science-atlas.test.mjs` on synthetic data with a
known answer. None of the thirty is yet reachable from a Logos conversation.

| ID | Objective | Status | Where |
|---|---|---|---|
| B01 | Resolve taxonomic synonyms without merging distinct taxa | Implemented and tested: versioned resolution; ambiguous names return every candidate and no pick; splits and lumps between versions reported | taxonomy.ts |
| B02 | Lookalikes with cited identification differences | Implemented and tested: a difference is shown only when both sides cite a source; unsourced traits are set aside | records.ts |
| B03 | Import checklist CSV with timestamps and coordinate uncertainty | Implemented and tested: RFC 4180 CSV read against a schema; UTC conversion; uncertainty kept | table.ts |
| B04 | Reject impossible lat/lon | Implemented and tested: rejected with the reason, never clamped; (0, 0) flagged as a likely typo | table.ts, geo.ts |
| B05 | Zero counts kept apart from missing | Implemented and tested: 0 stays 0; NA, empty and similar become null; an "X" count is not turned into a number | table.ts |
| B06 | Effort-normalised frequency with an explicit denominator | Implemented and tested: reporting rate over complete lists only, with a Wilson interval; rate per unit effort with exclusions counted | ecology.ts |
| B07 | Map without exposing obscured locations | Implemented and tested: deterministic grid generalisation with the uncertainty it adds; the export carries only the cell | geo.ts, bundle.ts |
| B08 | Months compared at matched effort | Implemented and tested: direct standardisation over effort and protocol strata; strata seen in one group are dropped and named | ecology.ts |
| B09 | Recording metadata, licence preserved | Implemented and tested: licence kept verbatim and read (Creative Commons family); unknown means ask, never free | records.ts |
| B10 | Spectrogram of a known sine | Implemented and tested: peak within a tenth of a bin; frequency, time and hop resolution stated | signal.ts |
| B11 | Synthetic sweep, endpoints verified | Implemented and tested: ridge within one bin of the analytic instantaneous frequency, linear and exponential | signal.ts |
| B12 | Clipped and silent segments flagged | Implemented and tested | signal.ts |
| B13 | Compare annotations without inventing identity | Implemented and tested: time–frequency IoU matching; human annotations required as the reference; no identity in the output | signal.ts |
| B14 | Geodesic distance between known points | Implemented and tested: Vincenty reproduces Flinders Peak → Buninyong (54 972.271 m) to the millimetre; non-convergence reported | geo.ts |
| B15 | Reject negative time intervals | Implemented and tested: no speed across a zero or negative interval; flagged | track.ts |
| B16 | Flag implausible inferred speeds | Implemented and tested: flagged for review against a caller-stated limit, never deleted | track.ts |
| B17 | Observed vs interpolated shown differently | Implemented and tested: each resampled point says whether it was observed; nothing is interpolated across a large gap | track.ts |
| B18 | Stopover in a labelled synthetic track | Implemented and tested: recall ≥ 0.95 and precision ≥ 0.9 against the labels; the thresholds and sampling interval returned with the result | track.ts |
| B19 | Weather joined by space and time with tolerance | Implemented and tested: nearest in time within both tolerances, or no match with the failing tolerance named | geo.ts |
| B20 | Poisson regression on seeded counts | Implemented and tested: IRLS with a log-effort offset; coefficients within their 95% intervals | glm.ts |
| B21 | Overdispersion, with a negative binomial comparison | Implemented and tested: Pearson dispersion, excess zeros, NB2 with θ by maximum likelihood, the boundary LR test | glm.ts |
| B22 | Occupancy from repeated synthetic surveys | Implemented and tested: ψ and p by maximum likelihood; interval coverage checked across 12 seeded worlds; one visit per site is refused as unidentifiable | occupancy.ts |
| B23 | Detection bias in raw richness | Implemented and tested: the same community looks richer with more visits; rarefaction removes the difference; Chao2 | ecology.ts |
| B24 | Spatial model cross-validated with blocked folds | Implemented and tested: random folds flatter a nearest-neighbour model by ≥ 1.3× against blocked folds | crossval.ts |
| B25 | Wing loading from mass and area | Implemented and tested | flight.ts |
| B26 | Aspect ratio with a dimensional check | Implemented and tested: units go through the dimensional analyser; an "area" in metres is refused | flight.ts |
| B27 | Idealised lift with explicit coefficient assumptions | Implemented and tested: an assumed coefficient makes the result hypothetical and says so; a measured one cites its source | flight.ts |
| B28 | Vary wing geometry and recompute | Implemented and tested | flight.ts |
| B29 | Sensitivity of predicted timing to temperature | Implemented and tested: least-squares slope with a 95% interval, labelled an association and not a causal effect; elasticities; one-at-a-time sweeps | sensitivity.ts |
| B30 | Export provenance, assumptions, uncertainty and results | Implemented and tested: deterministic bundle with schemas, provenance, licences, caveats, a "simulated" notice and a sha256 manifest | bundle.ts, provenance.ts |

## Limitations

**Methods**

- Occupancy is single-season with logit-linear covariates. Multi-season,
  false positives and Royle–Nichols abundance are not implemented.
- Distance sampling, capture–recapture, GAMs, hierarchical and Bayesian
  spatiotemporal models are not implemented.
- The GLM covers Poisson and NB2 with a log link only. There is no zero
  inflation, no random effects, and no robust or sandwich errors.
- Standard errors are Wald, and intervals use the normal quantile. For small
  samples these are optimistic.
- The STFT is plain: Hann, Hamming or rectangular windows. There is no
  mel scale and no filters, and no audio file decoding (WAV/FLAC must already
  be samples).
- Tracks interpolate linearly in latitude and longitude. That is wrong across
  the antimeridian and coarse over long gaps, which is why large gaps are
  never interpolated.
- There is no state-space smoothing and no hidden Markov movement states.

**Data and sources**

- Taxonomy matching folds case, spacing and diacritics, and nothing fuzzier.
  A misspelling resolves only through a written synonym.
- The licence reader knows the Creative Commons family by name. Anything
  else is unknown.
- No connectors and no real datasets. Nothing has been run on licensed
  real-world data. The atlas asks for that too, and it needs data obtained
  under the sources' terms.

**Interpretation**

- Flight formulas are textbook relationships, not a model of any bird.
  Coefficients must be measured, or the result is hypothetical.
- Gliding is not flapping.

## Next (ORN-B): reach them from Logos

1. **Data blocks.** A data block carries its table, schema and provenance:
   `provenance` on the model's data, and the observed / modelled / simulated
   labels shown beside values.
2. **The estimation solver.** It gains Poisson and NB fits with an offset, and
   occupancy, through the same proposal → build → solve path as every other
   model.
3. **Views.**
   - A track view: observed fixes and interpolated segments drawn differently.
   - A spectrogram view.
   - An occurrence map that draws only generalised coordinates.
4. **Formula quantities.** Wing loading and aspect ratio as derived readouts
   with units checked. This joins the formula-quantity work in the Logos 3 fix
   plan.
5. **Proposal rules.** These describe what the engine can now compute, so the
   language model proposes them instead of prose.
