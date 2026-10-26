// components/display/register.tsx — the everyday displays' figures, each
// registered beside its kind (lib/objects/display-*.ts). Imported once, by
// ObjectFigure, so wherever an object of thought is drawn its display is too.

import { registerFigure } from '@/components/objects/figures';
import { PlanFigure } from './PlanFigure';
import { VennFigure } from './VennFigure';
import { CompareFigure } from './CompareFigure';
import { DataFigure } from './DataFigure';
import { ArgumentFigure } from './ArgumentFigure';
import { DiagramFigure } from './DiagramFigure';
import { MarketFigure } from './MarketFigure';
import { WorksheetFigure } from './WorksheetFigure';
import { ExerciseFigure } from './ExerciseFigure';
import { CrossroadsFigure } from './CrossroadsFigure';
import { UntangleFigure } from './UntangleFigure';
import { GroundFigure } from './GroundFigure';
import { TimeFigure } from './TimeFigure';
import { NumberLineFigure } from './NumberLineFigure';
import { DocumentFigure } from './DocumentFigure';
import { CustomFigure } from './CustomFigure';

registerFigure('plan', PlanFigure);
registerFigure('venn', VennFigure);
registerFigure('compare', CompareFigure);
registerFigure('data', DataFigure);
registerFigure('argument', ArgumentFigure);
registerFigure('diagram', DiagramFigure);
registerFigure('market', MarketFigure);
registerFigure('worksheet', WorksheetFigure);
registerFigure('exercise', ExerciseFigure);
registerFigure('numberline', NumberLineFigure);
// a document the person attached, as it was read
registerFigure('document', DocumentFigure);
// the human-first experiences
registerFigure('crossroads', CrossroadsFigure);
registerFigure('untangle', UntangleFigure);
registerFigure('commonground', GroundFigure);
registerFigure('timemachine', TimeFigure);
// anything else, built from a few primitives
registerFigure('custom', CustomFigure);
