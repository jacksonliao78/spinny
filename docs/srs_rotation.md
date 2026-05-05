# Rotation and kicks (Spinny)

## References

- **JLSTZ quarter-turns:** [Hard Drop SRS](https://harddrop.com/wiki/SRS) / [four.lol overview](https://four.lol/srs/kicks-overview) (Guideline).
- **I quarter-turns (SRS+):** [Hard Drop “Arika” I table](https://harddrop.com/wiki/SRS#Arika_SRS), aligned with [TETR.IO SRS+](https://tetris.wiki/TETR.IO#Rotation_System) (symmetric I kicks).
- **180° kicks:** TETR.IO default six-test pattern (JLSTZ + I share the same offsets in this implementation); see community notes (e.g. [tetra-tools discussion](https://github.com/wirelyre/tetra-tools/issues/4)).

## Implementation

- Tables: [`engine/srs.ts`](../engine/srs.ts).
- Kick tests use the same placement predicate as ordinary rotation: board collision plus [`respectsViewBounds`](../engine/game/spawn_bounds.ts). The top spawn buffer can be out of view, but horizontal hidden columns are not valid landing positions.
- **A** = 180° (see in-game tips).
