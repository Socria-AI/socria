// components/display/register.tsx — the everyday displays' figures, each
// registered beside its kind (lib/objects/display-*.ts). Imported once, by
// ObjectFigure, so wherever an object of thought is drawn its display is too.

import { registerFigure } from '@/components/objects/figures';
import { PlanFigure } from './PlanFigure';
import { VennFigure } from './VennFigure';
import { CompareFigure } from './CompareFigure';

registerFigure('plan', PlanFigure);
registerFigure('venn', VennFigure);
registerFigure('compare', CompareFigure);
